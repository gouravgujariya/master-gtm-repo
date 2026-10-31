/**
 * agenticdata-find.ts — PRIMARY decision-maker finder (scriptable, via AgenticData HTTP API).
 * Persona-first: pass the pinned target --title. Uses primary_email; backfills via /v1/email/find.
 *
 *   npm run agenticdata-find -- --in=companies.csv --out=contacts.csv --title="Owner" [--per-company=1] [--limit=40] [--target=12]
 *   npm run agenticdata-find -- --company-domain=stripe.com --title="VP Marketing"   # single test
 *
 * Base https://api.agenticdata.host · Authorization: Bearer ADATA_live_… · see references/agenticdata-api.md
 * This restores the intended waterfall (AgenticData PRIMARY → AI Ark → ColdIQ). Logic: src/providers/agenticdata.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { args, parseCsv, toCsv, sleep } from "../../../lib/env.ts";
import { cliCtx, runCli } from "../../../src/core/ctx.ts";
import { clean, pickForCompany } from "../../../src/providers/agenticdata.ts";

runCli(async () => {
  const ctx = cliCtx();
  ctx.getKey("ADATA_API_KEY"); // fail fast, like before
  const a = args();
  if (a["company-domain"]) {
    const c = await pickForCompany(ctx, clean(String(a["company-domain"])), a.title ? String(a.title) : undefined);
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
      const contact = await pickForCompany(ctx, domain, title);
      if (contact) { contact.company_name ||= c.company_name || ""; out.push(contact); console.log(`  ✓ ${domain}: ${contact.email} — ${contact.first_name} ${contact.last_name}, ${contact.title}`); }
      else console.log(`  - ${domain}: no decision-maker + email`);
    } catch (e: any) { console.log(`  - ${domain}: ${String(e.message).slice(0, 70)}`); }
    await sleep(250);
  }
  writeFileSync(outPath, toCsv(out));
  console.log(`\nFound ${out.length} contacts across ${companies.length} companies (AgenticData primary). Wrote ${outPath}`);
});
