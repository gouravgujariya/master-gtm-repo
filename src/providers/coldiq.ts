// ColdIQ — LAST-RESORT work-email finder (LimaData: LinkedIn / name+domain -> work email).
// See references/coldiq-api.md.
import type { Ctx } from "../core/ctx.ts";
import { ProviderError } from "../core/errors.ts";

const BASE = "https://api.coldiq.com";

export async function ciq(ctx: Ctx, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ctx.getKey("COLDIQ_API_KEY")}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: ctx.signal,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new ProviderError(`ColdIQ ${path}`, res.status, text.slice(0, 300));
  return json;
}

function normalizeLinkedIn(url: string): string {
  const u = url.trim();
  return u.startsWith("http") ? u : `https://${u}`;
}

/** Returns the found work email (or null). */
export async function findWorkEmail(ctx: Ctx, linkedin: string): Promise<string | null> {
  const r = await ciq(ctx, "/v1/limadata/find/work-email-linkedin", {
    method: "POST",
    body: JSON.stringify({ linkedin_url: normalizeLinkedIn(linkedin) }),
  });
  // LimaDataResponse is untyped/nullable — try common shapes
  return r?.email ?? r?.work_email ?? r?.data?.email ?? r?.result?.email ?? (typeof r === "string" ? r : null);
}

/** Fallback finder by name + company domain (when no LinkedIn URL is available). */
export async function findWorkEmailByName(ctx: Ctx, fullName: string, domain: string): Promise<string | null> {
  const r = await ciq(ctx, "/v1/limadata/find/work-email", {
    method: "POST",
    body: JSON.stringify({ full_name: fullName, company_domain: domain }),
  });
  return r?.email ?? r?.work_email ?? r?.data?.email ?? r?.result?.email ?? (typeof r === "string" ? r : null);
}
