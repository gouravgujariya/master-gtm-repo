// LLM job entry points (contract: docs/backend-contract.md → "LLM"). Each returns the parsed result + costUsd.
import type { Ctx } from "../core/ctx.ts";
import { runStructured } from "./llm.ts";
import { Icp, Competitors, Segments, Copy, CopySequence, LeadBodies, Offer, Qualify } from "./schemas.ts";
import { icpPrompt, competitorsPrompt, segmentsPrompt, sequencePrompt, leadBodiesPrompt, offerPrompt, qualifyPrompt } from "./prompts.ts";

type WithCost<T> = T & { costUsd: number };
const SONNET = "claude-sonnet-5-5", OPUS = "claude-opus-5-5", HAIKU = "claude-haiku-5-5";

export async function runIcp(ctx: Ctx, i: { website: string; researchMd: string; questionnaire?: string; feedback?: string }): Promise<WithCost<Icp>> {
  const { data, costUsd } = await runStructured(ctx, { job: "icp", model: SONNET, schema: Icp, maxBudgetUsd: 0.25, ...icpPrompt(i) });
  return { ...data, costUsd };
}

export async function runCompetitors(ctx: Ctx, i: { icp: Icp; feedback?: string }): Promise<WithCost<Competitors>> {
  const { data, costUsd } = await runStructured(ctx, {
    job: "competitors", model: SONNET, schema: Competitors, tools: ["WebSearch", "WebFetch"], maxTurns: 15, maxBudgetUsd: 0.75,
    ...competitorsPrompt(i),
  });
  return { ...data, costUsd };
}

export async function runSegments(ctx: Ctx, i: { icp: Icp; competitors: Competitors; questionnaire?: string; feedback?: string }): Promise<WithCost<Segments>> {
  const { data, costUsd } = await runStructured(ctx, { job: "segments", model: OPUS, schema: Segments, maxBudgetUsd: 1, ...segmentsPrompt(i) });
  return { ...data, costUsd };
}

export async function runOffer(ctx: Ctx, i: { icp: Icp; segment: unknown; intake?: unknown; questionnaire?: string; feedback?: string }): Promise<WithCost<Offer>> {
  const { data, costUsd } = await runStructured(ctx, { job: "offer", model: SONNET, schema: Offer, maxBudgetUsd: 0.5, ...offerPrompt(i) });
  return { ...data, costUsd };
}

export type QualifyCompany = { domain: string; name?: string; site: string };

/** Yes/no + reason per company, batches of 20 (HAIKU). Companies the model skips come back unqualified, never guessed. */
export async function runQualify(ctx: Ctx, i: { criterion: string; companies: QualifyCompany[] }): Promise<WithCost<Qualify>> {
  let costUsd = 0;
  const results: Qualify["results"] = [];
  for (let k = 0; k < i.companies.length; k += 20) {
    const batch = i.companies.slice(k, k + 20);
    const r = await runStructured(ctx, { job: `qualify-${k / 20 + 1}`, model: HAIKU, schema: Qualify, maxBudgetUsd: 0.25, ...qualifyPrompt({ criterion: i.criterion, companies: batch }) });
    costUsd += r.costUsd;
    const want = new Set(batch.map((c) => c.domain.toLowerCase()));
    results.push(...r.data.results.filter((x) => want.delete(x.domain.toLowerCase())));
    for (const d of want) results.push({ domain: d, qualified: false, reason: "no answer from the model — re-run or override" });
  }
  return { results, costUsd };
}

export type CopyLead = { email: string } & Record<string, unknown>;

export async function runCopy(
  ctx: Ctx, i: { icp: Icp; campaign: unknown; leads: CopyLead[]; method?: "default" | "braun"; offer?: Offer | null; feedback?: string },
): Promise<WithCost<Copy>> {
  const method = i.method ?? "default";
  const seq = await runStructured(ctx, { job: "copy", model: OPUS, schema: CopySequence, maxBudgetUsd: 1, ...sequencePrompt({ ...i, method }) });
  let costUsd = seq.costUsd;
  const step1 = seq.data.sequence.find((s) => s.step === 1)?.body ?? seq.data.sequence[0]?.body ?? "";
  const leads: Copy["leads"] = [];
  for (let k = 0; k < i.leads.length; k += 20) {
    const batch = i.leads.slice(k, k + 20);
    const r = await runStructured(ctx, {
      job: `copy-leads-${k / 20 + 1}`, model: HAIKU, schema: LeadBodies, maxBudgetUsd: 0.25,
      ...leadBodiesPrompt({ icp: i.icp, subject: seq.data.subject, step1, leads: batch, method, offer: i.offer }),
    });
    costUsd += r.costUsd;
    const want = new Set(batch.map((l) => l.email.toLowerCase()));
    leads.push(...r.data.leads.filter((l) => want.delete(l.email.toLowerCase()))); // only asked-for emails, once each
    if (want.size) ctx.log(`[copy] ${want.size} lead(s) got no body in batch ${k / 20 + 1}: they keep the template`);
  }
  return { ...seq.data, leads, costUsd };
}
