import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { keysCtx } from "../src/core/ctx.ts";
import { MissingKeyError, ProviderError } from "../src/core/errors.ts";
import { gate, gateRows, verifyRows } from "../src/core/verify.ts";
import { getCredits } from "../src/providers/optimaverifier.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("gate: valid sendable, invalid/catch-all/unknown not", () => {
  assert.equal(gate("valid").sendable, true);
  assert.deepEqual(gate("invalid"), { sendable: false, note: "dropped: invalid" });
  assert.equal(gate("catch_all").sendable, false);
  assert.equal(gate("catch-all").sendable, false);
  assert.equal(gate("unknown").sendable, false);
  assert.equal(gate("weird").note, "unrecognized status: weird");
});

test("gateRows: catch-all with/without crossCheck, unknown held, unverified = unknown", async () => {
  const rows = [{ email: "a@x.com" }, { email: "b@x.com" }, { email: "c@x.com" }, { email: "d@x.com" }, { email: "e@x.com" }];
  const map = new Map([["a@x.com", "valid"], ["b@x.com", "invalid"], ["c@x.com", "catch_all"], ["d@x.com", "unknown"]]);
  const no = await gateRows(rows, map);
  assert.deepEqual(no.map((r) => r.sendable), ["yes", "no", "no", "no", "no"]);
  assert.equal(no[4].email_status, "unknown"); // never verified -> never sendable

  const seen: string[] = [];
  const yes = await gateRows(rows, map, "email", async (e) => (seen.push(e), true));
  assert.deepEqual(yes.map((r) => r.sendable), ["yes", "no", "yes", "no", "no"]);
  assert.deepEqual(seen, ["c@x.com"]); // only catch-all is cross-checked
  assert.equal((await gateRows(rows, map, "email", async () => false))[2].sendable, "no");
});

test("gateRows: ai_ark_status VALID rescues catch-all and unknown (existing behaviour)", async () => {
  const out = await gateRows(
    [{ email: "c@x.com", ai_ark_status: "VALID" }, { email: "d@x.com", ai_ark_status: "valid" }, { email: "b@x.com", ai_ark_status: "VALID" }],
    new Map([["c@x.com", "catch-all"], ["d@x.com", "unknown"], ["b@x.com", "invalid"]]),
  );
  assert.deepEqual(out.map((r) => r.sendable), ["yes", "yes", "no"]);
});

test("missing key throws MissingKeyError (no exit, no fetch)", async () => {
  globalThis.fetch = (async () => { throw new Error("should not fetch"); }) as typeof fetch;
  await assert.rejects(getCredits(keysCtx({})), MissingKeyError);
});

test("non-OK response throws ProviderError", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
  await assert.rejects(getCredits(keysCtx({ OPTIMAVERIFIER_API_KEY: "k" })), (e: unknown) =>
    e instanceof ProviderError && e.httpStatus === 401 && /OptimaVerifier \/credits -> 401: nope/.test(e.message));
});

test("verifyRows: bulk submit -> poll -> results, defensive field names", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer k");
    if (url.endsWith("/verifications/bulk")) return json({ id: "J1" });
    if (url.endsWith("/verifications/job/J1")) return json({ status: "Completed", progress: 100 });
    if (url.includes("/results?page=1")) return json({ data: [{ address: "A@X.com", result: "valid" }, { email: "b@x.com", status: "invalid" }] });
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  const out = await verifyRows(keysCtx({ OPTIMAVERIFIER_API_KEY: "k" }), [{ email: "a@x.com" }, { email: "B@x.com " }], { jobName: "j" });
  assert.deepEqual(out.map((r) => [r.email_status, r.sendable]), [["valid", "yes"], ["invalid", "no"]]);
  assert.equal(calls.length, 3);
});
