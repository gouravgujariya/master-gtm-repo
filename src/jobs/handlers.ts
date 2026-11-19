// Job handlers: one per JobType (see docs/backend-contract.md). Each = compute (pure-ish, testable without a DB)
// + persist (shared with demo fixtures so the UI reads the DB the same way either way).
// Strategy rules (fixed): bulk first · find AgenticData → AI Ark → ColdIQ · verify every email · DRAFT only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Ctx } from "../core/ctx.ts";
import { AppError, MissingKeyError } from "../core/errors.ts";
import type { JobType } from "../core/gates.ts";
import { researchWebsite } from "../core/research.ts";
import { sourceCompanies } from "../core/source.ts";
import { findContact } from "../core/find.ts";
import { verifyRows } from "../core/verify.ts";
import { createDraft } from "../core/draft.ts";
import { recheckCatchAll, searchCompanies, cleanDomain } from "../providers/ai-ark.ts";
import { scrapeMarkdown } from "../providers/firecrawl.ts";
import { countSegments } from "../providers/bulk.ts";
import { config } from "../config.ts";
import type { DB } from "../db/client.ts";
import * as t from "../db/schema.ts";

export type Job = typeof t.jobs.$inferSelect;
export type Result = Record<string, any>;
type Row = Record<string, string>;

// ---------- pure cores (tests call these) ----------

export interface SourceInput {
  dataset: "saas" | "local" | "lookalike";
  filters?: Record<string, string>;
  seedDomains?: string[];
  allowPaid?: boolean;
  reason?: string;
  limit?: number;
}

/** Domains in a do-not-contact list: any domain or email per line / CSV cell. */
export function parseDncDomains(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:[\w.+-]+@)?((?:[a-z0-9-]+\.)+[a-z]{2,})/gi)) out.add(cleanDomain(m[1]).toLowerCase());
  return [...out].filter(Boolean);
}

/** Bulk first; lookalike is paid → needs allowPaid + reason (enforced by sourceCompanies).
 *  `skip` = domain → why it must not be sourced (already used / DNC / competitor / the client itself); a Set means "already used". */
export async function sourceCore(ctx: Ctx, input: SourceInput, skip: Set<string> | Map<string, string> = new Map(), dir = config().BULK_DIR) {
  const limit = input.limit ?? 25;
  const used = skip instanceof Map ? new Map(skip) : new Map([...skip].map((d) => [d, "already used for this client"]));
  const paid = input.dataset === "lookalike"
    ? (c: Ctx) => { if (!input.seedDomains?.length) throw new AppError(400, "NO_SEEDS", "lookalike needs seedDomains"); return searchCompanies(c, input.seedDomains, limit + used.size); }
    : undefined;
  // ponytail: over-fetch by used.size so skipping still fills `limit`; bulk streams with early exit so it's cheap.
  const rows = await sourceCompanies(ctx, {
    dataset: input.dataset === "local" ? "local" : "saas", filters: input.filters, limit: limit + used.size,
    dir, paid, allowPaid: input.allowPaid, reason: input.reason,
  });
  const companies = [], skipped: Record<string, number> = {};
  for (const r of rows) {
    const domain = cleanDomain(r.domain || "").toLowerCase();
    if (!domain) continue;
    const why = used.get(domain);
    if (why) { skipped[why] = (skipped[why] ?? 0) + 1; ctx.log(`  - ${domain}: ${why} — skipped`); continue; }
    used.set(domain, "duplicate in this list");
    companies.push({
      companyName: r.company_name || "", domain, industry: r.industry || r.category || "",
      companySize: r.employees || r.size || "", location: r.location || [r.locality, r.country].filter(Boolean).join(", ") || r.zip || "",
      listSource: r.source || "ai-ark-lookalike",
    });
    if (companies.length >= limit) break;
  }
  ctx.log(`✓ ${companies.length} companies (${input.dataset})`);
  return { companies, skipped };
}

