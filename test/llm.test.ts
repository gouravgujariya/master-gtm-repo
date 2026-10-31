import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

process.env.DATABASE_URL ??= "postgres://test@localhost/test";
process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "llm-test-"));
process.env.LLM_DAILY_BUDGET_USD = "5";
const { runStructured, assertBudget, setQuery } = await import("../src/agents/llm.ts");
const { keysCtx } = await import("../src/core/ctx.ts");
const { AppError, MissingKeyError } = await import("../src/core/errors.ts");
after(() => setQuery());

const schema = z.object({ n: z.number() });
const opts = { job: "t", model: "m", system: "s", prompt: "p", schema, maxBudgetUsd: 0.1 };
const fake = (structured_output: unknown, seen: any[] = []) => (p: any) => (async function* () {
  seen.push(p.options);
  yield { type: "assistant", message: { content: [{ type: "text", text: "thinking\nhard" }, { type: "tool_use", name: "WebSearch", input: { q: "x" } }] } };
  yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0.012, structured_output };
})() as any;

test("runStructured returns parsed data + cost, sandboxed options, logs", async () => {
  const seen: any[] = [], logs: string[] = [];
  setQuery(fake({ n: 7 }, seen));
  const r = await runStructured(keysCtx({ ANTHROPIC_API_KEY: "sk-test" }, (l) => logs.push(l)), opts);
  assert.deepEqual(r, { data: { n: 7 }, costUsd: 0.012 });
  const o = seen[0];
  assert.deepEqual(o.settingSources, []);
  assert.deepEqual(o.tools, []);
  assert.ok(o.disallowedTools.includes("Bash") && o.disallowedTools.includes("Write"));
  assert.equal(o.env.ANTHROPIC_API_KEY, "sk-test");
  assert.equal(o.outputFormat.type, "json_schema");
  assert.ok(o.cwd.includes("agent-tmp"));
  assert.deepEqual(readdirSync(join(process.env.STORAGE_DIR!, "agent-tmp")), []); // scratch cleaned up
  assert.ok(logs.some((l) => l.includes("thinking hard")) && logs.some((l) => l.includes("→ WebSearch")));
});

test("invalid output throws LLM_BAD_OUTPUT", async () => {
  setQuery(fake({ n: "seven" }));
  await assert.rejects(runStructured(keysCtx({ ANTHROPIC_API_KEY: "k" }), opts), (e: any) => e instanceof AppError && e.code === "LLM_BAD_OUTPUT" && e.status === 502);
});

test("missing ANTHROPIC_API_KEY throws MissingKeyError", async () => {
  setQuery(fake({ n: 1 }));
  await assert.rejects(runStructured(keysCtx({}), opts), MissingKeyError);
});

test("assertBudget refuses at/over the daily cap", () => {
  assertBudget(4.99);
  assert.throws(() => assertBudget(5), (e: any) => e.code === "LLM_BUDGET" && e.status === 402);
});
