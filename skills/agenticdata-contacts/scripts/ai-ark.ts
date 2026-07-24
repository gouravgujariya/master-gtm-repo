/**
 * ai-ark.ts — AI Ark client: company/lookalike search, async email-finder, and catch-all cross-check.
 *
 * Modes:
 *   npm run ai-ark -- --credits
 *   npm run ai-ark -- --find --first=Jane --last=Doe --domain=acme.com      # single person find + verify
 *   npm run ai-ark -- --verify-catchall --in=verified.csv --out=rechecked.csv
 *   npm run ai-ark -- --companies --lookalike=stripe.com,plaid.com [--size=25]
 *
 * Base https://api.ai-ark.com/api/developer-portal  | header X-TOKEN | see references/ai-ark-api.md
 * NOTE: the people-search filter DSL (account.domain / contact.fullName) is best-effort — the first live
 * --find run may need a small DSL tweak; the script logs the raw response to make that easy.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { requireKey, loadEnv, args, parseCsv, toCsv, sleep } from "../../../lib/env.js";
import { upsert, slug, TableMissingError, explainMissing } from "../../../lib/supabase.js";

const BASE = "https://api.ai-ark.com/api/developer-portal";
const KEY = requireKey("AI_ARK_API_KEY");

async function ark(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-TOKEN": KEY, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`AI Ark ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

async function credits(): Promise<number> {
  const c = await ark("/v1/payments/credits");
  return c.total ?? c.balance ?? 0;
}

function normalizeLinkedin(url: string): string {
  let u = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return `https://www.${u}`;
}

/**
 * People search. Prefer linkedin (exact match) when available; else domain + fullName.
 * DSL per AI Ark docs: filters are { any: { include: [...] } }; text filters use { mode, content:[...] }.
 */
async function searchPeople(opts: { domain?: string; fullName?: string; linkedin?: string; seniority?: string[] }, size = 5): Promise<{ trackId: string; people: any[] }> {
  const contact: any = {};
  if (opts.linkedin) contact.linkedin = { any: { include: [normalizeLinkedin(opts.linkedin)] } };
  if (opts.fullName) contact.fullName = { any: { include: { mode: "SMART", content: [opts.fullName] } } };
  if (opts.seniority?.length) contact.seniority = { any: { include: opts.seniority } };
  const account: any = {};
  if (opts.domain) account.domain = { any: { include: [opts.domain] } };

  const body: any = { page: 0, size };
  if (Object.keys(account).length) body.account = account;
  if (Object.keys(contact).length) body.contact = contact;

  const r = await ark("/v1/people", { method: "POST", body: JSON.stringify(body) });
  return { trackId: r.trackId, people: r.content ?? [] };
}

// AI Ark's email-finder REQUIRES a webhook field even though we retrieve results by polling /inquiries.
// Override with a real endpoint via AI_ARK_WEBHOOK in .env if you want push delivery too.
const WEBHOOK = (loadEnv().AI_ARK_WEBHOOK || "https://webhook.site/00000000-0000-0000-0000-000000000000");

/** Submit email-finder for a trackId, then poll inquiries until DONE. Resilient to transient poll errors. */
async function findEmails(trackId: string): Promise<any[]> {
  try { await ark("/v1/people/email-finder", { method: "POST", body: JSON.stringify({ trackId, webhook: WEBHOOK }) }); }
  catch { /* may already be submitted / auto-refunded; still try to read results */ }
  let last: any[] = [];
  for (let i = 0; i < 20; i++) {
    await sleep(2500);
    try {
      const r = await ark(`/v1/people/email-finder/${trackId}/inquiries?page=0&size=100`);
      const content: any[] = r.content ?? [];
      if (content.length) last = content;
      if (content.length && content.every((c) => (c.state || "").toUpperCase() === "DONE")) return content;
    } catch { /* transient (job warming / 403 refund) — retry */ }
  }
  return last;
}

/** Best verified email from an inquiry's output[]: prefer SMTP+VALID, else CATCH_ALL. */
function bestEmail(inquiry: any): { email: string | null; domainType: string; status: string } {
  const outs: any[] = inquiry?.output ?? [];
  const smtp = outs.find((o) => (o.domainType || "").toUpperCase() === "SMTP" && (o.status || "").toUpperCase() === "VALID");
  if (smtp) return { email: smtp.address, domainType: "SMTP", status: "VALID" };
  const any = outs.find((o) => o.found && o.address);
  return any ? { email: any.address, domainType: any.domainType || "", status: any.status || "" } : { email: null, domainType: "", status: "not_found" };
}