/** One decision-maker per company through the fixed waterfall; keeps find_source. */
export async function findCore(ctx: Ctx, companies: { domain: string; companyName?: string | null }[], titles?: string[]) {
  // findContact swallows per-provider errors; with NO finder key at all, surface MissingKeyError (→ demo under auto)
  const keys = ["ADATA_API_KEY", "AI_ARK_API_KEY", "COLDIQ_API_KEY"];
  if (!keys.some((k) => { try { return !!ctx.getKey(k); } catch { return false; } })) ctx.getKey(keys[0]);
  const contacts = [];
  for (const c of companies) {
    if (ctx.signal?.aborted) throw new Error("cancelled");
    // ponytail: AgenticData takes one title filter; first title wins. findContact already ranks + selects per company.
    const hit = await findContact(ctx, { domain: c.domain, title: titles?.[0], company_name: c.companyName || "" });
    if (!hit) continue;
    contacts.push({
      email: hit.email.toLowerCase(), firstName: hit.first_name || "", lastName: hit.last_name || "", title: hit.title || "",
      companyName: hit.company_name || "", companyDomain: hit.company_domain || c.domain, findSource: hit.find_source,
      linkedinUrl: hit.linkedin_url || "", ...(hit.ai_ark_status ? { aiArkStatus: hit.ai_ark_status } : {}),
    });
  }
  ctx.log(`✓ ${contacts.length}/${companies.length} companies have a decision-maker`);
  return { contacts };
}

type QualifyRow = { domain: string; qualified: boolean | null; reason: string };
/** AI qualification: scrape each homepage, one yes/no + reason per company. Unreachable site → null (never guessed).
 *  scrape/judge are injectable so tests need no network or LLM. */
export async function qualifyCore(
  ctx: Ctx, companies: { domain: string; companyName?: string | null }[], criterion: string,
  scrape = scrapeMarkdown, judge?: (c: Ctx, i: { criterion: string; companies: { domain: string; name?: string; site: string }[] }) => Promise<{ results: { domain: string; qualified: boolean; reason: string }[]; costUsd: number }>,
) {
  ctx.getKey("FIRECRAWL_API_KEY"); // fail fast (→ demo under auto) before paying for any scrape
  if (!judge) { ctx.getKey("ANTHROPIC_API_KEY"); judge = (await agents()).runQualify; }
  const results: QualifyRow[] = [], sites = [];
  for (const c of companies) {
    if (ctx.signal?.aborted) throw new Error("cancelled");
    try {
      const site = (await scrape(ctx, `https://${c.domain}`)).slice(0, 3000);
      if (site.trim()) { sites.push({ domain: c.domain, name: c.companyName || "", site }); continue; }
    } catch { /* unreachable below */ }
    results.push({ domain: c.domain, qualified: null, reason: "site unreachable — check by hand" });
    ctx.log(`  - ${c.domain}: site unreachable`);
  }
  ctx.log(`Asking: "${criterion}" for ${sites.length} companies…`);
  const r = sites.length ? await judge(ctx, { criterion, companies: sites }) : { results: [], costUsd: 0 };
  results.push(...r.results);
  const counts = { qualified: results.filter((x) => x.qualified === true).length, rejected: results.filter((x) => x.qualified === false).length, unknown: results.filter((x) => x.qualified === null).length };
  ctx.log(`✓ qualified ${counts.qualified} · rejected ${counts.rejected} · unknown ${counts.unknown}`);
  return { results, counts, costUsd: r.costUsd };
}

/** OptimaVerifier gate + AI Ark catch-all cross-check. Rows are snake_case like the CLI CSVs. */
export async function verifyCore(ctx: Ctx, rows: Row[], jobName = "gtm-worker") {
  const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r]));
  const gated = await verifyRows(ctx, rows, {
    jobName,
    // no AI Ark key → catch-all simply stays unsendable (held); never fail the whole verify for it
    crossCheckCatchAll: (email) => recheckCatchAll(ctx, { ...byEmail.get(email), email, email_status: "catch-all" })
      .then((r) => r.sendable === "yes", (e) => { if (e instanceof MissingKeyError) return false; throw e; }),
  });
  const contacts = gated.map((r) => ({ email: r.email.toLowerCase(), emailStatus: r.email_status, sendable: r.sendable === "yes", verifyNote: r.verify_note }));
  const sendable = contacts.filter((c) => c.sendable).length;
  const dropped = contacts.filter((c) => !c.sendable && /invalid/i.test(c.emailStatus)).length;
  const counts = { sendable, dropped, held: contacts.length - sendable - dropped };
  ctx.log(`✓ sendable ${counts.sendable} · held ${counts.held} · dropped ${counts.dropped}`);
  return { contacts, counts };
}

