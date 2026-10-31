// Job runner loop. Claims queued jobs with FOR UPDATE SKIP LOCKED (safe with N slots / N workers),
// heartbeats, honours cancel_requested, writes log/result/status. The API only reads these rows.
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { keysCtx, type Ctx } from "../core/ctx.ts";
import { CLIENT_STAGES, missingApproval, type JobType, type Stage } from "../core/gates.ts";
import type { DB } from "../db/client.ts";
import { approvals, jobs } from "../db/schema.ts";
import type { Job, Result } from "./handlers.ts";
import { runJob } from "./demo.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function claim(db: DB): Promise<Job | null> {
  const [job] = await db.update(jobs)
    .set({ status: "running", startedAt: sql`now()`, heartbeatAt: sql`now()`, attempts: sql`${jobs.attempts} + 1` })
    .where(eq(jobs.id, sql`(SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)`))
    .returning();
  return job ?? null;
}

/** Running jobs whose worker died (stale heartbeat) → error. Called once at boot. */
export async function reapStale(db: DB): Promise<number> {
  const rows = await db.update(jobs)
    .set({ status: "error", result: { error: "worker restarted" }, finishedAt: sql`now()` })
    .where(and(eq(jobs.status, "running"), or(isNull(jobs.heartbeatAt), lt(jobs.heartbeatAt, sql`now() - interval '2 minutes'`))))
    .returning({ id: jobs.id });
  return rows.length;
}

/** Defence in depth: the API already gates on enqueue, but approvals may have been revoked since. */
async function gateFor(db: DB, job: Job): Promise<Stage | null> {
  const rows = await db.select().from(approvals).where(eq(approvals.clientId, job.clientId));
  const mine = rows.filter((a) => CLIENT_STAGES.includes(a.stage as Stage) ? a.campaignId === null : a.campaignId === job.campaignId);
  return missingApproval(job.type as JobType, mine);
}

export type Runner = (ctx: Ctx, job: Job, db: DB) => Promise<Result>;
export interface WorkerOpts { concurrency?: number; pollMs?: number; heartbeatMs?: number; run?: Runner }

export function startWorker(db: DB, o: WorkerOpts = {}) {
  const run = o.run ?? runJob, pollMs = o.pollMs ?? 1000, heartbeatMs = o.heartbeatMs ?? 5000;
  let stopping = false;
  const active = new Set<AbortController>();

  async function runOne(job: Job) {
    const ac = new AbortController();
    active.add(ac);
    // ponytail: one UPDATE per log line, chained to keep order; batch on a timer if log volume hurts the DB.
    let logs: Promise<unknown> = Promise.resolve();
    const log = (line: string) => {
      logs = logs.then(() => db.update(jobs).set({ log: sql`${jobs.log} || ${line + "\n"}` }).where(eq(jobs.id, job.id))).catch((e) => console.error("log write failed", e));
    };
    const hb = setInterval(async () => {
      try {
        const [r] = await db.update(jobs).set({ heartbeatAt: sql`now()` }).where(eq(jobs.id, job.id)).returning({ cancel: jobs.cancelRequested });
        if (r?.cancel) ac.abort();
      } catch (e) { console.error("heartbeat failed", e); }
    }, heartbeatMs);
    // ponytail: global provider keys only; merge decrypted client_secrets over process.env here (Phase 3).
    const ctx: Ctx = { ...keysCtx({ ...process.env }, log, ac.signal), clientId: job.clientId };
    let status = "done", result: Result;
    try {
      const needs = await gateFor(db, job);
      if (needs) throw new Error(`Gate: "${needs}" is not approved — refusing to run ${job.type}`);
      result = await run(ctx, job, db);
      if (ac.signal.aborted) throw new Error("cancelled");
    } catch (e) {
      status = ac.signal.aborted ? (stopping ? "error" : "cancelled") : "error";
      result = { error: ac.signal.aborted ? (stopping ? "worker stopped" : "cancelled") : (e as Error).message };
      log(`✗ ${result.error}`);
    } finally { clearInterval(hb); active.delete(ac); }
    await logs;
    await db.update(jobs).set({ status, result, finishedAt: sql`now()` }).where(eq(jobs.id, job.id));
  }

  async function slot() {
    while (!stopping) {
      let job: Job | null = null;
      try { job = await claim(db); } catch (e) { console.error("claim failed", e); }
      if (job) await runOne(job); else await wait(pollMs);
    }
  }

  const slots = Array.from({ length: o.concurrency ?? 2 }, slot);
  return {
    /** Stop claiming; let current jobs finish for graceMs, then abort them. */
    async stop(graceMs = 20_000) {
      stopping = true;
      const t = setTimeout(() => active.forEach((ac) => ac.abort()), graceMs);
      await Promise.all(slots);
      clearTimeout(t);
    },
  };
}
