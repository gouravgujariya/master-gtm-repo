/**
 * supabase-push-companies.ts — upsert sourced companies from a CSV into the `companies` table.
 * Works with bulk-list / ai-ark / serper output (maps their varied column names).
 *
 *   npm run supabase-push-companies -- --file=companies.csv --client="Acme Co" \
 *     --segment="fintech-saas" --market="US" --source="bulk-saas"
 *
 * One-time prerequisite: run supabase/schema-companies.sql in the SQL Editor. Upserts on (client,domain).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { args, parseCsv } from "../lib/env.js";
import { upsert, slug, editorUrl, TableMissingError, explainMissing } from "../lib/supabase.js";

async function main() {
  const a = args();
  const file = resolve((a.file as string) || "");
  if (!file || !a.file) { console.error("--file=companies.csv is required."); process.exit(1); }
  const client = slug(String(a.client || ""));
  if (!client) { console.error('--client is REQUIRED, e.g. --client="Acme Co".'); process.exit(1); }
  const tag = {
    client,
    segment: slug(String(a.segment || "")) || null,
    target_market: slug(String(a.market || "")) || null,
    list_source: slug(String(a.source || "")) || null,
  };

  const rows = parseCsv(readFileSync(file, "utf8"));
  const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) if (r[k]) return r[k]; return null; };

  const all = rows.map((r) => ({
    ...tag,
    company_name: pick(r, "company_name", "name", "title"),
    domain: (pick(r, "domain", "normalized_display_link") || "").toString().toLowerCase().trim() || null,
    industry: pick(r, "industry", "category"),
    company_size: pick(r, "employees", "size", "company_size"),
    location: pick(r, "locality", "location", "city", "country"),
    linkedin_url: pick(r, "linkedin", "linkedin_url"),
    phone: pick(r, "phone"),
  }));
  const withDomain = all.filter((r) => r.domain);
  const skipped = all.length - withDomain.length;

  try {
    const n = await upsert("companies", withDomain, "client,domain");
    console.log(`✓ Upserted ${n} companies for client "${client}".` + (skipped ? ` (${skipped} skipped — no domain)` : ""));
    console.log(`Preview: ${editorUrl()}`);
  } catch (e) {
    if (e instanceof TableMissingError) explainMissing("companies", "supabase/schema-companies.sql");
    else { console.error("\n❌ " + (e as Error).message); process.exit(1); }
  }
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
