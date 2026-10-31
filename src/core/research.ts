// Step 1 website research: map the site, scrape homepage + likely customer/case-study/about/service pages,
// return combined markdown for drafting the ICP + lookalike seeds.
import type { Ctx } from "./ctx.ts";
import { mapSite, scrapeMarkdown } from "../providers/firecrawl.ts";

export async function researchWebsite(ctx: Ctx, clientName: string, website: string): Promise<string> {
  if (!/^https?:\/\//.test(website)) website = "https://" + website;

  ctx.log(`Mapping ${website} …`);
  const links = await mapSite(ctx, website, 60);

  // pick the most useful pages: homepage + customer/case-study/about/portfolio/service pages
  const want = /customer|case-stud|client|about|portfolio|service|solution|product|testimonial/i;
  const uniq = [...new Set([website, ...links.filter((l) => want.test(l))].slice(0, 8))];
  ctx.log(`Scraping ${uniq.length} pages…`);

  let out = `# Website research — ${clientName}\nSource: ${website}\n\n`;
  for (const url of uniq) {
    try {
      const md = await scrapeMarkdown(ctx, url);
      if (md) out += `\n\n## ${url}\n\n${md.slice(0, 4000)}\n`;
      ctx.log(`  ✓ ${url}`);
    } catch { ctx.log(`  - ${url} (failed)`); }
  }
  return out;
}
