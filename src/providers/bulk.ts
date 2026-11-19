// Local pre-scraped bulk datasets (Common Outbound Lists/). Free — always tried before any paid source.
// No API key, so no ctx. The directory is a parameter so workers/tests can point elsewhere.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsv } from "../../lib/env.ts";
import { streamCsv } from "../../lib/csv-stream.ts";

export const DEFAULT_LISTS_DIR = resolve(import.meta.dirname, "../..", "Common Outbound Lists");
export type Filters = Record<string, string | boolean | undefined>;
const has = (hay: string, needle?: string) => !needle || hay.toLowerCase().includes(needle.toLowerCase());

type Row = Record<string, string>;
const saasMatch = (r: Row, a: Filters) => {
  const location = a.location as string;
  return has(r["Industry"] || "", a.industry as string)
    && (!location || has(r["Locality"] || "", location) || has(r["Country"] || "", location))
    && has(r["Employee Size Range"] || "", a.size as string)
    && has(r["Company Name"] || "", a.name as string);
};
const zipOf = (r: Row) => (r["zip_code"] || "").replace(/\.0$/, "");
const localMatch = (r: Row, a: Filters, zipSet: Set<string> | null) => {
  const z = zipOf(r);
  return (!zipSet || zipSet.has(z)) && (!a.zip || z === a.zip) && has(r["category_titles"] || "", a.category as string);
};
function stateZips(dir: string, state: string): Set<string> | null {
  if (!state) return null;
  const zips = parseCsv(readFileSync(resolve(dir, "us-zip-codes.csv"), "utf8"));
  const set = new Set(zips.filter((z) => (z["state"] || "").toUpperCase() === state.toUpperCase()).map((z) => z["zip"]));
  if (!set.size) throw new Error(`No ZIPs found for state ${state}`);
  return set;
}
const localParts = (gm: string) => readdirSync(gm).filter((f) => f.endsWith(".csv")).sort();

/** saas -> us-software-saas-companies-cleaned.csv (~900k). Case-insensitive substring filters, early exit at limit. */
export async function bulkSaas(dir: string, a: Filters, limit: number) {
  const file = resolve(dir, "us-software-saas-companies-cleaned.csv");
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  const out: Record<string, string>[] = [];
  await streamCsv(file, (r) => {
    if (!saasMatch(r, a)) return;
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
  const zipSet = stateZips(dir, (a.state as string) || ""); // state -> zip set (us-zip-codes.csv, small)
  const out: Record<string, string>[] = [];
  for (const part of localParts(gm)) {
    await streamCsv(resolve(gm, part), (r) => {
      if (!localMatch(r, a, zipSet)) return;
      const z = zipOf(r);
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

export const COUNT_CAP = 200_001; // "over 200k → split it" needs no exact number beyond this

/** Reachable size per segment targeting ({dataset, filters}) in ONE pass per bulk file (all segments at once).
 *  null = not countable here (lookalike/none, or the list file is missing). Capped at COUNT_CAP.
 *  ponytail: a full pass over the 12M local file is the ceiling — cache by filter hash if it gets slow. */
export async function countSegments(dir: string, segs: { dataset?: string; filters?: Filters }[]): Promise<(number | null)[]> {
  const n: (number | null)[] = segs.map((s) => (s.dataset === "saas" || s.dataset === "local" ? 0 : null));
  const saas = segs.flatMap((s, k) => (s.dataset === "saas" ? [k] : []));
  const local = segs.flatMap((s, k) => (s.dataset === "local" ? [k] : []));
  const bump = (k: number) => { if ((n[k] as number) < COUNT_CAP) (n[k] as number)++; };
  const allCapped = (ks: number[]) => ks.every((k) => n[k] === COUNT_CAP);
  const saasFile = resolve(dir, "us-software-saas-companies-cleaned.csv");
  if (saas.length && existsSync(saasFile)) {
    await streamCsv(saasFile, (r) => {
      for (const k of saas) if (saasMatch(r, segs[k].filters ?? {})) bump(k);
      if (allCapped(saas)) return false;
    });
  } else for (const k of saas) n[k] = null;
  const gm = resolve(dir, "Google Maps Scrape - 12M US Businesses");
  if (local.length && existsSync(gm)) {
    const zips = local.map((k) => { try { return stateZips(dir, String(segs[k].filters?.state || "")); } catch { return new Set<string>(); } });
    for (const part of localParts(gm)) {
      await streamCsv(resolve(gm, part), (r) => {
        local.forEach((k, j) => { if (localMatch(r, segs[k].filters ?? {}, zips[j])) bump(k); });
        if (allCapped(local)) return false;
      });
      if (allCapped(local)) break;
    }
  } else for (const k of local) n[k] = null;
  return n;
}
