import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { keysCtx } from "../src/core/ctx.ts";
import { findContact } from "../src/core/find.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const ctx = keysCtx({ ADATA_API_KEY: "k", AI_ARK_API_KEY: "k", COLDIQ_API_KEY: "k" });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** Records which provider each call hit; `route` returns the response per URL. */
function stub(route: (url: string) => Response) {
  const hits: string[] = [];
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    hits.push(u.includes("agenticdata") ? "agenticdata" : u.includes("ai-ark") ? "ai-ark" : u.includes("coldiq") ? "coldiq" : u);
    return route(u);
  }) as typeof fetch;
  return hits;
}
const order = (hits: string[]) => hits.filter((h, i) => h !== hits[i - 1]);

test("stops at agenticdata when it hits", async () => {
  const hits = stub(() => json({ results: [{ first_name: "A", last_name: "B", job_title: "CEO", primary_email: "a@x.com" }] }));
  const r = await findContact(ctx, { domain: "https://www.x.com/about", title: "CEO", linkedin_url: "li" });
  assert.equal(r?.find_source, "agenticdata");
  assert.equal(r?.company_domain, "x.com");
  assert.deepEqual(order(hits), ["agenticdata"]);
});

test("falls through agenticdata → ai-ark and stops there", async () => {
  const hits = stub((u) => {
    if (u.includes("agenticdata")) return json({ results: [] });
    if (u.endsWith("/v1/people")) return json({ trackId: "t1", content: [{ first_name: "C", last_name: "D", job_title: "Owner" }] });
    if (u.includes("/inquiries")) return json({ content: [{ state: "DONE", input: { firstname: "C", lastname: "D" }, output: [{ domainType: "SMTP", status: "VALID", address: "c@x.com" }] }] });
    return json({});
  });
  const r = await findContact(ctx, { domain: "x.com", linkedin_url: "li" });
  assert.equal(r?.find_source, "ai-ark");
  assert.equal(r?.email, "c@x.com");
  assert.deepEqual(order(hits), ["agenticdata", "ai-ark"]);
});

test("order is agenticdata → ai-ark → coldiq; provider errors fall through", async () => {
  const hits = stub((u) => {
    if (u.includes("agenticdata")) return json({ err: 1 }, 500);
    if (u.includes("ai-ark")) return json({ trackId: null, content: [] });
    return json({ email: "e@x.com" });
  });
  const r = await findContact(ctx, { domain: "x.com", first_name: "E", last_name: "F" });
  assert.equal(r?.find_source, "coldiq");
  assert.equal(r?.email, "e@x.com");
  assert.deepEqual(order(hits), ["agenticdata", "ai-ark", "coldiq"]);
});

test("returns null when nobody hits; coldiq skipped without a person", async () => {
  const hits = stub((u) => u.includes("agenticdata") ? json({ results: [] }) : json({ content: [] }));
  assert.equal(await findContact(ctx, { domain: "x.com" }), null);
  assert.deepEqual(order(hits), ["agenticdata", "ai-ark"]);
});