const DEFAULT_SCHEDULE = () => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../app/default-sequence.json"), "utf8")).schedule;

/** campaigns.sequence ({subject, sequence:[{step,waitDays,body}]} from Copy, or already Plusvibe-shaped) → Plusvibe.
 *  Step 1 body becomes {{email_body}} when leads carry their own; follow-ups stay shared and thread (no subject). */
export function plusvibeSeq(seq: any, perLeadBody: boolean) {
  let sequences: any[] = seq?.sequences ?? (seq?.sequence ?? []).map((s: any, i: number) => ({
    step: s.step ?? i + 1, wait_time: s.waitDays ?? 0,
    variations: [{ variation: "A", subject: i ? "" : seq.subject || "", name: "", body: s.body || "" }],
  }));
  if (perLeadBody && sequences[0]) sequences = [{ ...sequences[0], variations: sequences[0].variations.map((v: any) => ({ ...v, body: "{{email_body}}" })) }, ...sequences.slice(1)];
  return { campaign_name: seq?.campaign_name, schedule: seq?.schedule ?? DEFAULT_SCHEDULE(), sequences };
}

/** Lead rows (sendable "yes"/"no") → Plusvibe DRAFT. createDraft refuses 0 sendable before any API call. */
export async function draftCore(ctx: Ctx, rows: Row[], sequence: any, name: string) {
  const seq = plusvibeSeq(sequence, rows.some((r) => r.email_body));
  const r = await createDraft(ctx, { rows, seq, name, max: rows.length });
  return { externalCampaignId: r.campaignId, uploaded: r.added };
}

const emailBody = (p: any) => p?.body ?? "";
/** Copy result → per-lead personalization ({email, body}) keyed by lowercase email. */
export const copyLeads = (copy: any): Map<string, any> =>
  new Map((copy?.leads ?? []).map((l: any) => [String(l.email || "").toLowerCase(), l]));

// ---------- DB reads ----------

const one = async <T>(q: PromiseLike<T[]>) => (await q)[0];
const profile = (db: DB, clientId: string) => one(db.select().from(t.clientProfiles).where(eq(t.clientProfiles.clientId, clientId)));
const INPUT_KINDS = ["questionnaire", "transcript", "case_study"] as const;
/** The client's inputs (questionnaire + call transcripts + case studies) as labelled text for the LLM jobs. */
const questionnaire = async (db: DB, clientId: string) =>
  (await db.select({ k: t.files.kind, n: t.files.filename, c: t.files.contentText }).from(t.files)
    .where(and(eq(t.files.clientId, clientId), inArray(t.files.kind, [...INPUT_KINDS]))).orderBy(t.files.createdAt))
    .filter((f) => f.c).map((f) => `## ${f.k}: ${f.n}\n${f.c}`).join("\n\n") || undefined;
const feedback = (job: Job) => ((job.input as any)?.feedback as string | undefined) || undefined;
const segmentOf = (p: any, campaign: any) => (p?.angles?.segments ?? []).find((s: any) => s.name === campaign?.segment) ?? null;
const needCampaign = (job: Job) => { if (!job.campaignId) throw new AppError(400, "NO_CAMPAIGN", `${job.type} needs a campaign`); return job.campaignId; };

/** Contacts on this job's campaign, joined with their lead row. Leads the operator excluded are left out. */
function campaignContacts(db: DB, job: Job) {
  return db.select({ c: t.contacts, personalization: t.campaignLeads.personalization }).from(t.campaignLeads)
    .innerJoin(t.contacts, eq(t.contacts.id, t.campaignLeads.contactId))
    .where(and(eq(t.campaignLeads.campaignId, needCampaign(job)), ne(t.campaignLeads.status, "excluded")));
}

