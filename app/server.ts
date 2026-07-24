/**
 * server.ts — local operating dashboard for the GTM repo.
 *   npm run app   → http://localhost:4317
 *
 * Runs on YOUR machine so it can use .env keys, the local bulk CSVs, and long-running jobs.
 * Serves the dashboard, reads Supabase, and runs pipeline scripts as background jobs.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../lib/env.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = loadEnv();
const PORT = Number(process.env.PORT) || 4317;
// Shared team password. If set (cloud), /api/* requires the x-app-key header. If unset (local), open.
const AUTH = ENV.APP_PASSWORD || process.env.APP_PASSWORD || "";

// ---- Supabase read helper ----
async function sb(path: string): Promise<any> {
  const url = (ENV.SUPABASE_URL || "").replace(/\/$/, "");
  const key = ENV.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return { error: "Supabase not configured" };
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { error: t.slice(0, 200) }; }
}

// ---- npm-script job runner (whitelisted) ----
const COMMANDS = new Set([
  "bulk-list", "agenticdata-find", "ai-ark", "coldiq", "verify-emails",
  "plusvibe-upload", "supabase-push", "supabase-push-companies", "supabase-upload",
  "new-client", "check-credits",
]);
type Job = { id: string; cmd: string; status: "running" | "done" | "error"; output: string; code: number | null; started: number };
const jobs = new Map<string, Job>();
let jobSeq = 0;

function runJob(cmd: string, argv: string[]): Job {
  const id = `job-${++jobSeq}`;
  const job: Job = { id, cmd, status: "running", output: `$ npm run ${cmd} -- ${argv.join(" ")}\n`, code: null, started: Date.now() };
  jobs.set(id, job);
  // --silent hides npm's own boilerplate (the "> script" echo + warnings) so users see just the real output
  const child = spawn("npm", ["--silent", "run", cmd, "--", ...argv], { cwd: ROOT, env: process.env });
  const onData = (d: Buffer) => { job.output += d.toString(); };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => { job.code = code; job.status = code === 0 ? "done" : "error"; });
  child.on("error", (e) => { job.output += `\n${e.message}`; job.status = "error"; job.code = 1; });
  return job;
}

// ---- client folders ----
function listClients(): { slug: string; name: string; stage: string }[] {
  const dir = resolve(ROOT, "profiles");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => {
    const p = resolve(dir, f);
    return statSync(p).isDirectory() && f !== "_TEMPLATE-client" && !f.startsWith(".");
  }).map((slug) => {
    let name = slug, stage = "";
    const ctx = resolve(dir, slug, "context.md");
    if (existsSync(ctx)) {
      const t = readFileSync(ctx, "utf8");
      name = (t.match(/^#\s*(.+?)\s*—/m)?.[1]) || slug;
      stage = (t.match(/Current stage:\s*(.+)/)?.[1] || "").trim();
    }
    return { slug, name, stage };
  });
}

// merge local client folders with distinct clients already in Supabase (survive cloud redeploys)
async function allClients() {
  const map = new Map(listClients().map((c) => [c.slug, c]));
  try {
    const [ct, co] = await Promise.all([sb("contacts?select=client"), sb("companies?select=client")]);
    const extra = new Set([...(Array.isArray(ct) ? ct : []), ...(Array.isArray(co) ? co : [])].map((r: any) => r.client).filter(Boolean));
    for (const slug of extra) if (!map.has(slug)) map.set(slug, { slug, name: slug, stage: "" });
  } catch { /* Supabase optional */ }
  return [...map.values()];
}

function envStatus() {
  const keys = ["ADATA_API_KEY", "AI_ARK_API_KEY", "COLDIQ_API_KEY", "OPTIMAVERIFIER_API_KEY", "APIFY_TOKEN", "SERPER_API_KEY", "FIRECRAWL_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PLUSVIBE_API_KEY"];
  return keys.map((k) => ({ key: k, present: !!(ENV[k] && ENV[k].length) }));
}

// ---- helpers ----
const json = (res: any, code: number, body: any) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
function readBody(req: any): Promise<any> {
  return new Promise((r) => { let b = ""; req.on("data", (c: any) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); });
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://localhost:${PORT}`);
  const p = u.pathname;
  try {
    if (p === "/" || p === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(readFileSync(resolve(ROOT, "app/index.html")));
    }
    if (p === "/workflow") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(readFileSync(resolve(ROOT, "workflow/index.html")));
    }
    // shared-password gate for all /api routes (only when APP_PASSWORD is set, i.e. cloud)
    if (p.startsWith("/api/") && AUTH) {
      if ((req.headers["x-app-key"] || "") !== AUTH) return json(res, 401, { error: "unauthorized" });
    }
    if (p === "/api/status") return json(res, 200, { env: envStatus(), clients: listClients().length, authRequired: !!AUTH });
    if (p === "/api/clients") return json(res, 200, await allClients());
    if (p === "/api/companies") return json(res, 200, await sb(`companies?select=company_name,domain,industry,company_size,location,list_source&client=eq.${u.searchParams.get("client")}&order=created_at.desc&limit=200`));
    if (p === "/api/contacts") return json(res, 200, await sb(`contacts?select=email,first_name,last_name,company_name,title,email_status,sendable,find_source,list_source&client=eq.${u.searchParams.get("client")}&order=created_at.desc&limit=200`));

    if (p === "/api/run" && req.method === "POST") {
      const body = await readBody(req);
      if (!COMMANDS.has(body.cmd)) return json(res, 400, { error: `command not allowed: ${body.cmd}` });
      const argv: string[] = [];
      for (const [k, v] of Object.entries(body.args || {})) {
        if (v === true) argv.push(`--${k}`);
        else if (v !== "" && v != null) argv.push(`--${k}=${v}`);
        // ensure any referenced folder exists (cloud filesystem starts empty)
        if (typeof v === "string" && v.includes("/")) { try { mkdirSync(resolve(ROOT, dirname(v)), { recursive: true }); } catch {} }
      }
      // Draft stage needs a sequence file — drop in the default if the client has none yet.
      if (body.cmd === "plusvibe-upload" && body.args?.sequence) {
        const seqPath = resolve(ROOT, body.args.sequence);
        if (!existsSync(seqPath)) { try { mkdirSync(dirname(seqPath), { recursive: true }); writeFileSync(seqPath, readFileSync(resolve(ROOT, "app/default-sequence.json"))); } catch {} }
      }
      const job = runJob(body.cmd, argv);
      return json(res, 200, { jobId: job.id });
    }
    if (p.startsWith("/api/job/")) {
      const job = jobs.get(p.split("/").pop() || "");
      if (!job) return json(res, 404, { error: "no such job" });
      return json(res, 200, { status: job.status, output: job.output, code: job.code });
    }
    json(res, 404, { error: "not found" });
  } catch (e: any) { json(res, 500, { error: String(e?.message || e) }); }
});

server.listen(PORT, () => {
  console.log(`\n  GTM dashboard → http://localhost:${PORT}\n  (Ctrl+C to stop)\n`);
});
