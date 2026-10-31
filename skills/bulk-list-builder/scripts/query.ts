/**
 * query.ts — bulk-list-builder: query the local pre-scraped datasets FIRST (before any live scrape).
 *
 *   npm run bulk-list -- --dataset=saas  --industry=marketing --location="united states" --limit=5 [--out=companies.csv]
 *   npm run bulk-list -- --dataset=local --category=dentist --state=CA --limit=5 [--out=companies.csv]
 *
 * Datasets (Common Outbound Lists/):
 *   saas  -> us-software-saas-companies-cleaned.csv        (~900k software/SaaS companies)
 *   local -> Google Maps Scrape - 12M US Businesses/*.csv  (~12.3M local businesses)
 * Filters are case-insensitive substring matches. Streams with early-exit at --limit (fast even on 1.5GB).
 * Logic lives in src/core/source.ts + src/providers/bulk.ts.
 */
import { writeFileSync } from "node:fs";
import { args, toCsv } from "../../../lib/env.ts";
import { upsert, slug, editorUrl, TableMissingError, explainMissing } from "../../../lib/supabase.ts";
import { cliCtx, runCli } from "../../../src/core/ctx.ts";
import { sourceCompanies } from "../../../src/core/source.ts";

runCli(async () => {
  const ctx = cliCtx();
  const a = args();
  const dataset = a.dataset as string;
  const limit = Number(a.limit || 5);
  if (dataset !== "saas" && dataset !== "local") {
    console.error('Usage: --dataset=saas|local  [filters]  --limit=5 [--out=companies.csv]');
    process.exit(1);
  }
  const rows = await sourceCompanies(ctx, { dataset, filters: a, limit });
  console.log(`Found ${rows.length} companies from bulk ${dataset} dataset.`);
  if (a.out) { writeFileSync(String(a.out), toCsv(rows)); console.log(`Wrote ${a.out}`); }
  else if (!a.push) console.log(toCsv(rows));

  if (a.push) {
    const client = slug(String(a.client || ""));
    if (!client) { console.error('\n--push needs --client="..."'); process.exit(1); }
    const recs = rows.map((r) => ({
      client,
      segment: slug(String(a.segment || "")) || null,
      target_market: slug(String(a.market || (a.state as string) || "")) || null,
      list_source: slug(String(a.source || (dataset === "saas" ? "bulk-saas" : "bulk-local"))) || null,
      company_name: r.company_name || null,
      domain: (r.domain || "").toLowerCase().trim() || null,
      industry: r.industry || r.category || null,
      company_size: r.employees || null,
      location: r.locality || r.country || r.zip || null,
      linkedin_url: r.linkedin || null,
      phone: r.phone || null,
    })).filter((r) => r.domain);
    try {
      const n = await upsert("companies", recs, "client,domain");
      console.log(`✓ Pushed ${n} companies to Supabase (client "${client}"). Preview: ${editorUrl()}`);
    } catch (e) {
      if (e instanceof TableMissingError) explainMissing("companies", "supabase/schema-companies.sql");
      else console.error("\nPush failed:", (e as Error).message);
    }
  }
});
