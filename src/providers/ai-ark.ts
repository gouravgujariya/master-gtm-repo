// AI Ark — company/lookalike search, async email-finder, and catch-all cross-check.
// Base https://api.ai-ark.com/api/developer-portal | header X-TOKEN | see references/ai-ark-api.md
// NOTE: the people-search filter DSL (account.domain / contact.fullName) is best-effort.
import type { Ctx } from "../core/ctx.ts";
import { MissingKeyError, ProviderError } from "../core/errors.ts";
import { sleep } from "../../lib/env.ts";

const BASE = "https://api.ai-ark.com/api/developer-portal";

export async function ark(ctx: Ctx, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-TOKEN": ctx.getKey("AI_ARK_API_KEY"), "Content-Type": "application/json", ...(init.headers || {}) },
    signal: ctx.signal,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new ProviderError(`AI Ark ${path}`, res.status, text.slice(0, 400));
  return json;
}

export async function credits(ctx: Ctx): Promise<number> {
  const c = await ark(ctx, "/v1/payments/credits");
  return c.total ?? c.balance ?? 0;
}

function normalizeLinkedin(url: string): string {
  let u = url.trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return `https://www.${u}`;
}

/**
 * People search. Prefer linkedin (exact match) when available; else domain + fullName.
 * DSL per AI Ark docs: filters are { any: { include: [...] } }; text filters use { mode, content:[...] }.
 */
export async function searchPeople(ctx: Ctx, opts: { domain?: string; fullName?: string; linkedin?: string; seniority?: string[] }, size = 5): Promise<{ trackId: string; people: any[] }> {
  const contact: any = {};
  if (opts.linkedin) contact.linkedin = { any: { include: [normalizeLinkedin(opts.linkedin)] } };
  if (opts.fullName) contact.fullName = { any: { include: { mode: "SMART", content: [opts.fullName] } } };
  if (opts.seniority?.length) contact.seniority = { any: { include: opts.seniority } };
  const account: any = {};
  if (opts.domain) account.domain = { any: { include: [opts.domain] } };

  const body: any = { page: 0, size };
  if (Object.keys(account).length) body.account = account;
  if (Object.keys(contact).length) body.contact = contact;

  const r = await ark(ctx, "/v1/people", { method: "POST", body: JSON.stringify(body) });
  return { trackId: r.trackId, people: r.content ?? [] };
}

// AI Ark's email-finder REQUIRES a webhook field even though we retrieve results by polling /inquiries.
// Override with a real endpoint via AI_ARK_WEBHOOK if you want push delivery too.
function webhook(ctx: Ctx): string {
  try { return ctx.getKey("AI_ARK_WEBHOOK"); } catch { return "https://webhook.site/00000000-0000-0000-0000-000000000000"; }
}

/** Submit email-finder for a trackId, then poll inquiries until DONE. Resilient to transient poll errors. */
export async function findEmails(ctx: Ctx, trackId: string): Promise<any[]> {
  try { await ark(ctx, "/v1/people/email-finder", { method: "POST", body: JSON.stringify({ trackId, webhook: webhook(ctx) }) }); }
  catch { /* may already be submitted / auto-refunded; still try to read results */ }
  let last: any[] = [];
  for (let i = 0; i < 20; i++) {
    await sleep(2500);
    try {
      const r = await ark(ctx, `/v1/people/email-finder/${trackId}/inquiries?page=0&size=100`);
      const content: any[] = r.content ?? [];
      if (content.length) last = content;
      if (content.length && content.every((c) => (c.state || "").toUpperCase() === "DONE")) return content;
    } catch { /* transient (job warming / 403 refund) — retry */ }
  }
  return last;
}

/** Best verified email from an inquiry's output[]: prefer SMTP+VALID, else CATCH_ALL. */
export function bestEmail(inquiry: any): { email: string | null; domainType: string; status: string } {
  const outs: any[] = inquiry?.output ?? [];
  const smtp = outs.find((o) => (o.domainType || "").toUpperCase() === "SMTP" && (o.status || "").toUpperCase() === "VALID");
  if (smtp) return { email: smtp.address, domainType: "SMTP", status: "VALID" };
  const any = outs.find((o) => o.found && o.address);
  return any ? { email: any.address, domainType: any.domainType || "", status: any.status || "" } : { email: null, domainType: "", status: "not_found" };
}

