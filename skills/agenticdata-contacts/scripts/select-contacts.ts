/**
 * select-contacts.ts — deterministic decision-maker selection from AgenticData search results.
 * Thin CLI over src/core/select.ts.
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
import { args, toCsv } from "../../../lib/env.ts";
import { runCli } from "../../../src/core/ctx.ts";
import { selectContacts, CONTACT_COLS } from "../../../src/core/select.ts";

runCli(async () => {
  const a = args();
  const inPath = a.in as string, outPath = a.out as string;
  if (!inPath || !outPath) {
    console.error('Usage: --in=raw-results.json --out=contacts.csv --titles="VP Sales,Founder,Owner" [--per-company=1] [--allow-personal]');
    process.exit(1);
  }
  const records: any[] = JSON.parse(readFileSync(inPath, "utf8"));
  const { contacts, companies, skippedNoEmail } = selectContacts(records, {
    titles: String(a.titles || ""),
    perCompany: Number(a["per-company"] || 1),
    allowPersonal: Boolean(a["allow-personal"]),
  });

  writeFileSync(outPath, toCsv(contacts, CONTACT_COLS));
  console.log(`Selected ${contacts.length} contacts across ${companies} companies. ${skippedNoEmail} companies had no usable email (send to AI Ark -> ColdIQ fallback).`);
  console.log(`Wrote ${outPath} -> next: verify with OptimaVerifier (npm run verify-emails).`);
});
