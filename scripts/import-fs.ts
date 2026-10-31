/**
 * import-fs.ts — one-time (idempotent) import of profiles/<slug>/ folders into Postgres.
 *
 *   npm run import:fs                       # dry run (default): prints what it would do
 *   npm run import:fs -- --apply            # writes
 *   npm run import:fs -- --include-template # also import profiles/_TEMPLATE-client
 *   npm run import:fs -- --client=acme-co   # one client only
 *   npm run import:fs -- --from-supabase    # also page through Supabase companies/contacts
 *
 * Re-running is safe: clients/profiles/companies/contacts upsert on their unique keys;
 * files/campaigns/approvals are matched on (client, filename|name|stage) before inserting.
 */
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, relative, basename, extname, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { args, parseCsv, requireKey } from "../lib/env.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = "_TEMPLATE-client";

type Row = Record<string, unknown>;
const empty = (v: unknown) => v === undefined || v === null || v === "";
const pick = (r: Row, used: Set<string>, ...keys: string[]): string | null => {
  for (const k of keys) { used.add(k); if (!empty(r[k])) return String(r[k]).trim(); }
  return null;
};
// Columns we never keep in raw (old Supabase bookkeeping).
const DROP = new Set(["id", "client", "created_at"]);
const rest = (r: Row, used: Set<string>): Row | null => {
  const out = Object.fromEntries(Object.entries(r).filter(([k, v]) => !used.has(k) && !DROP.has(k) && !empty(v)));
  return Object.keys(out).length ? out : null;
};

// ---------- pure mapping (tested in test/import-fs.test.ts) ----------

/** Same parsing as app/server.ts listClients(). */
export function contextMeta(text: string, slug: string): { name: string; stage: string } {
  return {
    name: text.match(/^#\s*(.+?)\s*—/m)?.[1] || slug,
    stage: (text.match(/Current stage:\s*(.+)/)?.[1] || "").replace(/#.*$/, "").trim(),
  };
}

export function profileFromYaml(y: any) {
  return {
    website: (y?.client?.website as string) || null,
    icp: y?.icp ?? null,
    offer: y?.offer ?? null,
    personalization: y?.personalization ?? null,
    infrastructureStatus: y?.infrastructure_status ?? null,
    stack: y?.stack ?? null,
    angles: y?.angles ?? null,
  };
}

/** Maps bulk-list / ai-ark / serper CSV columns and old Supabase `companies` rows. Unknown columns → raw. */
export function companyFromRow(r: Row) {
  const used = new Set<string>();
  const m = {
    segment: pick(r, used, "segment"),
    targetMarket: pick(r, used, "target_market"),
    listSource: pick(r, used, "list_source"),
    companyName: pick(r, used, "company_name", "name"),
    domain: pick(r, used, "domain", "company_domain", "normalized_display_link")?.toLowerCase() || null,
    industry: pick(r, used, "industry", "category"),
    companySize: pick(r, used, "company_size", "employees", "size"),
    location: pick(r, used, "location", "locality", "city", "country"),
    linkedinUrl: pick(r, used, "linkedin_url", "linkedin"),
    phone: pick(r, used, "phone"),
  };
  return { ...m, raw: rest(r, used) };
}

/** Maps contact CSVs (find/verify/final-campaign) and old Supabase `contacts` rows. Unknown columns → raw. */
export function contactFromRow(r: Row) {
  const used = new Set<string>();
  const s = pick(r, used, "sendable");
  const m = {
    email: pick(r, used, "email")?.toLowerCase() || null,
    firstName: pick(r, used, "first_name"),
    lastName: pick(r, used, "last_name"),
    companyName: pick(r, used, "company_name"),
    companyDomain: pick(r, used, "company_domain", "domain")?.toLowerCase() || null,
    title: pick(r, used, "title"),
    linkedinUrl: pick(r, used, "linkedin_url", "linkedin"),
    findSource: pick(r, used, "find_source"),
    emailStatus: pick(r, used, "email_status"),
    sendable: s === null ? undefined : /^(yes|true|1)$/i.test(s),
    verifyNote: pick(r, used, "verify_note"),
  };
  return { ...m, raw: rest(r, used) };
}

/** A CSV is contacts if it has an email column, companies if it has a domain, else skipped. */
export function csvKind(rows: Row[]): "contacts" | "companies" | null {
  const cols = new Set(rows.flatMap((r) => Object.keys(r)));
  if (cols.has("email")) return "contacts";
  if (cols.has("domain") || cols.has("normalized_display_link")) return "companies";
  return null;
}

/** Merge rows by key; later non-empty fields win (so verify/final CSVs refine earlier ones). */
export function mergeBy<T extends Row>(rows: T[], key: (r: T) => string | null): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const prev = m.get(k) || ({} as T);
    const next: Row = { ...prev };
    for (const [f, v] of Object.entries(r)) {
      if (f === "raw" && v) next.raw = { ...(prev.raw as Row | null), ...(v as Row) };
      else if (!empty(v)) next[f] = v;
    }
    m.set(k, next as T);
  }
  return [...m.values()];
}