const snake = (c: typeof t.contacts.$inferSelect): Row => ({
  email: c.email, first_name: c.firstName || "", last_name: c.lastName || "", company_name: c.companyName || "",
  company_domain: c.companyDomain || "", title: c.title || "", linkedin_url: c.linkedinUrl || "",
  ai_ark_status: (c.raw as any)?.aiArkStatus || "", sendable: c.sendable ? "yes" : "no",
});

// ---------- persistence (live + demo share this) ----------

export const persist: Record<JobType, (db: DB, job: Job, r: Result) => Promise<void>> = {
  async research(db, job, r) {
    await db.insert(t.clientProfiles).values({ clientId: job.clientId, icp: r.icp })
      .onConflictDoUpdate({ target: t.clientProfiles.clientId, set: { icp: r.icp, updatedAt: new Date() } });
  },
  async competitors(db, job, r) {
    const patch = JSON.stringify({ competitors: r.competitors, queries: r.queries });
    await db.update(t.clientProfiles).set({ icp: sql`coalesce(${t.clientProfiles.icp}, '{}'::jsonb) || ${patch}::jsonb`, updatedAt: new Date() })
      .where(eq(t.clientProfiles.clientId, job.clientId));
  },
  async segments(db, job, r) {
    const { demo, costUsd, ...angles } = r;
    await db.update(t.clientProfiles).set({ angles, updatedAt: new Date() }).where(eq(t.clientProfiles.clientId, job.clientId));
  },
  async offer(db, job, r) {
    const { demo, costUsd, ...offer } = r;
    await db.update(t.campaigns).set({ offer }).where(eq(t.campaigns.id, needCampaign(job)));
  },
  async qualify(db, job, r) {
    const campaignId = needCampaign(job);
    for (const x of r.results ?? []) await db.update(t.companies).set({ qualified: x.qualified, qualifyReason: x.reason })
      .where(and(eq(t.companies.campaignId, campaignId), eq(t.companies.domain, String(x.domain).toLowerCase())));
  },
  async source(db, job, r) {
    if (!r.companies?.length) return;
    // unique (client_id, domain) → already-used domains never duplicate, even for fixtures
    await db.insert(t.companies).values(r.companies.map((c: any) => ({ ...c, clientId: job.clientId, campaignId: job.campaignId }))).onConflictDoNothing();
  },
  async find(db, job, r) {
    const campaignId = needCampaign(job);
    for (const c of r.contacts ?? []) {
      const company = await one(db.select({ id: t.companies.id }).from(t.companies)
        .where(and(eq(t.companies.clientId, job.clientId), eq(t.companies.domain, c.companyDomain))));
      const { aiArkStatus, ...rest } = c;
      const v = { ...rest, email: c.email.toLowerCase(), companyId: company?.id ?? null, raw: c };
      const vals = { ...v, clientId: job.clientId };
      const [row] = await db.insert(t.contacts).values(vals)
        .onConflictDoUpdate({ target: [t.contacts.clientId, t.contacts.email], set: v }).returning({ id: t.contacts.id });
      await db.insert(t.campaignLeads).values({ campaignId, contactId: row.id }).onConflictDoNothing();
    }
  },
  async verify(db, job, r) {
    for (const c of r.contacts ?? []) {
      const [row] = await db.update(t.contacts).set({ emailStatus: c.emailStatus, sendable: c.sendable, verifyNote: c.verifyNote })
        .where(and(eq(t.contacts.clientId, job.clientId), eq(t.contacts.email, c.email.toLowerCase()))).returning({ id: t.contacts.id });
      if (row) await db.insert(t.emailVerifications).values({ contactId: row.id, provider: "optimaverifier", verdict: c.emailStatus, raw: c });
    }
  },
  async copy(db, job, r) {
    const campaignId = needCampaign(job);
    await db.update(t.campaigns).set({ sequence: { subject: r.subject, sequence: r.sequence } }).where(eq(t.campaigns.id, campaignId));
    const per = copyLeads(r);
    for (const { c } of await campaignContacts(db, job)) {
      const p = per.get(c.email);
      if (p) await db.update(t.campaignLeads).set({ personalization: p })
        .where(and(eq(t.campaignLeads.campaignId, campaignId), eq(t.campaignLeads.contactId, c.id)));
    }
  },
  async draft(db, job, r) {
    const campaignId = needCampaign(job);
    await db.update(t.campaigns).set({ externalCampaignId: r.externalCampaignId, status: "drafted" }).where(eq(t.campaigns.id, campaignId));
    const ids = (await campaignContacts(db, job)).filter(({ c }) => c.sendable).map(({ c }) => c.id);
    if (ids.length) await db.update(t.campaignLeads).set({ status: "uploaded", uploadedAt: new Date() })
      .where(and(eq(t.campaignLeads.campaignId, campaignId), inArray(t.campaignLeads.contactId, ids)));
  },
};

