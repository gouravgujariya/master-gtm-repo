/**
 * supabase-sample.ts — verify Supabase access and upload a sample file to Storage, print the public link.
 *
 *   npm run supabase-sample                         # uploads samples/sample-verified-contacts.csv
 *   npm run supabase-sample -- --file=path.csv --bucket=gtm-samples --path=contacts/x.csv
 *
 * Uses the SECRET (service-role) key for admin ops. Bucket is created PUBLIC so the link is shareable.
 */
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { requireKey, loadEnv, args } from "../lib/env.ts";

const URL = requireKey("SUPABASE_URL").replace(/\/$/, "");
const KEY = requireKey("SUPABASE_SERVICE_ROLE_KEY"); // sb_secret_...
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
}

async function main() {
  const a = args();
  const bucket = (a.bucket as string) || "gtm-samples";
  const filePath = resolve((a.file as string) || "samples/sample-verified-contacts.csv");
  const objectPath = (a.path as string) || `contacts/${basename(filePath)}`;

  // 1) access check — list buckets
  const list = await sb("/storage/v1/bucket");
  if (!list.ok) throw new Error(`Access check failed (${list.status}): ${(await list.text()).slice(0, 200)}`);
  console.log("✓ Supabase reachable. Existing buckets:", ((await list.json()) as any[]).map((b: any) => b.name).join(", ") || "(none)");

  // 2) ensure a public bucket
  const mk = await sb("/storage/v1/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (mk.ok) console.log(`✓ Created public bucket "${bucket}".`);
  else {
    const t = await mk.text();
    if (/exist/i.test(t)) console.log(`✓ Bucket "${bucket}" already exists.`);
    else throw new Error(`Bucket create failed (${mk.status}): ${t.slice(0, 200)}`);
  }

  // 3) upload the file (upsert)
  const body = readFileSync(filePath);
  const up = await sb(`/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: { "Content-Type": "text/csv", "x-upsert": "true" },
    body,
  });
  if (!up.ok) throw new Error(`Upload failed (${up.status}): ${(await up.text()).slice(0, 200)}`);
  console.log(`✓ Uploaded ${filePath.split("/").pop()} (${body.length} bytes) → ${bucket}/${objectPath}`);

  // 4) public link
  const publicUrl = `${URL}/storage/v1/object/public/${bucket}/${objectPath}`;
  console.log("\nPUBLIC LINK:\n" + publicUrl);
  const ref = URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (ref) console.log("\nDASHBOARD:\nhttps://supabase.com/dashboard/project/" + ref + "/storage/buckets/" + bucket);
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
