/**
 * select-contacts.ts — deterministic decision-maker selection from AgenticData search results.
 *
 * The AgenticData MCP `search` calls are run by the agent (per company, by domain). Their combined
 * results (a flat JSON array of person records) are fed here. This script ranks candidates by target
 * title + seniority, extracts the BUSINESS email, and writes the standard contacts CSV that
 * verify-emails.ts consumes.
 *
 * Usage:
 *   npm run select-contacts -- --in=raw-results.json --out=contacts.csv \
 *       --titles="VP Sales,Head of Growth,Founder,Owner,CMO" [--per-company=1] [--allow-personal]
 *
 * Input JSON: array of AgenticData person records (fields: first_name,last_name,job_title,
 *   primary_email,personal_emails,linkedin_url,company_name,company_domain, ...).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { args, toCsv } from "../../../lib/env.js";

const SENIORITY = [
  ["founder", 100], ["owner", 100], ["ceo", 95], ["chief", 90], ["president", 88],
  ["vp", 80], ["vice president", 80], ["head", 75], ["director", 70], ["principal", 60],
  ["lead", 55], ["manager", 50], ["senior", 40],
] as const;

function seniorityScore(title: string): number {
  const t = title.toLowerCase();
  let best = 0;
  for (const [kw, w] of SENIORITY) if (t.includes(kw)) best = Math.max(best, w as number);
  return best;
}

function titleMatchScore(title: string, targetKeywords: string[]): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const kw of targetKeywords) if (kw && t.includes(kw)) score += 20;
  return score;
}

function firstPersonalEmail(raw: string | null): string | null {
  if (!raw) return null;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) && arr.length ? String(arr[0]) : null; }
  catch { return null; }
}

function main() {
  const a = args();
  const inPath = a.in as string, outPath = a.out as string;
  if (!inPath || !outPath) {
    console.error('Usage: --in=raw-results.json --out=contacts.csv --titles="VP Sales,Founder,Owner" [--per-company=1] [--allow-personal]');
    process.exit(1);
  }
  const targets = String(a.titles || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const perCompany = Number(a["per-company"] || 1);
  const allowPersonal = Boolean(a["allow-personal"]);

  const records: any[] = JSON.parse(readFileSync(inPath, "utf8"));

  // group by company_domain
  const byCompany = new Map<string, any[]>();
  for (const r of records) {
    const dom = (r.company_domain || r.company_name || "unknown").toLowerCase();
    (byCompany.get(dom) || byCompany.set(dom, []).get(dom)!).push(r);
  }

  const out: Record<string, string>[] = [];
  let skippedNoEmail = 0;
  for (const [dom, people] of byCompany) {
    const ranked = people
      .map((p) => {
        const title = p.job_title || "";
        const business = p.primary_email || null;
        const personal = allowPersonal ? firstPersonalEmail(p.personal_emails) : null;
        const email = business || personal;
        const score = titleMatchScore(title, targets) + seniorityScore(title) + (business ? 15 : 0);
        return { p, title, email, business: !!business, score };
      })
      .filter((c) => c.email) // must have some email to be sendable-eligible
      .sort((x, y) => y.score - x.score);

    if (!ranked.length) { skippedNoEmail++; continue; }

    for (const c of ranked.slice(0, perCompany)) {
      out.push({
        email: c.email!,
        first_name: c.p.first_name || "",
        last_name: c.p.last_name || "",
        company_name: c.p.company_name || "",
        company_domain: c.p.company_domain || dom,
        title: c.title,
        linkedin_url: c.p.linkedin_url || "",
        find_source: "agenticdata",
        email_kind: c.business ? "business" : "personal",
      });
    }
  }

  const cols = ["email", "first_name", "last_name", "company_name", "company_domain", "title", "linkedin_url", "find_source", "email_kind"];
  writeFileSync(outPath, toCsv(out, cols));
  console.log(`Selected ${out.length} contacts across ${byCompany.size} companies. ${skippedNoEmail} companies had no usable email (send to AI Ark -> ColdIQ fallback).`);
  console.log(`Wrote ${outPath} -> next: verify with OptimaVerifier (npm run verify-emails).`);
}

main();
