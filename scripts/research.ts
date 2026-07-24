/**
 * research.ts — deterministic website research via FireCrawl (the "do-it" part of Step 1).
 * Scrapes the client's site (homepage + likely customer/case-study/about/services pages) and saves the
 * combined text to profiles/<client>/research/website-research.md. Claude Code then reads this to draft
 * the ICP + extract lookalike seeds.
 *
 *   npm run research -- --client="Acme Co" --website=https://acme.com
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, args } from "../lib/env.ts";

const FC = requireKey("FIRECRAWL_API_KEY");
const ROOT = resolve(import.meta.dirname, "..");
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function fc(path: string, body: any): Promise<any> {
  const r = await fetch(`https://api.firecrawl.dev${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${FC}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}

async function main() {
  const a = args();
  const client = slug(String(a.client || ""));
  let website = String(a.website || "").trim();
  if (!client || !website) { console.error('Usage: --client="Acme Co" --website=https://acme.com'); process.exit(1); }
  if (!/^https?:\/\//.test(website)) website = "https://" + website;

  console.log(`Mapping ${website} …`);
  const map = await fc("/v1/map", { url: website, limit: 60 });
  const links: string[] = (map.links || []).map((l: any) => (typeof l === "string" ? l : l.url)).filter(Boolean);

  // pick the most useful pages: homepage + customer/case-study/about/portfolio/service pages
  const want = /customer|case-stud|client|about|portfolio|service|solution|product|testimonial/i;
  const picks = [website, ...links.filter((l) => want.test(l))].slice(0, 8);
  const uniq = [...new Set(picks)];
  console.log(`Scraping ${uniq.length} pages…`);

  let out = `# Website research — ${a.client}\nSource: ${website}\n\n`;
  for (const url of uniq) {
    try {
      const r = await fc("/v1/scrape", { url, formats: ["markdown"], onlyMainContent: true });
      const md = (r.data || {}).markdown || "";
      if (md) out += `\n\n## ${url}\n\n${md.slice(0, 4000)}\n`;
      console.log(`  ✓ ${url}`);
    } catch { console.log(`  - ${url} (failed)`); }
  }

  const dir = resolve(ROOT, "profiles", client, "research"); mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "website-research.md");
  writeFileSync(file, out);
  console.log(`\n✓ Saved research (${out.length} chars) to profiles/${client}/research/website-research.md`);
  console.log(`Next: in Claude Code, draft the ICP + lookalike seeds from this research into client-profile.yaml.`);
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
