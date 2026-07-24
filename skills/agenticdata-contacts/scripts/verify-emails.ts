/**
 * verify-emails.ts — OptimaVerifier email verification (PRIMARY gate).
 *
 * Every email must pass through here before a campaign upload. Gate:
 *   valid     -> sendable
 *   invalid   -> dropped
 *   catch-all -> NOT sendable yet; flagged for cross-check vs a 2nd verifier (default: AgenticData)
 *   unknown   -> held (do not send yet)
 *
 * Usage:
 *   npm run check-credits
 *   npm run verify-emails -- --email=someone@company.com          # single smoke test (1 credit)
 *   npm run verify-emails -- --in=contacts.csv --out=verified.csv # bulk verify a CSV
 *   optional: --email-col=email  --job=my-job-name
 *
 * Docs: references/optimaverifier-api.md  (base https://app.optimaverifier.com/api/v1, Bearer auth)
 * NOTE: bulk response field names (job id, results shape) are handled defensively — confirm against a
 * real run and tighten if needed.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { requireKey, args, parseCsv, toCsv, sleep } from "../../../lib/env.js";
import { upsert, slug, editorUrl, TableMissingError, explainMissing } from "../../../lib/supabase.js";

const BASE = "https://app.optimaverifier.com/api/v1";
const KEY = requireKey("OPTIMAVERIFIER_API_KEY");

async function ov(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`OptimaVerifier ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

/** valid | invalid | catch-all | unknown  ->  gate decision */
function gate(status: string): { sendable: boolean; note: string } {
  switch ((status || "").toLowerCase()) {
    case "valid": return { sendable: true, note: "" };
    case "invalid": return { sendable: false, note: "dropped: invalid" };
    case "catch-all":
    case "catch_all": return { sendable: false, note: "catch-all: needs cross-check (AgenticData)" };
    case "unknown": return { sendable: false, note: "unknown: hold, re-verify later" };
    default: return { sendable: false, note: `unrecognized status: ${status}` };
  }
}

async function checkCredits() {
  const c = await ov("/credits");
  console.log("Credit balance:", c.balance ?? c.credits ?? JSON.stringify(c));
}

async function verifySingle(email: string) {
  const r = await ov("/verifications/single", { method: "POST", body: JSON.stringify({ email }) });
  const status = r.status ?? r.result ?? "unknown";
  const g = gate(status);
  console.log(`${email} -> ${status}  (${g.sendable ? "SENDABLE" : g.note})`);
  if (r.credits_remaining != null) console.log("credits_remaining:", r.credits_remaining);
}

async function verifyBulk(emails: string[], jobName: string): Promise<Map<string, string>> {
  console.log(`Submitting ${emails.length} emails to OptimaVerifier bulk...`);
  const submit = await ov("/verifications/bulk", {
    method: "POST",
    body: JSON.stringify({ emails, job_name: jobName }),
  });
  const jobId = submit.job_id ?? submit.id ?? submit.jobId ?? submit.job?.id;
  if (!jobId) throw new Error(`Could not find job id in bulk response: ${JSON.stringify(submit).slice(0, 300)}`);
  console.log(`Job ${jobId} queued. Polling...`);

  // Poll until completed
  for (let i = 0; i < 600; i++) {
    const job = await ov(`/verifications/job/${jobId}`);
    const status = (job.status ?? "").toLowerCase();
    const pct = job.progress_percentage ?? job.progress ?? "";
    process.stdout.write(`\r  status=${status} ${pct !== "" ? pct + "%" : ""}   `);
    if (status === "completed" || status === "complete" || status === "done") break;
    await sleep(3000);
  }
  console.log("");

  // Page through results
  const map = new Map<string, string>();
  for (let page = 1; page < 100000; page++) {
    const r = await ov(`/verifications/job/${jobId}/results?page=${page}&per_page=100`);
    const items: any[] = r.results ?? r.data ?? r.items ?? [];
    if (!items.length) break;
    for (const it of items) {
      const em = (it.email ?? it.address ?? "").toLowerCase();
      const st = it.status ?? it.result ?? "unknown";
      if (em) map.set(em, st);
    }
    if (items.length < 100) break;
  }
  return map;
}

