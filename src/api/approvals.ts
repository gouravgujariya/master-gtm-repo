// POST /api/approvals + the gate helpers shared with jobs/clients/campaigns.
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/client.ts";
import { approvals, campaigns, jobs } from "../db/schema.ts";
import { AppError } from "../core/errors.ts";
import { CLIENT_STAGES, PRODUCES, STAGES, laterStages, type JobType, type Stage } from "../core/gates.ts";
import { body, need, type Env } from "./auth.ts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Client-level approvals (campaign_id null) ∪ this campaign's — what missingApproval expects. */
export function gateApprovals(q: Tx | typeof db, clientId: string, campaignId?: string | null) {
  return q.select().from(approvals).where(and(eq(approvals.clientId, clientId),
    campaignId ? or(isNull(approvals.campaignId), eq(approvals.campaignId, campaignId)) : isNull(approvals.campaignId)));
}

/** Insert `revoked` for each stage whose latest decision is approved. campaignId undefined = every campaign. */
export async function revokeApproved(tx: Tx, clientId: string, stages: Stage[], userId: string, campaignId?: string) {
  if (!stages.length) return;
  const rows = await tx.select().from(approvals).where(and(eq(approvals.clientId, clientId), inArray(approvals.stage, stages),
    campaignId ? eq(approvals.campaignId, campaignId) : undefined)).orderBy(approvals.decidedAt);
  const last = new Map<string, typeof rows[number]>();
  for (const r of rows) last.set(`${r.stage}|${r.campaignId}`, r);
  const toRevoke = [...last.values()].filter((r) => r.decision === "approved");
  if (toRevoke.length) await tx.insert(approvals).values(toRevoke.map((r) => ({
    clientId, campaignId: r.campaignId, stage: r.stage, decision: "revoked", decidedBy: userId, note: "upstream changed",
  })));
}

/** Small, stable summary of a job result for the approval snapshot (arrays → counts). */
function summarize(result: unknown) {
  if (!result || typeof result !== "object") return result ?? null;
  return Object.fromEntries(Object.entries(result).map(([k, v]) =>
    [k, Array.isArray(v) ? v.length : v && typeof v === "object" ? "…" : v]));
}

const PRODUCER = Object.fromEntries(Object.entries(PRODUCES).map(([t, s]) => [s, t])) as Partial<Record<Stage, JobType>>;

const Approve = z.object({
  clientId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  stage: z.enum(STAGES),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(5000).optional(),
});

export const approvalRoutes = new Hono<Env>()
  .post("/", async (c) => {
    const b = await body(c, Approve);
    // send is only approved together with the draft enqueue (POST /api/campaigns/:id/draft)
    if (b.stage === "send") throw new AppError(400, "VALIDATION", "Approve send via POST /api/campaigns/:id/draft");
    const clientLevel = CLIENT_STAGES.includes(b.stage);
    if (clientLevel && b.campaignId) throw new AppError(400, "VALIDATION", `${b.stage} is approved per client, not per campaign`);
    if (!clientLevel && !b.campaignId) throw new AppError(400, "VALIDATION", `${b.stage} needs campaignId`);
    if (b.campaignId) {
      const [camp] = await db.select().from(campaigns).where(and(eq(campaigns.id, b.campaignId), eq(campaigns.clientId, b.clientId)));
      need(camp, "Campaign");
    }
    const producer = PRODUCER[b.stage];
    let snapshot: unknown = null;
    if (producer) {
      // client-level jobs (campaign null) also count for campaign stages, e.g. segments → strategy
      const [job] = await db.select().from(jobs).where(and(eq(jobs.clientId, b.clientId), eq(jobs.type, producer),
        b.campaignId ? or(isNull(jobs.campaignId), eq(jobs.campaignId, b.campaignId)) : undefined))
        .orderBy(desc(jobs.createdAt)).limit(1);
      if (job?.status !== "done") throw new AppError(409, "NOT_READY", `Latest ${producer} job is ${job?.status ?? "missing"} — run it first`);
      snapshot = { jobId: job.id, summary: summarize(job.result) };
    }
    const row = await db.transaction(async (tx) => {
      if (b.decision === "approved") await revokeApproved(tx, b.clientId, laterStages(b.stage), c.get("user").id, clientLevel ? undefined : b.campaignId);
      const [r] = await tx.insert(approvals).values({ ...b, campaignId: b.campaignId ?? null, snapshot, decidedBy: c.get("user").id }).returning();
      return r;
    });
    return c.json(row);
  });
