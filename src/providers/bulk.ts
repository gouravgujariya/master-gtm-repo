// Local pre-scraped bulk datasets (Common Outbound Lists/). Free — always tried before any paid source.
// No API key, so no ctx. The directory is a parameter so workers/tests can point elsewhere.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsv } from "../../lib/env.ts";
import { streamCsv } from "../../lib/csv-stream.ts";

export const DEFAULT_LISTS_DIR = resolve(import.meta.dirname, "../..", "Common Outbound Lists");
export type Filters = Record<string, string | boolean | undefined>;
const has = (hay: string, needle?: string) => !needle || hay.toLowerCase().includes(needle.toLowerCase());

/** saas -> us-software-saas-companies-cleaned.csv (~900k). Case-insensitive substring filters, early exit at limit. */
export async function bulkSaas(dir: string, a: Filters, limit: number) {
  const file = resolve(dir, "us-software-saas-companies-cleaned.csv");
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

/** local -> Google Maps Scrape - 12M US Businesses/*.csv (~12.3M). State filter via us-zip-codes.csv. */
export async function bulkLocal(dir: string, a: Filters, limit: number) {
  const gm = resolve(dir, "Google Maps Scrape - 12M US Businesses");
  if (!existsSync(gm)) throw new Error(`Missing ${gm}`);
  const category = a.category as string, state = (a.state as string || "").toUpperCase();
  const zip = a.zip as string;

  // state -> zip set (via us-zip-codes.csv, small enough to load)
  let zipSet: Set<string> | null = null;
  if (state) {
    const zips = parseCsv(readFileSync(resolve(dir, "us-zip-codes.csv"), "utf8"));
    zipSet = new Set(zips.filter((z) => (z["state"] || "").toUpperCase() === state).map((z) => z["zip"]));
    if (!zipSet.size) throw new Error(`No ZIPs found for state ${state}`);
  }

  const parts = readdirSync(gm).filter((f) => f.endsWith(".csv")).sort();
  const out: Record<string, string>[] = [];
  for (const part of parts) {
    await streamCsv(resolve(gm, part), (r) => {
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
  // ponytail: --city was always a no-op here (local file has no city column); add a zip->city lookup if needed.
  return out;
}
