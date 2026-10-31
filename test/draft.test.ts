import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { keysCtx } from "../src/core/ctx.ts";
import { AppError } from "../src/core/errors.ts";
import * as plusvibe from "../src/providers/plusvibe.ts";
import { createDraft, sendableLeads } from "../src/core/draft.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const ctx = keysCtx({ PLUSVIBE_API_KEY: "k" });
const seq = { schedule: {}, sequences: [{ step: 1 }] };

test("plusvibe adapter exposes no start/activate/launch/resume", () => {
  for (const name of Object.keys(plusvibe)) assert.doesNotMatch(name, /start|activ|launch|resume|status/i);
  assert.throws(() => plusvibe.updateCampaign(ctx, { status: "ACTIVE" }), AppError);
});

test("sendableLeads keeps only sendable=yes rows with an email", () => {
  const { leads, refused } = sendableLeads([
    { email: "a@x.com", sendable: "yes" }, { email: "b@x.com", sendable: "no" },
    { email: "c@x.com" }, { email: "", sendable: "yes" }, { email: "d@x.com", sendable: "YES" },
  ]);
  assert.deepEqual(leads.map((l) => l.email), ["a@x.com", "d@x.com"]);
  assert.equal(refused, 3);
});

test("createDraft refuses non-sendable leads before any API call", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
  await assert.rejects(createDraft(ctx, { rows: [{ email: "b@x.com", sendable: "catch-all" }], seq }), /No sendable leads/);
  assert.equal(calls, 0);
});

test("createDraft uploads only verified leads and never sets status", async () => {
  const reqs: { url: string; method: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    reqs.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    const res = url.endsWith("/authenticate") ? { workspaces: [{ _id: "ws1", name: "W" }], account: "acc" }
      : url.includes("/campaign/add") ? { id: "c1" } : url.includes("/account/list") ? { data: [{ _id: "e1" }] } : {};
    return new Response(JSON.stringify(res));
  }) as typeof fetch;
  const r = await createDraft(ctx, { rows: [{ email: "a@x.com", sendable: "yes" }, { email: "b@x.com", sendable: "no" }], seq });
  assert.equal(r.campaignId, "c1");
  assert.ok(reqs.every((q) => !q.body || !("status" in q.body)));
  const add = reqs.find((q) => q.url.endsWith("/lead/add"))!;
  assert.deepEqual(add.body.leads.map((l: any) => l.email), ["a@x.com"]);
});
