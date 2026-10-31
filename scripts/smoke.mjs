// End-to-end smoke test: drives every step + gate over HTTP. Needs api + worker running with DEMO_MODE=on.
// SMOKE_URL=http://localhost:3000 SMOKE_EMAIL=.. SMOKE_PASSWORD=.. node scripts/smoke.mjs
const B = process.env.SMOKE_URL || "http://localhost:3000"; let cookie = "";
async function call(method, path, body) {
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body && JSON.stringify(body) });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const j = await r.json().catch(() => null); return { status: r.status, j };
}
const ok = (c, msg) => { if (!c) { console.error("FAIL:", msg); process.exit(1); } console.log("✓", msg); };
async function runJob(clientId, campaignId, type, input = {}) {
  const r = await call("POST", "/api/jobs", { clientId, campaignId, type, input });
  ok(r.status === 202, `enqueue ${type} (${r.status} ${JSON.stringify(r.j?.error ?? "")})`);
  for (let i = 0; i < 60; i++) { const j = (await call("GET", `/api/jobs/${r.j.jobId}`)).j; if (["done", "error", "cancelled"].includes(j.status)) { ok(j.status === "done", `${type} ${j.status} ${j.result?.error ?? ""}`); return j; } await new Promise((s) => setTimeout(s, 500)); }
  ok(false, `${type} timed out`);
}
const approve = (clientId, campaignId, stage) => call("POST", "/api/approvals", { clientId, campaignId, stage, decision: "approved" });

ok((await call("GET", "/api/clients")).status === 401, "401 without login");
ok((await call("POST", "/auth/login", { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD })).status === 200, "login");
const me = (await call("GET", "/auth/me")).j; ok(me.demoMode === "on", "me + demoMode on");
const cl = await call("POST", "/api/clients", { name: "Scriptlens", description: "AI video scripts" }); ok(cl.status === 201, "create client");
const C = cl.j.id ?? cl.j.client?.id;
ok((await call("POST", "/api/jobs", { clientId: C, type: "competitors" })).j?.error?.code === "GATE", "competitors gated before icp");
await runJob(C, undefined, "research");
ok((await approve(C, undefined, "icp")).status < 300, "approve icp");
await runJob(C, undefined, "competitors");
ok((await approve(C, undefined, "competitors")).status < 300, "approve competitors");
await runJob(C, undefined, "segments");
const seg = (await call("GET", `/api/clients/${C}`)).j.profile.angles.segments[0];
const camp = await call("POST", `/api/clients/${C}/campaigns`, { name: seg.name, angle: seg.angle, segment: seg.name, targeting: { dataset: "saas", industry: "software" } });
ok(camp.status === 201 && camp.j.targeting?.dataset === "saas", "create campaign with targeting");
const K = camp.j.id;
ok((await call("POST", "/api/jobs", { clientId: C, campaignId: K, type: "source", input: { dataset: "saas", filters: {} } })).j?.error?.needs === "strategy", "source gated before strategy");
ok((await approve(C, K, "strategy")).status < 300, "approve strategy");
ok((await approve(C, K, "send")).status === 400, "send cannot be approved directly");
await runJob(C, K, "source", { dataset: "saas", filters: { industry: "software" } });
ok((await approve(C, K, "companies")).status < 300, "approve companies");
await runJob(C, K, "find", { titles: ["CEO"] });
ok((await approve(C, K, "contacts")).status < 300, "approve contacts");
const v = await runJob(C, K, "verify"); console.log("  counts", JSON.stringify(v.result.counts));
await runJob(C, K, "copy");
ok((await approve(C, K, "copy")).status < 300, "approve copy");
const cv = (await call("GET", `/api/campaigns/${K}`)).j;
ok(cv.companies.length > 0 && cv.contacts.length > 0 && cv.latestJobs?.copy?.status === "done", `campaign view: ${cv.companies.length} companies, ${cv.contacts.length} contacts, latestJobs per campaign`);
const lead = cv.contacts[0];
ok((await call("PATCH", `/api/campaigns/${K}/leads/${lead.id}`, { personalization: { ...lead.personalization, body: "Edited body" } })).status === 200, "edit lead body");
const d = await call("POST", `/api/campaigns/${K}/draft`); ok(d.status === 202, "draft enqueued");
for (let i = 0; i < 60; i++) { const j = (await call("GET", `/api/jobs/${d.j.jobId}`)).j; if (j.status !== "queued" && j.status !== "running") { ok(j.status === "done" && j.result.demo, `draft ${j.status} → ${j.result.externalCampaignId}, uploaded ${j.result.uploaded}`); break; } await new Promise((s) => setTimeout(s, 500)); }
// SSE on a finished job: replays log then closes
const sse = await fetch(`${B}/api/jobs/${d.j.jobId}/events`, { headers: { cookie } }); const txt = await sse.text();
ok(txt.includes("event: log") && txt.includes("event: status"), "SSE stream replays log + status");
// re-approving an upstream stage revokes later ones
await approve(C, K, "strategy");
ok((await call("POST", "/api/jobs", { clientId: C, campaignId: K, type: "find" })).j?.error?.needs === "companies", "re-approving strategy revoked companies");
console.log("SMOKE OK");