async function main() {
  const a = args();

  if (a.credits) return checkCredits();
  if (typeof a.email === "string") return verifySingle(a.email);

  const inPath = a.in as string;
  const outPath = a.out as string;
  if (!inPath || !outPath) {
    console.error("Usage: --in=contacts.csv --out=verified.csv [--email-col=email] [--job=name]  |  --email=a@b.com  |  --credits");
    process.exit(1);
  }
  const emailCol = (a["email-col"] as string) || "email";
  const jobName = (a.job as string) || `krishna-gtm-${inPath.split("/").pop()}`.slice(0, 255);

  const rows = parseCsv(readFileSync(inPath, "utf8"));
  const emails = Array.from(new Set(
    rows.map((r) => (r[emailCol] || "").toLowerCase().trim()).filter(Boolean)
  ));
  if (!emails.length) { console.error(`No emails found in column "${emailCol}".`); process.exit(1); }

  const statusMap = await verifyBulk(emails, jobName);

  const out = rows.map((r) => {
    const em = (r[emailCol] || "").toLowerCase().trim();
    const status = statusMap.get(em) || "unknown";
    const g = gate(status);
    let sendable = g.sendable, note = g.note;
    // Catch-all cross-check: if the email was found + BounceBan-verified VALID by AI Ark, rescue it.
    const s = status.toLowerCase().replace("_", "-");
    if (!sendable && (s === "catch-all" || s === "unknown") && /VALID/i.test(r.ai_ark_status || "")) {
      sendable = true; note = "rescued: AI Ark source-verified VALID";
    }
    return { ...r, email_status: status, sendable: sendable ? "yes" : "no", verify_note: note };
  });

  const kept = out.filter((r) => r.sendable === "yes").length;
  const counts = out.reduce((m: Record<string, number>, r) => ((m[r.email_status] = (m[r.email_status] || 0) + 1), m), {});
  writeFileSync(outPath, toCsv(out));
  console.log(`\nDone. ${kept}/${out.length} sendable. Status counts:`, counts);
  console.log(`Wrote ${outPath}`);
  const catchAll = out.filter((r) => r.email_status.toLowerCase().replace("_", "-") === "catch-all").length;
  if (catchAll) console.log(`Note: ${catchAll} catch-all rows need a 2nd-verifier cross-check (AI Ark) before sending.`);

  // Optional: persist straight to Supabase (contacts table), tagged with client/segment/source.
  if (a.push) {
    const client = slug(String(a.client || ""));
    if (!client) { console.error('\n--push needs --client="..." (and optionally --segment --market --size --source).'); process.exit(1); }
    const tag = {
      client,
      segment: slug(String(a.segment || "")) || null,
      target_market: slug(String(a.market || "")) || null,
      company_size: slug(String(a.size || "")) || null,
      list_source: slug(String(a.source || "")) || null,
    };
    let recs = out.map((r: Record<string, string>) => ({
      ...tag,
      email: (r[emailCol] || "").toLowerCase().trim(),
      first_name: r.first_name || null, last_name: r.last_name || null,
      company_name: r.company_name || null, company_domain: r.company_domain || null,
      title: r.title || null, linkedin_url: r.linkedin_url || null,
      email_status: r.email_status || null, sendable: r.sendable === "yes",
      find_source: r.find_source || null, verify_note: r.verify_note || null,
    })).filter((r) => r.email);
    if (a["only-sendable"]) recs = recs.filter((r) => r.sendable);
    try {
      const n = await upsert("contacts", recs, "client,email");
      console.log(`\n✓ Pushed ${n} contacts to Supabase (client "${client}"). Preview: ${editorUrl()}`);
    } catch (e) {
      if (e instanceof TableMissingError) explainMissing("contacts", "supabase/schema-contacts.sql");
      else console.error("\nPush failed:", (e as Error).message);
    }
  }
}

main().catch((e) => { console.error("\n" + (e?.message || e)); process.exit(1); });
