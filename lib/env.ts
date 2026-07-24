// Minimal .env loader + CSV helpers — no external dependencies.
// Reads the repo-root .env so scripts can pull keys without dotenv.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, ".."); // lib/ -> repo root

let loaded: Record<string, string> | null = null;

/** Parse the repo-root .env once. Lines are KEY=VALUE; blank/#-comment lines ignored. */
export function loadEnv(): Record<string, string> {
  if (loaded) return loaded;
  const path = resolve(REPO_ROOT, ".env");
  const out: Record<string, string> = {};
  if (existsSync(path)) {
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      // strip surrounding quotes and any inline "# comment"
      if (!val.startsWith('"') && !val.startsWith("'")) val = val.split(" #")[0].trim();
      val = val.replace(/^['"]|['"]$/g, "");
      out[key] = val;
    }
  }
  loaded = out;
  return out;
}

/** Get a required key or exit with a clear message. */
export function requireKey(name: string): string {
  const v = loadEnv()[name] || process.env[name];
  if (!v) {
    console.error(`\n❌ Missing ${name}. Add it to .env (copy from .env.example).\n`);
    process.exit(1);
  }
  return v;
}

/** Tiny CLI arg parser: --key=value and --flag. */
export function args(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith("--")) continue;
    const [k, ...rest] = a.slice(2).split("=");
    out[k] = rest.length ? rest.join("=") : true;
  }
  return out;
}

/** Minimal CSV parse (handles quoted fields + commas/newlines in quotes). Returns array of row objects. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** Serialize rows to CSV using the union of keys (or a given column order). */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
