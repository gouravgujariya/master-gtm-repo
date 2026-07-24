/**
 * supabase-upload.ts — upload a GTM list file to Supabase Storage with a DESCRIPTIVE, client-scoped name.
 *
 * Naming convention (so anyone can read a file at a glance):
 *   {client}__{segment}__{market}__{size}__{source}__{YYYY-MM-DD}.csv
 * Stored under a per-client folder:  gtm-lists/{client}/{filename}
 *
 *   npm run supabase-upload -- --file=samples/sample-verified-contacts.csv \
 *     --client="Acme Co" --segment="fintech-saas" --market="US" --size="201-500" --source="ai-ark-lookalike"
 *
 * Uploaded as text/plain so the public link PREVIEWS in the browser instead of downloading.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, args } from "../lib/env.ts";

const URL = requireKey("SUPABASE_URL").replace(/\/$/, "");
const KEY = requireKey("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const sb = (p: string, init: RequestInit = {}) => fetch(`${URL}${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });

const slug = (s: string) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "na";

async function main() {
  const a = args();
  const file = resolve((a.file as string) || "samples/sample-verified-contacts.csv");
  const client = slug(String(a.client || ""));
  if (client === "na") { console.error('❌ --client is REQUIRED (e.g. --client="Acme Co"). Every file must be tagged to a client.'); process.exit(1); }
  const segment = slug(String(a.segment || "general"));
  const market = slug(String(a.market || "us"));
  const size = slug(String(a.size || "all"));
  const source = slug(String(a.source || "manual"));
  const date = String(a.date || new Date().toISOString().slice(0, 10));

  const filename = `${client}__${segment}__${market}__${size}__${source}__${date}.csv`;
  const bucket = "gtm-lists";
  const objectPath = `${client}/${filename}`;

  // access + ensure public bucket
  const list = await sb("/storage/v1/bucket");
  if (!list.ok) throw new Error(`Access failed (${list.status}): ${(await list.text()).slice(0, 200)}`);
  const mk = await sb("/storage/v1/bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bucket, name: bucket, public: true }) });
  if (!mk.ok && !/exist/i.test(await mk.text())) throw new Error(`Bucket create failed (${mk.status}).`);

  // upload as text/plain (inline preview), upsert
  const body = readFileSync(file);
  const up = await sb(`/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8", "x-upsert": "true" },
    body,
  });
  if (!up.ok) throw new Error(`Upload failed (${up.status}): ${(await up.text()).slice(0, 200)}`);

  const ref = URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  console.log(`✓ Uploaded ${body.length} bytes`);
  console.log(`  file:   ${filename}`);
  console.log(`  path:   ${bucket}/${objectPath}`);
  console.log(`\nPREVIEW LINK (opens in browser):\n${URL}/storage/v1/object/public/${bucket}/${objectPath}`);
  if (ref) console.log(`\nDASHBOARD (Storage):\nhttps://supabase.com/dashboard/project/${ref}/storage/buckets/${bucket}`);
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
