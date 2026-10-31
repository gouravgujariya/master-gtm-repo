// GET /api/lookup?url= — homepage title/description/favicon. No API key, 5s timeout.
import { lookup as dnsLookup } from "node:dns/promises";
import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../core/errors.ts";
import { parse, type Env } from "./auth.ts";

export interface SiteInfo { domain: string; name: string; description: string; favicon: string }

/** "https://www.Acme.com/x" | "acme.com" → "acme.com". */
export function normalizeDomain(input: string): string {
  const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Attribute value of the first tag matching `tagRe` (attribute order agnostic). */
function attr(html: string, tagRe: RegExp, name: string): string | undefined {
  for (const tag of html.match(tagRe) ?? []) {
    const v = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
    if (v) return decode(v);
  }
}

// ponytail: regex HTML parsing — good enough for <head> tags; swap for a parser if sites break it.
export function parseHead(html: string, base: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description = attr(html, /<meta[^>]+name=["']description["'][^>]*>/gi, "content")
    ?? attr(html, /<meta[^>]+property=["']og:description["'][^>]*>/gi, "content") ?? "";
  const icon = attr(html, /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi, "href") ?? "/favicon.ico";
  return { title: title ? decode(title) : "", description, favicon: new URL(icon, base).href };
}

// Block SSRF to internal addresses (Railway private network, localhost, link-local metadata).
// ponytail: checks the first hop only; redirects aren't re-checked — use redirect:"manual" if that matters.
const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe80:|::ffff:(10|127|192\.168|169\.254)\.)/i;
export const isPrivateIp = (ip: string) => PRIVATE.test(ip);
async function assertPublicHost(host: string) {
  const addrs = await dnsLookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("private address");
}

export async function lookupSite(url: string): Promise<SiteInfo> {
  let domain: string;
  try { domain = normalizeDomain(url); } catch { throw new AppError(422, "LOOKUP_FAILED", `Bad URL: ${url}`); }
  try {
    await assertPublicHost(domain);
    const res = await fetch(`https://${domain}`, { signal: AbortSignal.timeout(5000), headers: { "user-agent": "Mozilla/5.0 (gtm-lookup)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const head = parseHead((await res.text()).slice(0, 200_000), res.url);
    // "Acme | Best widgets" → "Acme"; fall back to the domain
    const name = head.title.split(/\s+[|·–—:-]\s+/)[0] || domain;
    return { domain, name, description: head.description, favicon: head.favicon };
  } catch (e) {
    throw new AppError(422, "LOOKUP_FAILED", `Could not read ${domain}: ${(e as Error).message}`);
  }
}

export const lookupRoutes = new Hono<Env>()
  .get("/", async (c) => c.json(await lookupSite(parse(z.string().min(1), c.req.query("url")))));
