// /api/jobs — enqueue (gated), read, SSE stream, cancel. The worker does the running.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { campaigns, clients, jobs } from "../db/schema.ts";
import { AppError } from "../core/errors.ts";
import { CLIENT_STAGES, JOB_TYPES, REQUIRES, missingApproval } from "../core/gates.ts";
import { body, need, uuidParam, type Env } from "./auth.ts";
import { gateApprovals } from "./approvals.ts";

export const JobBody = z.object({
  clientId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  type: z.enum(JOB_TYPES),
  input: z.record(z.string(), z.unknown()).optional(),
});

const WIRED_DATASETS = ["saas", "local", "lookalike"]; // new-hire/hiring/competitor-engagers/tech-stack → NOT_WIRED
const TERMINAL = ["done", "error", "cancelled"];

async function getJob(id: string) {
  const [j] = await db.select().from(jobs).where(eq(jobs.id, id));
  return need(j, "Job");
}

export const jobRoutes = new Hono<Env>()
  .post("/", async (c) => {
    const b = await body(c, JobBody);
    // jobs gated on a per-campaign stage must name the campaign
    if (!b.campaignId && REQUIRES[b.type].some((s) => !CLIENT_STAGES.includes(s)))
      throw new AppError(400, "VALIDATION", `${b.type} needs campaignId`);
    if (b.type === "source" && !WIRED_DATASETS.includes(String(b.input?.dataset)))
      throw new AppError(409, "NOT_WIRED", `Dataset "${b.input?.dataset}" is not wired yet (use ${WIRED_DATASETS.join("/")})`);
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, b.clientId));
    need(client, "Client");
    if (b.campaignId) {
      const [camp] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, b.campaignId), eq(campaigns.clientId, b.clientId)));
      need(camp, "Campaign");
    }
    const needs = missingApproval(b.type, await gateApprovals(db, b.clientId, b.campaignId));
    if (needs) return c.json({ error: { code: "GATE", message: `Approve ${needs} first`, needs } }, 409);
    const [job] = await db.insert(jobs).values({
      clientId: b.clientId, campaignId: b.campaignId ?? null, type: b.type, input: b.input ?? {}, createdBy: c.get("user").id,
    }).returning({ id: jobs.id });
    return c.json({ jobId: job.id }, 202);
  })
  .get("/:id", async (c) => c.json(await getJob(uuidParam(c, "id"))))
  .get("/:id/events", async (c) => {
    const id = uuidParam(c, "id");
    await getJob(id); // 404 before opening the stream
    return streamSSE(c, async (stream) => {
      let sent = 0; // chars of `log` already sent
      let status = "";
      let open = true;
      stream.onAbort(() => { open = false; });
      // ponytail: 1s DB poll per open stream; LISTEN/NOTIFY if many viewers
      while (open) {
        const j = await getJob(id);
        const end = j.log.lastIndexOf("\n") + 1; // only complete lines
        if (end > sent) {
          for (const line of j.log.slice(sent, end).split("\n")) if (line) await stream.writeSSE({ event: "log", data: JSON.stringify({ line }) });
          sent = end;
        }
        const done = TERMINAL.includes(j.status);
        if (j.status !== status || done) {
          status = j.status;
          await stream.writeSSE({ event: "status", data: JSON.stringify(done ? { status, result: j.result } : { status }) });
        }
        if (done) break;
        await stream.sleep(1000);
      }
    });
  })
  .post("/:id/cancel", async (c) => {
    const id = uuidParam(c, "id");
    await getJob(id);
    // queued → cancel now; running → flag it, the worker stops at its next check
    const [q] = await db.update(jobs).set({ status: "cancelled", cancelRequested: true, finishedAt: new Date() })
      .where(and(eq(jobs.id, id), eq(jobs.status, "queued"))).returning({ id: jobs.id });
    if (!q) await db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, id));
    return c.json({ ok: true });
  });
