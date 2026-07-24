/**
 * new-client.ts — scaffold a client workspace from the template.
 *   npm run new-client -- --name="Acme Co"
 * Creates profiles/<slug>/ (context.md, client-profile.yaml, inputs/, lead-database/, campaigns/, research/, results/)
 * stamped with the client name. Refuses to overwrite an existing client folder.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { args } from "../lib/env.ts";

const ROOT = resolve(import.meta.dirname, "..");
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function stamp(file: string, name: string, slug: string) {
  if (!existsSync(file)) return;
  let t = readFileSync(file, "utf8");
  t = t.replace(/<Client Name>/g, name).replace(/example-co/g, slug).replace(/Example Co/g, name)
       .replace(/https:\/\/example\.com/g, "");
  writeFileSync(file, t);
}

function main() {
  const a = args();
  const name = String(a.name || "").trim();
  if (!name) { console.error('Usage: npm run new-client -- --name="Acme Co"'); process.exit(1); }
  const slug = slugify(name);
  const src = resolve(ROOT, "profiles/_TEMPLATE-client");
  const dst = resolve(ROOT, "profiles", slug);
  if (existsSync(dst)) { console.error(`❌ profiles/${slug}/ already exists — pick another name or edit it directly.`); process.exit(1); }

  cpSync(src, dst, { recursive: true, filter: (s) => !s.includes(".claude-flow") && !s.endsWith(".DS_Store") });
  stamp(resolve(dst, "context.md"), name, slug);
  stamp(resolve(dst, "client-profile.yaml"), name, slug);

  console.log(`✓ Created profiles/${slug}/`);
  console.log(`  inputs/          → drop the questionnaire + client docs here`);
  console.log(`  lead-database/   → all lead CSVs + final-campaign-<slug>.csv land here`);
  console.log(`  context.md, client-profile.yaml → the brief`);
  console.log(`\nNext: fill inputs/questionnaire.md, then run /cold-email-kickoff (step-by-step, with sign-off).`);
}

main();
