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
 * Logic: src/providers/ai-ark.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { args, parseCsv, toCsv, sleep } from "../../../lib/env.ts";
import { upsert, slug, TableMissingError, explainMissing } from "../../../lib/supabase.ts";
import { cliCtx, runCli } from "../../../src/core/ctx.ts";
import { credits, findOne, findForCompany, recheckCatchAll, searchCompanies, cleanDomain } from "../../../src/providers/ai-ark.ts";

runCli(async () => {
  const ctx = cliCtx();
  ctx.getKey("AI_ARK_API_KEY"); // fail fast, like before
  const a = args();
  if (a.credits) { console.log("AI Ark credits:", await credits(ctx)); return; }
  if (a.find) {
    if ((!a.first || !a.last || !a.domain) && !a.linkedin) { console.error("--find needs --first= --last= --domain=  (or --linkedin=)"); process.exit(1); }
    await findOne(ctx, String(a.first || ""), String(a.last || ""), String(a.domain || ""), a.linkedin ? String(a.linkedin) : undefined); return;
  }
  if (a["verify-catchall"]) {
    if (!a.in || !a.out) { console.error("--verify-catchall needs --in= --out="); process.exit(1); }
    const out: Record<string, string>[] = [];
    let rescued = 0, dropped = 0;
    for (const r of parseCsv(readFileSync(String(a.in), "utf8"))) {
      const row = await recheckCatchAll(ctx, r);
      if (row.verify_note?.startsWith("catch-all rescued") && row !== r) rescued++;
      else if (row.verify_note?.startsWith("catch-all dropped") && row !== r) dropped++;
      out.push(row);
    }
    writeFileSync(String(a.out), toCsv(out));
    console.log(`Catch-all cross-check: ${rescued} rescued, ${dropped} dropped. Wrote ${a.out}.`);
    return;
  }
  if (a["find-batch"]) {
    if (!a.in || !a.out) { console.error("--find-batch needs --in=companies.csv --out=contacts.csv [--seniority=...|--no-seniority] [--limit=20] [--target=12]"); process.exit(1); }
    const sen = a["no-seniority"] ? [] : String(a.seniority || "founder,owner,c-suite").split(",").map((s) => s.trim()).filter(Boolean);
    const limit = Number(a.limit || 20), target = Number(a.target || 999);
    const companies = parseCsv(readFileSync(String(a.in), "utf8")).slice(0, limit);
    const out: Record<string, string>[] = [];
    for (const c of companies) {
      if (out.length >= target) { console.log(`  (reached target of ${target})`); break; }
      const domain = cleanDomain(c.domain || c.company_domain || "");
      if (!domain) continue;
      try {
        const row = await findForCompany(ctx, domain, sen, c.company_name || "");
        if (row) out.push(row);
      } catch (e: any) { console.log(`  - ${domain}: ${String(e.message).slice(0, 70)}`); }
      await sleep(300);
    }
    writeFileSync(String(a.out), toCsv(out));
    console.log(`\nFound ${out.length} contacts across ${companies.length} companies. Wrote ${a.out}`);
    return;
  }
  if (a.companies) {
    const look = String(a.lookalike || "").split(",").map((s) => s.trim()).filter(Boolean);
    const companies = await searchCompanies(ctx, look, Number(a.size || 25));
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
});
