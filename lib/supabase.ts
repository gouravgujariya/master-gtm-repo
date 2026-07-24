// Shared Supabase helpers — used by the push scripts and by --push flags on verify/sourcing.
import { requireKey } from "./env.js";

const base = () => requireKey("SUPABASE_URL").replace(/\/$/, "");
const key = () => requireKey("SUPABASE_SERVICE_ROLE_KEY");

export function projectRef(): string {
  return base().match(/https:\/\/([a-z0-9]+)\./)?.[1] || "";
}
export function editorUrl(): string {
  return `https://supabase.com/dashboard/project/${projectRef()}/editor`;
}
export function sqlUrl(): string {
  return `https://supabase.com/dashboard/project/${projectRef()}/sql/new`;
}

export class TableMissingError extends Error {
  constructor(public table: string) { super(`Table "${table}" does not exist yet.`); }
}

export const slug = (s: string) =>
  (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Upsert rows into a table, merging on the conflict target. Returns number of rows written. */
export async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<number> {
  if (!rows.length) return 0;
  const res = await fetch(`${base()}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: key(), Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/does not exist|42P01|PGRST205|Could not find the table/i.test(text)) throw new TableMissingError(table);
    throw new Error(`Supabase upsert ${table} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text).length;
}

/** Print a friendly hint when a table is missing, pointing to the schema SQL to run once. */
export function explainMissing(table: string, sqlFile: string) {
  console.error(`\n❌ The \`${table}\` table doesn't exist yet.\n   Run ${sqlFile} once in the SQL Editor:\n   ${sqlUrl()}\n   Then re-run this command.`);
}
