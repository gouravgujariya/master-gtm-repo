// Job handlers: one per JobType (see docs/backend-contract.md). Each = compute (pure-ish, testable without a DB)
// + persist (shared with demo fixtures so the UI reads the DB the same way either way).
// Strategy rules (fixed): bulk first · find AgenticData → AI Ark → ColdIQ · verify every email · DRAFT only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Ctx } from "../core/ctx.ts";
import { AppError, MissingKeyError } from "../core/errors.ts";
import type { JobType } from "../core/gates.ts";
import { researchWebsite } from "../core/research.ts";
import { sourceCompanies } from "../core/source.ts";
import { findContact } from "../core/find.ts";
import { verifyRows } from "../core/verify.ts";
import { createDraft } from "../core/draft.ts";
import { recheckCatchAll, searchCompanies, cleanDomain } from "../providers/ai-ark.ts";
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

/** Bulk first; lookalike is paid → needs allowPaid + reason (enforced by sourceCompanies). Skips used domains. */
export async function sourceCore(ctx: Ctx, input: SourceInput, used: Set<string> = new Set(), dir = config().BULK_DIR) {
  const limit = input.limit ?? 25;
  const paid = input.dataset === "lookalike"
    ? (c: Ctx) => { if (!input.seedDomains?.length) throw new AppError(400, "NO_SEEDS", "lookalike needs seedDomains"); return searchCompanies(c, input.seedDomains, limit + used.size); }
    : undefined;
  // ponytail: over-fetch by used.size so skipping still fills `limit`; bulk streams with early exit so it's cheap.
  const rows = await sourceCompanies(ctx, {
    dataset: input.dataset === "local" ? "local" : "saas", filters: input.filters, limit: limit + used.size,
    dir, paid, allowPaid: input.allowPaid, reason: input.reason,
  });
  const companies = [];
  for (const r of rows) {
    const domain = cleanDomain(r.domain || "").toLowerCase();
    if (!domain) continue;
    if (used.has(domain)) { ctx.log(`  - ${domain}: already used for this client — skipped`); continue; }
    used.add(domain);
    companies.push({
      companyName: r.company_name || "", domain, industry: r.industry || r.category || "",
      companySize: r.employees || r.size || "", location: r.location || [r.locality, r.country].filter(Boolean).join(", ") || r.zip || "",
      listSource: r.source || "ai-ark-lookalike",
    });
    if (companies.length >= limit) break;
  }
  ctx.log(`✓ ${companies.length} companies (${input.dataset})`);
  return { companies };
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
const questionnaire = async (db: DB, clientId: string) =>
  (await db.select({ c: t.files.contentText }).from(t.files).where(and(eq(t.files.clientId, clientId), eq(t.files.kind, "questionnaire")))).map((f) => f.c).filter(Boolean).join("\n\n") || undefined;
const needCampaign = (job: Job) => { if (!job.campaignId) throw new AppError(400, "NO_CAMPAIGN", `${job.type} needs a campaign`); return job.campaignId; };

/** Contacts on this job's campaign, joined with their lead row. */
function campaignContacts(db: DB, job: Job) {
  return db.select({ c: t.contacts, personalization: t.campaignLeads.personalization }).from(t.campaignLeads)
    .innerJoin(t.contacts, eq(t.contacts.id, t.campaignLeads.contactId))
    .where(eq(t.campaignLeads.campaignId, needCampaign(job)));
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
    const { costUsd, ...icp } = await (await agents()).runIcp(ctx, { website, researchMd, questionnaire: await questionnaire(db, job.clientId) });
    return { icp, costUsd };
  },
  async competitors(ctx, job, db) {
    return (await agents()).runCompetitors(ctx, { icp: (await profile(db, job.clientId))?.icp as any });
  },
  async segments(ctx, job, db) {
    const icp: any = (await profile(db, job.clientId))?.icp;
    return (await agents()).runSegments(ctx, { icp, competitors: { competitors: icp?.competitors, queries: icp?.queries } as any, questionnaire: await questionnaire(db, job.clientId) });
  },
  async source(ctx, job, db) {
    const used = await db.select({ d: t.companies.domain }).from(t.companies).where(eq(t.companies.clientId, job.clientId));
    return sourceCore(ctx, (job.input ?? { dataset: "saas" }) as SourceInput, new Set(used.map((u) => u.d.toLowerCase())));
  },
  async find(ctx, job, db) {
    const campaign = await one(db.select().from(t.campaigns).where(eq(t.campaigns.id, needCampaign(job))));
    const companies = await db.select().from(t.companies).where(eq(t.companies.campaignId, campaign!.id));
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
    return (await agents()).runCopy(ctx, { icp: (await profile(db, job.clientId))?.icp as any, campaign: campaign as any, leads: leads.map((c) => ({ email: c.email, firstName: c.firstName, lastName: c.lastName, title: c.title, companyName: c.companyName, companyDomain: c.companyDomain })), method: (job.input as any)?.method ?? "default" });
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
