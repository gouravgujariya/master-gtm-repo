// AgenticData — PRIMARY decision-maker finder. Base https://api.agenticdata.host · Bearer ADATA_live_…
// See references/agenticdata-api.md. Persona-first: pass the pinned target title.
import type { Ctx } from "../core/ctx.ts";
import { ProviderError } from "../core/errors.ts";

const BASE = "https://api.agenticdata.host";
export const clean = (d: string) => (d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

export async function ad(ctx: Ctx, path: string, init: RequestInit = {}): Promise<any> {
  const H = { Authorization: `Bearer ${ctx.getKey("ADATA_API_KEY")}`, "Content-Type": "application/json" };
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) }, signal: ctx.signal });
  const t = await res.text();
  let j: any; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!res.ok) throw new ProviderError(`AgenticData ${path}`, res.status, t.slice(0, 200));
  return j;
}

const SENIORITY = ["founder", "owner", "ceo", "chief", "president", "vp", "vice president", "head", "director", "principal", "partner", "manager"];
const seniorityScore = (t: string) => { const l = (t || "").toLowerCase(); let b = 0; SENIORITY.forEach((k, i) => { if (l.includes(k)) b = Math.max(b, 100 - i); }); return b; };

export async function searchPeople(ctx: Ctx, domain: string, title?: string, limit = 5): Promise<any[]> {
  const q = new URLSearchParams({ company_domain: domain, limit: String(limit) });
  if (title) q.set("title", title);
  const r = await ad(ctx, `/v1/search/people?${q.toString()}`);
  return r.results ?? r.data ?? r.people ?? [];
}

export async function findEmail(ctx: Ctx, first: string, last: string, domain: string): Promise<string | null> {
  try {
    const r = await ad(ctx, "/v1/email/find", { method: "POST", body: JSON.stringify({ first_name: first, last_name: last, domain }) });
    return r.email ?? r.result?.email ?? r.data?.email ?? (typeof r.result === "string" ? r.result : null);
  } catch { return null; }
}

/** Best-ranked person at `domain` (matching title) that has / gets an email, or null. */
export async function pickForCompany(ctx: Ctx, domain: string, title?: string): Promise<Record<string, string> | null> {
  const people = await searchPeople(ctx, domain, title, 5);
  if (!people.length) return null;
  const ranked = people
    .map((p) => ({ p, score: (p.primary_email ? 50 : 0) + seniorityScore(p.job_title || "") }))
    .sort((a, b) => b.score - a.score);
  for (const { p } of ranked) {
    let email = p.primary_email || null;
    if (!email) email = await findEmail(ctx, p.first_name || "", p.last_name || "", domain);
    if (email) return {
      email: String(email).toLowerCase(), first_name: p.first_name || "", last_name: p.last_name || "",
      company_name: p.company_name || "", company_domain: domain, title: p.job_title || "",
      linkedin_url: p.linkedin_url || "", find_source: "agenticdata",
    };
  }
  return null;
}