export async function findOne(ctx: Ctx, first: string, last: string, domain: string, linkedin?: string) {
  const { trackId, people } = await searchPeople(ctx, { domain, fullName: `${first} ${last}`.trim(), linkedin });
  if (!trackId) { ctx.log(`No trackId returned. Raw people count: ${people.length}`); return null; }
  ctx.log(`Search matched ${people.length} people (trackId ${trackId}). Running email-finder...`);
  const inquiries = await findEmails(ctx, trackId);
  const r = bestEmail(inquiries[0] || {});
  ctx.log(r.email ? `Found: ${r.email}  [${r.domainType}/${r.status}]` : "No email found by AI Ark.");
  return r;
}

export const cleanDomain = (d: string) => (d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

/** One decision-maker + verified email for a company (by domain), or null. Logs the miss reason / hit line. */
export async function findForCompany(ctx: Ctx, domain: string, seniority: string[], company_name = ""): Promise<Record<string, string> | null> {
  const { trackId, people } = await searchPeople(ctx, { domain, seniority }, 5);
  if (!trackId || !people.length) { ctx.log(`  - ${domain}: no decision-maker found`); return null; }
  const inquiries = await findEmails(ctx, trackId);
  let best: any = null;
  for (const inq of inquiries) {
    const e = bestEmail(inq);
    if (!e.email) continue;
    const fn = inq.input?.firstname || "", ln = inq.input?.lastname || "";
    const person = people.find((p) => `${p.first_name} ${p.last_name}`.toLowerCase() === `${fn} ${ln}`.toLowerCase()) || {};
    const cand = { email: e.email, domainType: e.domainType, status: e.status, first_name: fn || person.first_name || "", last_name: ln || person.last_name || "", title: person.job_title || "", linkedin: person.linkedin_url || "" };
    if (e.domainType === "SMTP" && e.status === "VALID") { best = cand; break; }
    if (!best) best = cand;
  }
  if (!best) { ctx.log(`  - ${domain}: person found but no email`); return null; }
  ctx.log(`  ✓ ${domain}: ${best.email} [${best.domainType}/${best.status}] — ${best.first_name} ${best.last_name}, ${best.title}`);
  return {
    email: best.email, first_name: best.first_name, last_name: best.last_name,
    company_name, company_domain: domain, title: best.title,
    linkedin_url: best.linkedin, find_source: "ai-ark", ai_ark_status: `${best.domainType}/${best.status}`,
  };
}

/** Cross-check one verified row: catch-all rows get rescued (AI Ark SMTP/VALID) or marked unsendable. */
export async function recheckCatchAll(ctx: Ctx, r: Record<string, string>): Promise<Record<string, string>> {
  const status = (r.email_status || "").toLowerCase().replace("_", "-");
  if (status !== "catch-all") return r;
  const first = r.first_name || "", last = r.last_name || "", domain = r.company_domain || "", linkedin = r.linkedin_url || "";
  try {
    const { trackId } = await searchPeople(ctx, { domain, fullName: `${first} ${last}`.trim(), linkedin }, 3);
    const inquiries = trackId ? await findEmails(ctx, trackId) : [];
    const best = bestEmail(inquiries[0] || {});
    if (best.email && best.domainType === "SMTP" && best.status === "VALID")
      return { ...r, email: best.email, email_status: "valid", sendable: "yes", verify_note: "catch-all rescued: AI Ark SMTP/VALID" };
    return { ...r, sendable: "no", verify_note: `catch-all dropped: AI Ark ${best.domainType || "no"}/${best.status}` };
  } catch (e: any) {
    if (e instanceof MissingKeyError) throw e;
    return { ...r, sendable: "no", verify_note: `catch-all cross-check error: ${e.message?.slice(0, 80)}` };
  }
}

export async function searchCompanies(ctx: Ctx, lookalike: string[], size: number) {
  const body: any = { page: 0, size };
  if (lookalike.length) body.lookalikeDomains = lookalike.slice(0, 5);
  const r = await ark(ctx, "/v1/companies", { method: "POST", body: JSON.stringify(body) });
  const fmtSize = (s: any) => !s ? "" : (s.end != null ? `${s.start}-${s.end}` : `${s.start}+`);
  const companies = (r.content ?? []).map((c: any) => ({
    company_name: c?.summary?.name ?? "",
    domain: c?.link?.domain ?? "",
    industry: c?.summary?.industry ?? "",
    size: fmtSize(c?.summary?.staff?.range),
    location: c?.location?.headquarter?.city ?? c?.location?.headquarter?.state ?? "",
  }));
  ctx.log(`AI Ark returned ${companies.length} companies (total ${r.totalElements ?? "?"}).`);
  return companies;
}
