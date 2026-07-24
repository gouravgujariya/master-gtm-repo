/**
 * supabase-push-contacts.ts — upsert verified contacts from a CSV into the Supabase `contacts` table.
 * Tags every row with client / segment / market / size / source so it's filterable in Table Editor.
 *
 *   npm run supabase-push -- --file=verified.csv --client="Acme Co" --segment="fintech-saas" \
 *     --market="US" --size="201-500" --source="ai-ark-lookalike" [--only-sendable]
 *
 * One-time prerequisite: create the table by running supabase/schema-contacts.sql in the SQL Editor.
 * Upserts on (client,email) so re-runs update instead of duplicating.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, args, parseCsv } from "../lib/env.ts";

const URL = requireKey("SUPABASE_URL").replace(/\/$/, "");
const KEY = requireKey("SUPABASE_SERVICE_ROLE_KEY");
const slug = (s: string) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function main() {
  const a = args();
  const file = resolve((a.file as string) || "samples/sample-verified-contacts.csv");
  const client = slug(String(a.client || ""));
  if (!client) { console.error('❌ --client is REQUIRED, e.g. --client="Acme Co".'); process.exit(1); }
  const tag = {
    client,
    segment: slug(String(a.segment || "")) || null,
    target_market: slug(String(a.market || "")) || null,
    company_size: slug(String(a.size || "")) || null,
    list_source: slug(String(a.source || "")) || null,
  };

  const rows = parseCsv(readFileSync(file, "utf8"));
  const toBool = (v: string) => /^(yes|true|1)$/i.test((v || "").trim());
  let records = rows.map((r) => ({
    ...tag,
    email: (r.email || "").toLowerCase().trim(),
    first_name: r.first_name || null,
    last_name: r.last_name || null,
    company_name: r.company_name || null,
    company_domain: r.company_domain || null,
    title: r.title || null,
    linkedin_url: r.linkedin_url || null,
    email_status: r.email_status || null,
    sendable: r.sendable != null ? toBool(r.sendable) : null,
    find_source: r.find_source || null,
    verify_note: r.verify_note || null,
  })).filter((r) => r.email);
  if (a["only-sendable"]) records = records.filter((r) => r.sendable === true);
  if (!records.length) { console.error("No rows to push."); process.exit(1); }

  const res = await fetch(`${URL}/rest/v1/contacts?on_conflict=client,email`, {
    method: "POST",
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(records),
  });
  const text = await res.text();

  if (!res.ok) {
    if (/does not exist|42P01|PGRST205|Could not find the table/i.test(text)) {
      console.error("\n❌ The `contacts` table doesn't exist yet.\n   Run supabase/schema-contacts.sql once in the SQL Editor:\n   " +
        `https://supabase.com/dashboard/project/${URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]}/sql/new\n   Then re-run this command.`);
    } else {
      console.error(`\n❌ Push failed (${res.status}): ${text.slice(0, 300)}`);
    }
    process.exit(1);
  }

  const returned = JSON.parse(text);
  const ref = URL.match(/https:\/\/([a-z0-9]+)\./)?.[1];
  console.log(`✓ Upserted ${returned.length} contacts for client "${client}".`);
  console.log(`  sendable: ${records.filter((r) => r.sendable === true).length} · not-sendable: ${records.filter((r) => r.sendable !== true).length}`);
  console.log(`\nPreview in Table Editor:\nhttps://supabase.com/dashboard/project/${ref}/editor`);
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
