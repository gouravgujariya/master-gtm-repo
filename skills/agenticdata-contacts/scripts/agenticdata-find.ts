/**
 * agenticdata-find.ts — PRIMARY decision-maker finder (scriptable, via AgenticData HTTP API).
 * Persona-first: pass the pinned target --title. Uses primary_email; backfills via /v1/email/find.
 *
 *   npm run agenticdata-find -- --in=companies.csv --out=contacts.csv --title="Owner" [--per-company=1] [--limit=40] [--target=12]
 *   npm run agenticdata-find -- --company-domain=stripe.com --title="VP Marketing"   # single test
 *
 * Base https://api.agenticdata.host · Authorization: Bearer ADATA_live_… · see references/agenticdata-api.md
 * This restores the intended waterfall (AgenticData PRIMARY → AI Ark → ColdIQ).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { requireKey, args, parseCsv, toCsv, sleep } from "../../../lib/env.js";

const BASE = "https://api.agenticdata.host";
const KEY = requireKey("ADATA_API_KEY");
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const clean = (d: string) => (d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

async function ad(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await res.text();
  let j: any; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!res.ok) throw new Error(`AgenticData ${path} -> ${res.status}: ${t.slice(0, 200)}`);
  return j;
}

const SENIORITY = ["founder", "owner", "ceo", "chief", "president", "vp", "vice president", "head", "director", "principal", "partner", "manager"];
const seniorityScore = (t: string) => { const l = (t || "").toLowerCase(); let b = 0; SENIORITY.forEach((k, i) => { if (l.includes(k)) b = Math.max(b, 100 - i); }); return b; };

async function searchPeople(domain: string, title?: string, limit = 5): Promise<any[]> {
  const q = new URLSearchParams({ company_domain: domain, limit: String(limit) });
  if (title) q.set("title", title);
  const r = await ad(`/v1/search/people?${q.toString()}`);
  return r.results ?? r.data ?? r.people ?? [];
}
async function findEmail(first: string, last: string, domain: string): Promise<string | null> {
  try {
    const r = await ad("/v1/email/find", { method: "POST", body: JSON.stringify({ first_name: first, last_name: last, domain }) });
    return r.email ?? r.result?.email ?? r.data?.email ?? (typeof r.result === "string" ? r.result : null);
  } catch { return null; }
}

async function pickForCompany(domain: string, title?: string): Promise<Record<string, string> | null> {
  const people = await searchPeople(domain, title, 5);
  if (!people.length) return null;
  const ranked = people
    .map((p) => ({ p, score: (p.primary_email ? 50 : 0) + seniorityScore(p.job_title || "") }))
    .sort((a, b) => b.score - a.score);
  for (const { p } of ranked) {
    let email = p.primary_email || null;
    if (!email) email = await findEmail(p.first_name || "", p.last_name || "", domain);
    if (email) return {
      email: String(email).toLowerCase(), first_name: p.first_name || "", last_name: p.last_name || "",
      company_name: p.company_name || "", company_domain: domain, title: p.job_title || "",
      linkedin_url: p.linkedin_url || "", find_source: "agenticdata",
    };
  }
  return null;
}

async function main() {
  const a = args();
  if (a["company-domain"]) {
    const c = await pickForCompany(clean(String(a["company-domain"])), a.title ? String(a.title) : undefined);
    console.log(c ? `Found: ${c.email} — ${c.first_name} ${c.last_name}, ${c.title}` : "No decision-maker with an email found.");
    return;
  }
  const inPath = a.in as string, outPath = a.out as string;
  if (!inPath || !outPath) { console.error('Usage: --in=companies.csv --out=contacts.csv --title="Owner" [--limit=40] [--target=12]  |  --company-domain=x.com --title="..."'); process.exit(1); }
  const title = a.title ? String(a.title) : undefined;
  const limit = Number(a.limit || 40), target = Number(a.target || 999);
  const companies = parseCsv(readFileSync(inPath, "utf8")).slice(0, limit);

  const out: Record<string, string>[] = [];
  for (const c of companies) {
    if (out.length >= target) { console.log(`  (reached target ${target})`); break; }
    const domain = clean(c.domain || c.company_domain || "");
    if (!domain) continue;
    try {
      const contact = await pickForCompany(domain, title);
      if (contact) { contact.company_name ||= c.company_name || ""; out.push(contact); console.log(`  ✓ ${domain}: ${contact.email} — ${contact.first_name} ${contact.last_name}, ${contact.title}`); }
      else console.log(`  - ${domain}: no decision-maker + email`);
    } catch (e: any) { console.log(`  - ${domain}: ${String(e.message).slice(0, 70)}`); }
    await sleep(250);
  }
  writeFileSync(outPath, toCsv(out));
  console.log(`\nFound ${out.length} contacts across ${companies.length} companies (AgenticData primary). Wrote ${outPath}`);
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