// ---------- live compute (DB in → result out) ----------

// lazy: keeps the Agent SDK out of non-LLM jobs and tests
const agents = () => import("../agents/run.ts");

const compute: Record<JobType, (ctx: Ctx, job: Job, db: DB) => Promise<Result>> = {
  async research(ctx, job, db) {
    const client = await one(db.select().from(t.clients).where(eq(t.clients.id, job.clientId)));
    const website = (job.input as any)?.website || client?.website;
    if (!website) throw new AppError(400, "NO_WEBSITE", "research needs a website");
    const researchMd = await researchWebsite(ctx, client!.name, website);
    const dir = join(config().STORAGE_DIR, job.clientId), filename = `research-${Date.now()}.md`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), researchMd);
    await db.insert(t.files).values({ clientId: job.clientId, kind: "research", filename, mime: "text/markdown", size: Buffer.byteLength(researchMd), storagePath: join(dir, filename) });
    await db.insert(t.clientProfiles).values({ clientId: job.clientId, contextMd: researchMd })
      .onConflictDoUpdate({ target: t.clientProfiles.clientId, set: { contextMd: researchMd, updatedAt: new Date() } });
    const { costUsd, ...icp } = await (await agents()).runIcp(ctx, { website, researchMd, questionnaire: await questionnaire(db, job.clientId), feedback: feedback(job) });
    return { icp, costUsd };
  },
  async competitors(ctx, job, db) {
    return (await agents()).runCompetitors(ctx, { icp: (await profile(db, job.clientId))?.icp as any, feedback: feedback(job) });
  },
  async segments(ctx, job, db) {
    const icp: any = (await profile(db, job.clientId))?.icp;
    const r = await (await agents()).runSegments(ctx, { icp, competitors: { competitors: icp?.competitors, queries: icp?.queries } as any, questionnaire: await questionnaire(db, job.clientId), feedback: feedback(job) });
    ctx.log("Counting reachable companies per segment in the bulk lists…");
    const counts = await countSegments(config().BULK_DIR, r.segments.map((s) => s.targeting as any));
    return { ...r, segments: r.segments.map((s, k) => ({ ...s, reachable: counts[k] })) };
  },
  async offer(ctx, job, db) {
    const campaign = await one(db.select().from(t.campaigns).where(eq(t.campaigns.id, needCampaign(job))));
    const p = await profile(db, job.clientId);
    return (await agents()).runOffer(ctx, { icp: p?.icp as any, segment: segmentOf(p, campaign) ?? { name: campaign?.segment, angle: campaign?.angle }, intake: p?.offer, questionnaire: await questionnaire(db, job.clientId), feedback: feedback(job) });
  },
  async source(ctx, job, db) {
    const [used, client, p, dnc] = await Promise.all([
      db.select({ d: t.companies.domain }).from(t.companies).where(eq(t.companies.clientId, job.clientId)),
      one(db.select().from(t.clients).where(eq(t.clients.id, job.clientId))),
      profile(db, job.clientId),
      db.select({ c: t.files.contentText }).from(t.files).where(and(eq(t.files.clientId, job.clientId), eq(t.files.kind, "dnc"))),
    ]);
    // later sets win: the most specific reason is shown
    const skip = new Map<string, string>(used.map((u) => [u.d.toLowerCase(), "already used for this client"]));
    for (const c of ((p?.icp as any)?.competitors ?? [])) { const d = cleanDomain(typeof c === "string" ? c : c.domain || "").toLowerCase(); if (d) skip.set(d, "competitor"); }
    for (const f of dnc) for (const d of parseDncDomains(f.c || "")) skip.set(d, "do-not-contact list");
    const own = cleanDomain(client?.website || "").toLowerCase();
    if (own) skip.set(own, "the client itself");
    return sourceCore(ctx, (job.input ?? { dataset: "saas" }) as SourceInput, skip);
  },
  async qualify(ctx, job, db) {
    const campaign = await one(db.select().from(t.campaigns).where(eq(t.campaigns.id, needCampaign(job))));
    const companies = await db.select().from(t.companies).where(eq(t.companies.campaignId, campaign!.id));
    if (!companies.length) throw new AppError(400, "NO_COMPANIES", "No companies to qualify — run sourcing first");
    const seg = segmentOf(await profile(db, job.clientId), campaign);
    const criterion = (job.input as any)?.criterion?.trim()
      || `Is this company a fit for the "${campaign!.segment || campaign!.name}" campaign${seg?.criteria?.length ? ` (${seg.criteria.join("; ")})` : ""}?`;
    return qualifyCore(ctx, companies, criterion);
  },
  async find(ctx, job, db) {
    const campaign = await one(db.select().from(t.campaigns).where(eq(t.campaigns.id, needCampaign(job))));
    // qualify first: contacts are only found at companies that passed (or were overridden to pass)
    const companies = await db.select().from(t.companies).where(and(eq(t.companies.campaignId, campaign!.id), eq(t.companies.qualified, true)));
    if (!companies.length) throw new AppError(400, "NO_QUALIFIED", "No qualified companies — qualify (or override) some first");
    const titles = (job.input as any)?.titles ?? (campaign?.persona ? [campaign.persona] : undefined);
    return findCore(ctx, companies, titles);
  },
  async verify(ctx, job, db) {
    const rows = (await campaignContacts(db, job)).map(({ c }) => snake(c));
    if (!rows.length) throw new AppError(400, "NO_CONTACTS", "No contacts to verify");
    return verifyCore(ctx, rows, `gtm-${job.id.slice(0, 8)}`);
  },
  async copy(ctx, job, db) {
    const leads = (await campaignContacts(db, job)).filter(({ c }) => c.sendable).map(({ c }) => c);
    if (!leads.length) throw new AppError(400, "NO_SENDABLE_LEADS", "Copy is written only for verified (sendable) leads — none yet.");
    const campaign = await one(db.select().from(t.campaigns).where(eq(t.campaigns.id, needCampaign(job))));
    const p = await profile(db, job.clientId), intake: any = p?.offer ?? {};
    // sender names + booking link come from the intake, so the copy never ships with "[Sender Name]"
    const camp = { ...campaign, sender: { names: intake.senderNames || undefined, bookingLink: intake.bookingLink || undefined } };
    return (await agents()).runCopy(ctx, { icp: p?.icp as any, campaign: camp as any, leads: leads.map((c) => ({ email: c.email, firstName: c.firstName, lastName: c.lastName, title: c.title, companyName: c.companyName, companyDomain: c.companyDomain })), method: (job.input as any)?.method ?? "default", offer: campaign?.offer as any, feedback: feedback(job) });
  },
  async draft(ctx, job, db) {
    const campaign = await one(db.select().from(t.campaigns).where(eq(t.campaigns.id, needCampaign(job))));
    const rows = (await campaignContacts(db, job)).map(({ c, personalization }) => ({ ...snake(c), email_body: emailBody(personalization) }));
    return draftCore(ctx, rows, campaign!.sequence, campaign!.name);
  },
};

/** Live handlers: compute then persist. */
export const handlers = Object.fromEntries(Object.entries(compute).map(([type, fn]) => [type, async (ctx: Ctx, job: Job, db: DB) => {
  const r = await fn(ctx, job, db);
  await persist[type as JobType](db, job, r);
  return r;
}])) as Record<JobType, (ctx: Ctx, job: Job, db: DB) => Promise<Result>>;
