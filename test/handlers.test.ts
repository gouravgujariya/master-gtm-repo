import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgres://u@localhost:5432/unused"; // config() validates; no DB is touched
process.env.BULK_DIR = "fixtures/bulk-sample";
import { keysCtx } from "../src/core/ctx.ts";
import { AppError } from "../src/core/errors.ts";
import { sourceCore, findCore, verifyCore, draftCore, plusvibeSeq } from "../src/jobs/handlers.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

test("source: reads config().BULK_DIR, skips already-used domains", async () => {
  const lines: string[] = [];
  const r = await sourceCore(keysCtx({}, (m) => lines.push(m)), { dataset: "saas", filters: { industry: "analytics" }, limit: 3 }, new Set(["northwindanalytics.example"]));
  assert.deepEqual(r.companies.map((c) => c.domain), ["bluefinmetrics.example", "fjorddataworks.example", "lumendashboards.example"]);
  assert.equal(r.companies[0].listSource, "bulk-saas");
  assert.ok(lines.some((l) => /northwindanalytics.example: already used/.test(l)));
  const local = await sourceCore(keysCtx({}), { dataset: "local", filters: { category: "dentist", state: "TX" } });
  assert.deepEqual(local.companies.map((c) => c.domain), ["smilebrightdental.example", "lonestarsmiles.example"]);
});

test("source: paid lookalike refused without allowPaid + reason (no fetch)", async () => {
  globalThis.fetch = (async () => { throw new Error("should not fetch"); }) as typeof fetch;
  const ctx = keysCtx({ AI_ARK_API_KEY: "k" });
  await assert.rejects(sourceCore(ctx, { dataset: "lookalike", seedDomains: ["a.com"] }), (e: any) => e instanceof AppError && e.code === "BULK_FIRST");
  await assert.rejects(sourceCore(ctx, { dataset: "lookalike", seedDomains: ["a.com"], allowPaid: true }), AppError);
  globalThis.fetch = (async () => json({ content: [{ summary: { name: "L" }, link: { domain: "www.l.com" } }] })) as typeof fetch;
  const r = await sourceCore(ctx, { dataset: "lookalike", seedDomains: ["a.com"], allowPaid: true, reason: "bulk returned 0" });
  assert.deepEqual(r.companies.map((c) => [c.domain, c.listSource]), [["l.com", "ai-ark-lookalike"]]);
});

test("find: waterfall order kept per company, find_source preserved", async () => {
  const hits: string[] = [];
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    hits.push(u.includes("agenticdata") ? "agenticdata" : "ai-ark");
    if (u.includes("agenticdata")) return json({ results: u.includes("a.com") ? [{ first_name: "A", job_title: "CEO", primary_email: "A@a.com" }] : [] });
    if (u.endsWith("/v1/people")) return json({ trackId: "t", content: [{ first_name: "B", last_name: "C", job_title: "Owner" }] });
    if (u.includes("/inquiries")) return json({ content: [{ state: "DONE", input: { firstname: "B", lastname: "C" }, output: [{ domainType: "SMTP", status: "VALID", address: "b@b.com" }] }] });
    return json({});
  }) as typeof fetch;
  const r = await findCore(keysCtx({ ADATA_API_KEY: "k", AI_ARK_API_KEY: "k" }), [{ domain: "a.com" }, { domain: "b.com" }]);
  assert.deepEqual(r.contacts.map((c) => [c.email, c.findSource]), [["a@a.com", "agenticdata"], ["b@b.com", "ai-ark"]]);
  assert.equal(r.contacts[1].aiArkStatus, "SMTP/VALID");
  assert.deepEqual(hits.slice(0, 3), ["agenticdata", "agenticdata", "ai-ark"]); // a.com: agenticdata hit; b.com: agenticdata miss → ai-ark
});

test("find: no finder key at all → MissingKeyError (so DEMO_MODE=auto can fall back)", async () => {
  await assert.rejects(findCore(keysCtx({}), [{ domain: "a.com" }]), /Missing ADATA_API_KEY/);
});

test("verify: sendable only for valid; catch-all held without AI Ark key; counts", async () => {
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.endsWith("/verifications/bulk")) return json({ id: "J" });
    if (u.endsWith("/verifications/job/J")) return json({ status: "completed" });
    return json({ data: [{ email: "a@x.com", status: "valid" }, { email: "b@x.com", status: "invalid" }, { email: "c@x.com", status: "catch_all" }] });
  }) as typeof fetch;
  const r = await verifyCore(keysCtx({ OPTIMAVERIFIER_API_KEY: "k" }), [{ email: "a@x.com" }, { email: "b@x.com" }, { email: "C@x.com" }]);
  assert.deepEqual(r.contacts.map((c) => [c.email, c.sendable]), [["a@x.com", true], ["b@x.com", false], ["c@x.com", false]]);
  assert.deepEqual(r.counts, { sendable: 1, dropped: 1, held: 1 });
});

test("draft: refused with 0 sendable, before any API call", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return json({}); }) as typeof fetch;
  await assert.rejects(draftCore(keysCtx({ PLUSVIBE_API_KEY: "k" }), [{ email: "a@x.com", sendable: "no" }], { subject: "quick idea", sequence: [{ step: 1, waitDays: 0, body: "x" }] }, "C"), /No sendable leads/);
  assert.equal(calls, 0);
});

test("plusvibeSeq: step 1 body → {{email_body}} only when leads carry a body; default schedule", () => {
  const s = plusvibeSeq({ subject: "quick idea", sequence: [{ step: 1, waitDays: 0, body: "one" }, { step: 2, waitDays: 3, body: "two" }] }, true);
  assert.deepEqual(s.sequences.map((x: any) => [x.step, x.wait_time, x.variations[0].subject, x.variations[0].body]), [[1, 0, "quick idea", "{{email_body}}"], [2, 3, "", "two"]]);
  assert.ok(s.schedule.timezone);
  assert.equal(plusvibeSeq({ subject: "a b", sequence: [{ step: 1, waitDays: 0, body: "one" }] }, false).sequences[0].variations[0].body, "one");
});
