// FireCrawl adapter: map a site's links, scrape a page to markdown.
import type { Ctx } from "../core/ctx.ts";
import { ProviderError } from "../core/errors.ts";

async function fc(ctx: Ctx, path: string, body: unknown): Promise<any> {
  const r = await fetch(`https://api.firecrawl.dev${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.getKey("FIRECRAWL_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: ctx.signal,
  });
  if (!r.ok) throw new ProviderError(`FireCrawl ${path}`, r.status, await r.text());
  return r.json();
}

/** All link URLs FireCrawl finds on the site. */
export async function mapSite(ctx: Ctx, url: string, limit = 60): Promise<string[]> {
  const map = await fc(ctx, "/v1/map", { url, limit });
  return (map.links || []).map((l: any) => (typeof l === "string" ? l : l.url)).filter(Boolean);
}

/** Main-content markdown of one page ("" if none). */
export async function scrapeMarkdown(ctx: Ctx, url: string): Promise<string> {
  const r = await fc(ctx, "/v1/scrape", { url, formats: ["markdown"], onlyMainContent: true });
  return (r.data || {}).markdown || "";
}
