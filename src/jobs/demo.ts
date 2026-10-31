// Demo fixtures + DEMO_MODE routing. on: every job replays fixtures/demo/scriptlens.json · auto: fall back only
// when a live handler throws MissingKeyError (never for draft) · off: errors surface.
// Fixture results go through the same persist code as live results, so the UI reads the DB uniformly.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Ctx } from "../core/ctx.ts";
import { MissingKeyError } from "../core/errors.ts";
import type { JobType } from "../core/gates.ts";
import type { DB } from "../db/client.ts";
import { config } from "../config.ts";
import { handlers, persist, type Job, type Result } from "./handlers.ts";

export const FIXTURE = resolve(import.meta.dirname, "../../fixtures/demo/scriptlens.json");
export interface Fixture { results: Partial<Record<JobType, Result>>; logs?: Partial<Record<JobType, string[]>> }

export function loadFixture(path = FIXTURE): Fixture {
  if (!existsSync(path)) throw new Error(`Demo fixture missing: ${path} — add it or set DEMO_MODE=off`);
  return JSON.parse(readFileSync(path, "utf8"));
}

const nap = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, no) => {
  if (signal?.aborted) return no(new Error("cancelled"));
  const t = setTimeout(ok, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); no(new Error("cancelled")); }, { once: true });
});

export interface RunOpts {
  mode?: "off" | "auto" | "on";
  fixture?: Fixture;
  live?: typeof handlers;
  save?: typeof persist;
  stepMs?: number;
}

/** Replay a fixture's logs, persist its result, return it marked demo:true. */
export async function runDemo(ctx: Ctx, job: Job, db: DB, o: RunOpts = {}): Promise<Result> {
  const type = job.type as JobType, fx = o.fixture ?? loadFixture();
  const result = fx.results[type];
  if (!result) throw new Error(`Demo fixture has no result for "${type}"`);
  for (const line of fx.logs?.[type] ?? []) { await nap(o.stepMs ?? 300, ctx.signal); ctx.log(line); }
  const r = { ...result, demo: true, ...(type === "draft" ? { externalCampaignId: `DEMO-${job.id.slice(0, 8)}` } : {}) };
  await (o.save ?? persist)[type](db, job, r);
  return r;
}

export async function runJob(ctx: Ctx, job: Job, db: DB, o: RunOpts = {}): Promise<Result> {
  const mode = o.mode ?? config().DEMO_MODE;
  if (mode === "on") return runDemo(ctx, job, db, o);
  try {
    return await (o.live ?? handlers)[job.type as JobType](ctx, job, db);
  } catch (e) {
    // draft is never faked under auto: a missing Plusvibe key must surface, not look like a real upload
    if (mode !== "auto" || job.type === "draft" || !(e instanceof MissingKeyError)) throw e;
    ctx.log(`demo data (missing ${e.keyName})`);
    return runDemo(ctx, job, db, o);
  }
}
