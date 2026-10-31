/**
 * research.ts — deterministic website research via FireCrawl (the "do-it" part of Step 1).
 * Scrapes the client's site (homepage + likely customer/case-study/about/services pages) and saves the
 * combined text to profiles/<client>/research/website-research.md. Claude Code then reads this to draft
 * the ICP + extract lookalike seeds. Logic lives in src/core/research.ts.
 *
 *   npm run research -- --client="Acme Co" --website=https://acme.com
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { args } from "../lib/env.ts";
import { cliCtx, runCli } from "../src/core/ctx.ts";
import { researchWebsite } from "../src/core/research.ts";

const ROOT = resolve(import.meta.dirname, "..");
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

runCli(async () => {
  const ctx = cliCtx();
  ctx.getKey("FIRECRAWL_API_KEY"); // fail fast, as before
  const a = args();
  const client = slug(String(a.client || ""));
  const website = String(a.website || "").trim();
  if (!client || !website) { console.error('Usage: --client="Acme Co" --website=https://acme.com'); process.exit(1); }

  const out = await researchWebsite(ctx, String(a.client), website);

  const dir = resolve(ROOT, "profiles", client, "research"); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "website-research.md"), out);
  console.log(`\n✓ Saved research (${out.length} chars) to profiles/${client}/research/website-research.md`);
  console.log(`Next: in Claude Code, draft the ICP + lookalike seeds from this research into client-profile.yaml.`);
});
