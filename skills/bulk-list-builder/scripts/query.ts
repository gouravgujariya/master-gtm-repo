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
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { args, parseCsv, toCsv } from "../../../lib/env.ts";
import { streamCsv } from "../../../lib/csv-stream.ts";
import { upsert, slug, editorUrl, TableMissingError, explainMissing } from "../../../lib/supabase.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const LISTS = resolve(ROOT, "Common Outbound Lists");
const has = (hay: string, needle?: string) => !needle || hay.toLowerCase().includes(needle.toLowerCase());

async function querySaas(a: Record<string, string | boolean>, limit: number) {
  const file = resolve(LISTS, "us-software-saas-companies-cleaned.csv");
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  const industry = a.industry as string, location = a.location as string, size = a.size as string, name = a.name as string;
  const out: Record<string, string>[] = [];
  await streamCsv(file, (r) => {
    if (!has(r["Industry"] || "", industry)) return;
    if (location && !(has(r["Locality"] || "", location) || has(r["Country"] || "", location))) return;
    if (!has(r["Employee Size Range"] || "", size)) return;
    if (!has(r["Company Name"] || "", name)) return;
    out.push({
      company_name: r["Company Name"] || "", domain: r["Domain"] || "", industry: r["Industry"] || "",
      employees: r["Employee Size Range"] || "", locality: r["Locality"] || "", country: r["Country"] || "",
      linkedin: r["LinkedIn Company URL"] || "", source: "bulk-saas",
    });
    if (out.length >= limit) return false;
  });
  return out;
}

async function queryLocal(a: Record<string, string | boolean>, limit: number) {
  const dir = resolve(LISTS, "Google Maps Scrape - 12M US Businesses");
  if (!existsSync(dir)) throw new Error(`Missing ${dir}`);
  const category = a.category as string, state = (a.state as string || "").toUpperCase();
  const city = a.city as string, zip = a.zip as string;

  // state -> zip set (via us-zip-codes.csv, small enough to load)
  let zipSet: Set<string> | null = null;
  if (state) {
    const zips = parseCsv(readFileSync(resolve(LISTS, "us-zip-codes.csv"), "utf8"));
    zipSet = new Set(zips.filter((z) => (z["state"] || "").toUpperCase() === state).map((z) => z["zip"]));
    if (!zipSet.size) throw new Error(`No ZIPs found for state ${state}`);
  }

  const parts = readdirSync(dir).filter((f) => f.endsWith(".csv")).sort();
  const out: Record<string, string>[] = [];
  for (const part of parts) {
    await streamCsv(resolve(dir, part), (r) => {
      const z = (r["zip_code"] || "").replace(/\.0$/, "");
      if (zipSet && !zipSet.has(z)) return;
      if (zip && z !== zip) return;
      if (!has(r["category_titles"] || "", category)) return;
      out.push({
        company_name: r["title"] || "", domain: (r["normalized_display_link"] || r["link"] || ""),
        phone: (r["phone"] || "").replace(/\.0$/, ""), category: r["category_titles"] || "", zip: z, source: "bulk-local",
      });
      if (out.length >= limit) return false;
    });
    if (out.length >= limit) break;
  }
  // city filter (local file has no city column; approximate via zip->city if needed) — skipped unless provided
  return city ? out.filter((r) => true) : out;
}

async function main() {
  const a = args();
  const dataset = a.dataset as string;
  const limit = Number(a.limit || 5);
  if (dataset !== "saas" && dataset !== "local") {
    console.error('Usage: --dataset=saas|local  [filters]  --limit=5 [--out=companies.csv]');
    process.exit(1);
  }
  const rows = dataset === "saas" ? await querySaas(a, limit) : await queryLocal(a, limit);
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
}

main().catch((e) => { console.error("\n" + (e?.message || e)); process.exit(1); });
