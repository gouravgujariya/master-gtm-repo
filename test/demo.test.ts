import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgres://u@localhost:5432/unused";
import { keysCtx } from "../src/core/ctx.ts";
import { MissingKeyError } from "../src/core/errors.ts";
import { loadFixture, runJob, type Fixture } from "../src/jobs/demo.ts";

const fixture: Fixture = {
  results: { verify: { contacts: [], counts: { sendable: 0, held: 0, dropped: 0 } }, draft: { externalCampaignId: "x", uploaded: 3 } },
  logs: { verify: ["checking…", "done"] },
};
const job = (type: string) => ({ id: "12345678-aaaa-bbbb-cccc-000000000000", type, clientId: "c", campaignId: "k" }) as any;
const missing = async () => { throw new MissingKeyError("OPTIMAVERIFIER_API_KEY"); };
const live = { verify: missing, draft: async () => { throw new MissingKeyError("PLUSVIBE_API_KEY"); } } as any;
function saver() {
  const saved: [string, any][] = [];
  const save = new Proxy({}, { get: (_, type: string) => async (_db: unknown, _j: unknown, r: any) => { saved.push([type, r]); } }) as any;
  return { saved, save };
}

test("auto: MissingKeyError falls back to fixture, replays logs, persists, demo:true", async () => {
  const lines: string[] = [], { saved, save } = saver();
  const r = await runJob(keysCtx({}, (m) => lines.push(m)), job("verify"), {} as any, { mode: "auto", fixture, live, save, stepMs: 1 });
  assert.equal(r.demo, true);
  assert.deepEqual(lines, ["demo data (missing OPTIMAVERIFIER_API_KEY)", "checking…", "done"]);
  assert.deepEqual(saved.map(([t, x]) => [t, x.demo]), [["verify", true]]);
});

test("auto: draft never falls back; off: errors surface", async () => {
  const { saved, save } = saver();
  await assert.rejects(runJob(keysCtx({}), job("draft"), {} as any, { mode: "auto", fixture, live, save }), MissingKeyError);
  await assert.rejects(runJob(keysCtx({}), job("verify"), {} as any, { mode: "off", fixture, live, save }), MissingKeyError);
  assert.equal(saved.length, 0);
});

test("on: every job uses fixtures; draft gets a fake DEMO- id", async () => {
  const { save } = saver();
  const r = await runJob(keysCtx({}), job("draft"), {} as any, { mode: "on", fixture, live, save, stepMs: 1 });
  assert.equal(r.externalCampaignId, "DEMO-12345678");
  assert.equal(r.demo, true);
});

test("cancel stops the log replay", async () => {
  const ac = new AbortController(); ac.abort();
  await assert.rejects(runJob(keysCtx({}, () => {}, ac.signal), job("verify"), {} as any, { mode: "on", fixture, live, save: saver().save }), /cancelled/);
});

test("missing fixture file → clear error", () => {
  assert.throws(() => loadFixture("/nope/scriptlens.json"), /Demo fixture missing: .*DEMO_MODE=off/);
});