async function findOne(first: string, last: string, domain: string, linkedin?: string) {
  const { trackId, people } = await searchPeople({ domain, fullName: `${first} ${last}`.trim(), linkedin });
  if (!trackId) { console.log("No trackId returned. Raw people count:", people.length); return null; }
  console.log(`Search matched ${people.length} people (trackId ${trackId}). Running email-finder...`);
  const inquiries = await findEmails(trackId);
  const r = bestEmail(inquiries[0] || {});
  console.log(r.email ? `Found: ${r.email}  [${r.domainType}/${r.status}]` : "No email found by AI Ark.");
  return r;
}

const cleanDomain = (d: string) => (d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

/** Batch: for each company (by domain), find a decision-maker + BounceBan-verified email. One contact/company. */
async function findBatch(inPath: string, outPath: string, seniority: string[], limit: number, target = 999) {
  const companies = parseCsv(readFileSync(inPath, "utf8")).slice(0, limit);
  const out: Record<string, string>[] = [];
  for (const c of companies) {
    if (out.length >= target) { console.log(`  (reached target of ${target})`); break; }
    const domain = cleanDomain(c.domain || c.company_domain || "");
    if (!domain) continue;
    try {
      const { trackId, people } = await searchPeople({ domain, seniority }, 5);
      if (!trackId || !people.length) { console.log(`  - ${domain}: no decision-maker found`); continue; }
      const inquiries = await findEmails(trackId);
      let best: any = null;
      for (const inq of inquiries) {
        const e = bestEmail(inq);
        if (!e.email) continue;
        const fn = inq.input?.firstname || "", ln = inq.input?.lastname || "";
        const person = people.find((p) => `${p.first_name} ${p.last_name}`.toLowerCase() === `${fn} ${ln}`.toLowerCase()) || {};
        const cand = { email: e.email, domainType: e.domainType, status: e.status, first_name: fn || person.first_name || "", last_name: ln || person.last_name || "", title: person.job_title || "", linkedin: person.linkedin_url || "" };
        if (e.domainType === "SMTP" && e.status === "VALID") { best = cand; break; }
        if (!best) best = cand;
      }
      if (!best) { console.log(`  - ${domain}: person found but no email`); continue; }
      out.push({
        email: best.email, first_name: best.first_name, last_name: best.last_name,
        company_name: c.company_name || "", company_domain: domain, title: best.title,
        linkedin_url: best.linkedin, find_source: "ai-ark", ai_ark_status: `${best.domainType}/${best.status}`,
      });
      console.log(`  ✓ ${domain}: ${best.email} [${best.domainType}/${best.status}] — ${best.first_name} ${best.last_name}, ${best.title}`);
    } catch (e: any) { console.log(`  - ${domain}: ${String(e.message).slice(0, 70)}`); }
    await sleep(300);
  }
  writeFileSync(outPath, toCsv(out));
  console.log(`\nFound ${out.length} contacts across ${companies.length} companies. Wrote ${outPath}`);
}

async function verifyCatchAll(inPath: string, outPath: string) {
  const rows = parseCsv(readFileSync(inPath, "utf8"));
  const out: Record<string, string>[] = [];
  let rescued = 0, dropped = 0;
  for (const r of rows) {
    const status = (r.email_status || "").toLowerCase().replace("_", "-");
    if (status !== "catch-all") { out.push(r); continue; }
    const first = r.first_name || "", last = r.last_name || "", domain = r.company_domain || "", linkedin = r.linkedin_url || "";
    try {
      const { trackId } = await searchPeople({ domain, fullName: `${first} ${last}`.trim(), linkedin }, 3);
      const inquiries = trackId ? await findEmails(trackId) : [];
      const best = bestEmail(inquiries[0] || {});
      if (best.email && best.domainType === "SMTP" && best.status === "VALID") {
        rescued++;
        out.push({ ...r, email: best.email, email_status: "valid", sendable: "yes", verify_note: "catch-all rescued: AI Ark SMTP/VALID" });
      } else {
        dropped++;
        out.push({ ...r, sendable: "no", verify_note: `catch-all dropped: AI Ark ${best.domainType || "no"}/${best.status}` });
      }
    } catch (e: any) {
      out.push({ ...r, sendable: "no", verify_note: `catch-all cross-check error: ${e.message?.slice(0, 80)}` });
    }
  }
  writeFileSync(outPath, toCsv(out));
  console.log(`Catch-all cross-check: ${rescued} rescued, ${dropped} dropped. Wrote ${outPath}.`);
}

async function searchCompanies(lookalike: string[], size: number) {
  const body: any = { page: 0, size };
  if (lookalike.length) body.lookalikeDomains = lookalike.slice(0, 5);
  const r = await ark("/v1/companies", { method: "POST", body: JSON.stringify(body) });
  const fmtSize = (s: any) => !s ? "" : (s.end != null ? `${s.start}-${s.end}` : `${s.start}+`);
  const companies = (r.content ?? []).map((c: any) => ({
    company_name: c?.summary?.name ?? "",
    domain: c?.link?.domain ?? "",
    industry: c?.summary?.industry ?? "",
    size: fmtSize(c?.summary?.staff?.range),
    location: c?.location?.headquarter?.city ?? c?.location?.headquarter?.state ?? "",
  }));
  console.log(`AI Ark returned ${companies.length} companies (total ${r.totalElements ?? "?"}).`);
  return companies;
}

async function main() {
  const a = args();
  if (a.credits) { console.log("AI Ark credits:", await credits()); return; }
  if (a.find) {
    if ((!a.first || !a.last || !a.domain) && !a.linkedin) { console.error("--find needs --first= --last= --domain=  (or --linkedin=)"); process.exit(1); }
    await findOne(String(a.first || ""), String(a.last || ""), String(a.domain || ""), a.linkedin ? String(a.linkedin) : undefined); return;
  }
  if (a["verify-catchall"]) {
    if (!a.in || !a.out) { console.error("--verify-catchall needs --in= --out="); process.exit(1); }
    await verifyCatchAll(String(a.in), String(a.out)); return;
  }
  if (a["find-batch"]) {
    if (!a.in || !a.out) { console.error("--find-batch needs --in=companies.csv --out=contacts.csv [--seniority=...|--no-seniority] [--limit=20] [--target=12]"); process.exit(1); }
    const sen = a["no-seniority"] ? [] : String(a.seniority || "founder,owner,c-suite").split(",").map((s) => s.trim()).filter(Boolean);
    await findBatch(String(a.in), String(a.out), sen, Number(a.limit || 20), Number(a.target || 999)); return;
  }
  if (a.companies) {
    const look = String(a.lookalike || "").split(",").map((s) => s.trim()).filter(Boolean);
    const companies = await searchCompanies(look, Number(a.size || 25));
    if (a.out) { writeFileSync(String(a.out), toCsv(companies)); console.log(`Wrote ${a.out}.`); }
    if (a.push) {
      const client = slug(String(a.client || ""));
      if (!client) { console.error('--push needs --client="..."'); process.exit(1); }
      const recs = companies.map((c: any) => ({
        client, segment: slug(String(a.segment || "")) || null, target_market: slug(String(a.market || "")) || null,
        list_source: slug(String(a.source || "ai-ark-lookalike")) || null,
        company_name: c.company_name || null, domain: (c.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null,
        industry: c.industry || null, company_size: c.size || null, location: c.location || null,
      })).filter((r: any) => r.domain);
      try { const n = await upsert("companies", recs, "client,domain"); console.log(`✓ Pushed ${n} companies to Supabase (client "${client}").`); }
      catch (e) { if (e instanceof TableMissingError) explainMissing("companies", "supabase/schema-companies.sql"); else console.error("\n" + (e as Error).message); }
    }
    if (!a.out && !a.push) console.log(JSON.stringify(companies.slice(0, 10), null, 2));
    return;
  }
  console.error("Modes: --credits | --find --first --last --domain | --verify-catchall --in --out | --companies --lookalike=a.com,b.com [--out]");
  process.exit(1);
}

main().catch((e) => { console.error("\n" + (e?.message || e)); process.exit(1); });
