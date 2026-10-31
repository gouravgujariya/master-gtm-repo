import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/none"; // pool connects lazily; these tests never query
const { createApp } = await import("../src/api/app.ts");
const { pool } = await import("../src/db/client.ts");
const { parseHead, normalizeDomain } = await import("../src/api/lookup.ts");
after(() => pool.end());

const SID = "11111111-1111-4111-8111-111111111111";
const fake = createApp({ sessionLookup: async (sid) => (sid === SID ? { id: SID, email: "a@b.c", role: "admin" } : null) });

test("health", async () => {
  const res = await createApp().request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("/api/* needs a session (no DB touched without a cookie)", async () => {
  const res = await createApp().request("/api/clients");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "UNAUTHORIZED");
  assert.equal((await createApp().request("/api/clients", { headers: { cookie: "sid=not-a-uuid" } })).status, 401);
});

test("POST /api/jobs validates the body → 400 {error:{code,message}}", async () => {
  const post = (body: string) => fake.request("/api/jobs", { method: "POST", body, headers: { "content-type": "application/json", cookie: `sid=${SID}` } });
  for (const body of ['{"type":"nope"}', "not json", JSON.stringify({ clientId: SID, type: "source" })]) {
    const res = await post(body);
    assert.equal(res.status, 400, body);
    const j = await res.json();
    assert.equal(j.error.code, "VALIDATION");
    assert.equal(typeof j.error.message, "string");
  }
});

test("source on an unwired dataset → 409 NOT_WIRED", async () => {
  const res = await fake.request("/api/jobs", { method: "POST", headers: { "content-type": "application/json", cookie: `sid=${SID}` },
    body: JSON.stringify({ clientId: SID, campaignId: SID, type: "source", input: { dataset: "hiring" } }) });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "NOT_WIRED");
});

test("lookup parsing", () => {
  assert.equal(normalizeDomain("https://WWW.Acme.com/about"), "acme.com");
  assert.equal(normalizeDomain("acme.io"), "acme.io");
  const h = parseHead(`<title>Acme &amp; Co | Widgets</title><meta content="Best widgets" property="og:description"><link href="/i.png" rel="icon">`, "https://acme.com/");
  assert.deepEqual(h, { title: "Acme & Co | Widgets", description: "Best widgets", favicon: "https://acme.com/i.png" });
});

test("lookup refuses private addresses (SSRF)", async () => {
  const { isPrivateIp } = await import("../src/api/lookup.ts");
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.2", "172.20.0.1", "100.64.0.1", "::1", "fd00::1"]) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ["93.184.216.34", "172.32.0.1", "8.8.8.8"]) assert.ok(!isPrivateIp(ip), ip);
});