// Wizard steps in app/index.html: 0 Inputs, 1 Research&ICP, 2 Strategy, 3 Source, 4 Find, 5 Verify, 6 Copy, 7 Draft.
const STEP_STAGE: Record<string, string> = { 1: "icp", 2: "strategy", 3: "companies", 4: "contacts", 5: "contacts", 6: "copy", 7: "send" };
export function approvalStages(state: any): string[] {
  const a = state?.approved || {};
  return [...new Set(Object.keys(a).filter((k) => a[k] && STEP_STAGE[k]).map((k) => STEP_STAGE[k]))];
}

export function fileKind(rel: string): "questionnaire" | "transcript" | "upload" | "research" | "other" {
  const [dir] = rel.split("/");
  const name = basename(rel).toLowerCase();
  if (dir === "research") return "research";
  if (name.includes("questionnaire")) return "questionnaire";
  if (name.includes("transcript")) return "transcript";
  return dir === "inputs" ? "upload" : "other";
}

const MIME: Record<string, string> = {
  ".md": "text/markdown", ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
  ".yaml": "text/yaml", ".yml": "text/yaml", ".html": "text/html", ".pdf": "application/pdf",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ---------- filesystem scan (no DB) ----------

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? (readdirSync(dir, { recursive: true }) as string[]).map((f) => join(dir, f))
      .filter((f) => statSync(f).isFile() && !basename(f).startsWith(".") && basename(f) !== "README.md")
    : [];

function scanClient(slug: string) {
  const dir = resolve(ROOT, "profiles", slug);
  const read = (f: string) => (existsSync(resolve(dir, f)) ? readFileSync(resolve(dir, f), "utf8") : null);
  const ctx = read("context.md");
  const yamlText = read("client-profile.yaml");
  const state = (() => { try { return JSON.parse(read("state.json") || "null"); } catch { return null; } })();
  const meta = ctx ? contextMeta(ctx, slug) : { name: slug, stage: "" };

  const files = [...walk(resolve(dir, "inputs")), ...walk(resolve(dir, "research"))].map((abs) => {
    const buf = readFileSync(abs);
    // ponytail: NUL-byte sniff for binary; misfiles exotic encodings (UTF-16) as binary, which is the safe side.
    const binary = buf.includes(0);
    const rel = relative(dir, abs).split("\\").join("/");
    return { abs, rel, kind: fileKind(rel), mime: MIME[extname(abs).toLowerCase()] || (binary ? "application/octet-stream" : "text/plain"),
      size: buf.length, contentText: binary ? null : buf.toString("utf8"), binary };
  });

  const campaignFiles = walk(resolve(dir, "campaigns"));
  const sequences = campaignFiles.filter((f) => /sequence.*\.json$/i.test(basename(f))).map((f) => {
    const seq = JSON.parse(readFileSync(f, "utf8"));
    return { name: String(seq.campaign_name || relative(dir, f)), sequence: seq };
  });

  const companies: ReturnType<typeof companyFromRow>[] = [];
  const contacts: ReturnType<typeof contactFromRow>[] = [];
  for (const f of [...walk(resolve(dir, "lead-database")), ...campaignFiles].filter((f) => f.endsWith(".csv"))) {
    const rows = parseCsv(readFileSync(f, "utf8"));
    const kind = csvKind(rows);
    if (kind === "contacts") contacts.push(...rows.map(contactFromRow));
    else if (kind === "companies") companies.push(...rows.map(companyFromRow));
  }

  return {
    slug, ...meta, ctx, state,
    profile: yamlText ? profileFromYaml(parseYaml(yamlText)) : null,
    files, sequences,
    companies: mergeBy(companies, (r) => r.domain),
    contacts: mergeBy(contacts, (r) => r.email),
    approvals: approvalStages(state),
  };
}

async function fetchSupabase(table: string): Promise<Row[]> {
  const url = requireKey("SUPABASE_URL").replace(/\/$/, "");
  const key = requireKey("SUPABASE_SERVICE_ROLE_KEY");
  const out: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=id&limit=1000&offset=${offset}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase ${table} read failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// ---------- main ----------

type Counts = Record<string, { new: number; updated: number }>;

async function main() {
  const a = args();
  const apply = !!a.apply;
  const slugs = readdirSync(resolve(ROOT, "profiles")).filter((f) =>
    statSync(resolve(ROOT, "profiles", f)).isDirectory() && !f.startsWith(".")
    && (f !== TEMPLATE || a["include-template"]) && (!a.client || f === a.client));
  const scans = slugs.map(scanClient);

  const sb = { companies: new Map<string, Row[]>(), contacts: new Map<string, Row[]>() };
  if (a["from-supabase"]) {
    for (const t of ["companies", "contacts"] as const)
      for (const r of await fetchSupabase(t)) {
        const s = String(r.client || "");
        if (!s || (a.client && s !== a.client)) continue;
        sb[t].set(s, [...(sb[t].get(s) || []), r]);
      }
  }
  const allSlugs = [...new Set([...slugs, ...sb.companies.keys(), ...sb.contacts.keys()])];

  if (!apply) {
    console.log("DRY RUN — nothing written. Re-run with --apply to write.\n");
    for (const slug of allSlugs) {
      const s = scans.find((x) => x.slug === slug);
      const nCo = mergeBy([...(s?.companies || []), ...(sb.companies.get(slug) || []).map(companyFromRow)], (r) => r.domain).length;
      const nCt = mergeBy([...(s?.contacts || []), ...(sb.contacts.get(slug) || []).map(contactFromRow)], (r) => r.email).length;
      console.log(`${slug}${s ? "" : " (Supabase only — would auto-create)"}`);
      console.log(`  client:     name="${s?.name || slug}" stage="${s?.stage || ""}"`);
      console.log(`  profile:    ${s?.profile || s?.ctx ? "yes" : "no"}`);
      console.log(`  files:      ${s?.files.length || 0} (${s?.files.filter((f) => f.binary).length || 0} binary) ${s?.files.map((f) => `${f.rel}[${f.kind}]`).join(", ") || ""}`);
      console.log(`  campaigns:  ${s?.sequences.map((q) => q.name).join(", ") || 0}`);
      console.log(`  companies:  ${nCo}   contacts: ${nCt}`);
      console.log(`  approvals:  ${s?.approvals.join(", ") || 0}`);
    }
    return;
  }

  const { db, pool } = await import("../src/db/client.ts");
  const T = await import("../src/db/schema.ts");
  const { sql, and, eq, getTableColumns, getTableName } = await import("drizzle-orm");
  const { config } = await import("../src/config.ts");
  const storageDir = resolve(ROOT, config().STORAGE_DIR);

  const inserted = sql<boolean>`(xmax = 0)`;
  // ON CONFLICT set: take the new value, keep the old one when the new is null.
  const keepOld = (table: any, keys: string[]) => {
    const cols = getTableColumns(table) as Record<string, { name: string }>;
    return Object.fromEntries(keys.map((k) => [k, sql.raw(`coalesce(excluded."${cols[k].name}", "${getTableName(table)}"."${cols[k].name}")`)]));
  };
  const tally = (c: Counts, k: string, rows: { inserted: boolean }[]) => {
    c[k] ??= { new: 0, updated: 0 };
    for (const r of rows) r.inserted ? c[k].new++ : c[k].updated++;
  };
  const chunks = <X>(xs: X[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

  const report: Record<string, Counts> = {};
  try {
    for (const slug of allSlugs) {
      const s = scans.find((x) => x.slug === slug);
      const c: Counts = (report[slug] = {});

      const cl = await db.insert(T.clients)
        .values({ slug, name: s?.name || slug, stage: s?.stage || null, website: s?.profile?.website || null })
        .onConflictDoUpdate({ target: T.clients.slug, set: keepOld(T.clients, ["name", "stage", "website"]) })
        .returning({ id: T.clients.id, inserted });
      tally(c, "clients", cl);
      const clientId = cl[0].id;

      if (s?.profile || s?.ctx) {
        const { website: _w, ...p } = s.profile || ({} as any);
        const keys = ["icp", "offer", "personalization", "infrastructureStatus", "stack", "angles", "contextMd"];
        tally(c, "profiles", await db.insert(T.clientProfiles)
          .values({ clientId, ...p, contextMd: s.ctx })
          .onConflictDoUpdate({ target: T.clientProfiles.clientId, set: { ...keepOld(T.clientProfiles, keys), updatedAt: sql`now()` } })
          .returning({ inserted }));
      }

      for (const f of s?.files || []) {
        let storagePath: string | null = null;
        if (f.binary) {
          storagePath = join(slug, f.rel);
          mkdirSync(dirname(resolve(storageDir, storagePath)), { recursive: true });
          copyFileSync(f.abs, resolve(storageDir, storagePath));
        }
        const row = { kind: f.kind, mime: f.mime, size: f.size, contentText: f.contentText, storagePath };
        const hit = await db.select({ id: T.files.id }).from(T.files).where(and(eq(T.files.clientId, clientId), eq(T.files.filename, f.rel)));
        if (hit.length) await db.update(T.files).set(row).where(eq(T.files.id, hit[0].id));
        else await db.insert(T.files).values({ clientId, filename: f.rel, ...row });
        tally(c, "files", [{ inserted: !hit.length }]);
      }

      for (const q of s?.sequences || []) {
        const row = { sequence: q.sequence, persona: s?.state?.persona || null, segment: s?.state?.segment || null,
          targetMarket: s?.state?.market || null, sendingProvider: (s?.profile?.stack as any)?.sending || null };
        const hit = await db.select({ id: T.campaigns.id }).from(T.campaigns).where(and(eq(T.campaigns.clientId, clientId), eq(T.campaigns.name, q.name)));
        if (hit.length) await db.update(T.campaigns).set(row).where(eq(T.campaigns.id, hit[0].id));
        else await db.insert(T.campaigns).values({ clientId, name: q.name, ...row });
        tally(c, "campaigns", [{ inserted: !hit.length }]);
      }

      const cos = mergeBy([...(s?.companies || []), ...(sb.companies.get(slug) || []).map(companyFromRow)], (r) => r.domain);
      const coKeys = ["segment", "targetMarket", "listSource", "companyName", "industry", "companySize", "location", "linkedinUrl", "phone", "raw"];
      for (const part of chunks(cos))
        tally(c, "companies", await db.insert(T.companies).values(part.map((r) => ({ ...r, clientId, domain: r.domain! })))
          .onConflictDoUpdate({ target: [T.companies.clientId, T.companies.domain], set: keepOld(T.companies, coKeys) })
          .returning({ inserted }));

      const cts = mergeBy([...(s?.contacts || []), ...(sb.contacts.get(slug) || []).map(contactFromRow)], (r) => r.email);
      const ctKeys = ["firstName", "lastName", "companyName", "companyDomain", "title", "linkedinUrl", "findSource", "emailStatus", "sendable", "verifyNote", "raw"];
      for (const part of chunks(cts))
        tally(c, "contacts", await db.insert(T.contacts).values(part.map((r) => ({ ...r, clientId, email: r.email!, sendable: r.sendable ?? false })))
          .onConflictDoUpdate({ target: [T.contacts.clientId, T.contacts.email], set: keepOld(T.contacts, ctKeys) })
          .returning({ inserted }));
      await db.execute(sql`update contacts c set company_id = co.id from companies co
        where c.client_id = ${clientId} and co.client_id = c.client_id and c.company_id is null and co.domain = c.company_domain`);

      for (const stage of s?.approvals || []) {
        const hit = await db.select({ id: T.approvals.id }).from(T.approvals)
          .where(and(eq(T.approvals.clientId, clientId), eq(T.approvals.stage, stage), eq(T.approvals.note, "migrated")));
        if (!hit.length) await db.insert(T.approvals).values({ clientId, stage, decision: "approved", snapshot: s?.state, note: "migrated" });
        tally(c, "approvals", [{ inserted: !hit.length }]);
      }
    }
  } finally {
    await pool.end();
  }

  console.log("Imported (new / updated):");
  for (const [slug, c] of Object.entries(report))
    console.log(`  ${slug}: ` + Object.entries(c).map(([k, v]) => `${k} ${v.new}/${v.updated}`).join(", "));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
