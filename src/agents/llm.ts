// The one door to Claude (Agent SDK). Structured JSON out, re-validated with zod, sandboxed:
// no filesystem settings (this repo's CLAUDE.md/skills would start the GTM orchestration), no shell/file tools,
// empty scratch cwd, key from ctx. DB-free: the worker passes today's spend into assertBudget.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { query as sdkQuery, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Ctx } from "../core/ctx.ts";
import { AppError } from "../core/errors.ts";
import { config } from "../config.ts";

export type QueryFn = (p: { prompt: string; options?: Options }) => AsyncIterable<SDKMessage>;
let queryFn: QueryFn = sdkQuery;
/** Tests inject a fake; call with no arg to restore the SDK. */
export const setQuery = (q?: QueryFn) => void (queryFn = q ?? sdkQuery);

export type WebTool = "WebSearch" | "WebFetch";
const NEVER = ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit", "Read", "Glob", "Grep", "Task", "Agent", "Skill"];

export interface StructuredOpts<T> {
  job: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  tools?: WebTool[];
  maxTurns?: number;
  maxBudgetUsd: number;
}

export function assertBudget(spentTodayUsd: number): void {
  const cap = config().LLM_DAILY_BUDGET_USD;
  if (spentTodayUsd >= cap)
    throw new AppError(402, "LLM_BUDGET", `Daily LLM budget reached ($${spentTodayUsd.toFixed(2)} of $${cap}).`);
}

const oneLine = (s: string, n = 160) => s.replace(/\s+/g, " ").trim().slice(0, n);

export async function runStructured<T>(ctx: Ctx, o: StructuredOpts<T>): Promise<{ data: T; costUsd: number }> {
  const apiKey = ctx.getKey("ANTHROPIC_API_KEY"); // MissingKeyError → worker's demo fallback
  const base = resolve(config().STORAGE_DIR, "agent-tmp");
  mkdirSync(base, { recursive: true });
  const cwd = mkdtempSync(join(base, `${o.job}-`));
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (ctx.signal?.aborted) ac.abort();
  ctx.signal?.addEventListener("abort", onAbort);
  const tools = o.tools ?? [];
  try {
    const q = queryFn({
      prompt: o.prompt,
      options: {
        model: o.model,
        systemPrompt: o.system,
        outputFormat: { type: "json_schema", schema: z.toJSONSchema(o.schema) as Record<string, unknown> },
        settingSources: [],
        strictMcpConfig: true,
        persistSession: false,
        tools,
        allowedTools: tools,
        disallowedTools: NEVER,
        permissionMode: "dontAsk",
        maxTurns: o.maxTurns ?? (tools.length ? 15 : 3),
        maxBudgetUsd: o.maxBudgetUsd,
        cwd,
        abortController: ac,
        // replaces the subprocess env entirely: only what it needs, no other secrets leak in
        env: { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: apiKey, CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-backend/1.0" },
      },
    });
    for await (const m of q) {
      if (m.type === "assistant") {
        for (const b of m.message.content as any[]) {
          if (b.type === "text" && b.text.trim()) ctx.log(`[${o.job}] ${oneLine(b.text)}`);
          else if (b.type === "tool_use") ctx.log(`[${o.job}] → ${b.name} ${oneLine(JSON.stringify(b.input ?? {}), 100)}`);
        }
      } else if (m.type === "result") {
        const costUsd = m.total_cost_usd ?? 0;
        ctx.log(`[${o.job}] done: ${m.subtype} · $${costUsd.toFixed(4)}`);
        if (m.subtype !== "success" || m.is_error)
          throw new AppError(502, "LLM_ERROR", `${o.job}: ${m.subtype}${"errors" in m && m.errors?.length ? ` — ${oneLine(m.errors.join("; "), 300)}` : ""}`);
        const r = o.schema.safeParse(m.structured_output);
        if (!r.success)
          throw new AppError(502, "LLM_BAD_OUTPUT", `${o.job}: output failed schema — ${oneLine(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 300)}`);
        return { data: r.data, costUsd };
      }
    }
    throw new AppError(502, "LLM_BAD_OUTPUT", `${o.job}: no result from the model`);
  } finally {
    ctx.signal?.removeEventListener("abort", onAbort);
    rmSync(cwd, { recursive: true, force: true });
  }
}
