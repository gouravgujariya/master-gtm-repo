import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { keysCtx } from "../src/core/ctx.ts";
import { MissingKeyError, ProviderError } from "../src/core/errors.ts";
import { pickForCompany } from "../src/providers/agenticdata.ts";
import { searchCompanies } from "../src/providers/ai-ark.ts";
import { findWorkEmail } from "../src/providers/coldiq.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const stub = (status: number, body: unknown, seen: { url: string; init: any }[] = []) => {
  globalThis.fetch = (async (url: any, init: any) => { seen.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status }); }) as typeof fetch;
  return seen;
};

test("adapters throw MissingKeyError (no exit, no fetch) when key absent", async () => {
  const seen = stub(200, {});
  const ctx = keysCtx({});
  await assert.rejects(pickForCompany(ctx, "a.com"), MissingKeyError);
  await assert.rejects(searchCompanies(ctx, [], 5), MissingKeyError);
  await assert.rejects(findWorkEmail(ctx, "linkedin.com/in/x"), MissingKeyError);
  assert.equal(seen.length, 0);
});

test("adapters throw ProviderError on non-200", async () => {
  stub(500, { error: "boom" });
  const ctx = keysCtx({ ADATA_API_KEY: "k", AI_ARK_API_KEY: "k", COLDIQ_API_KEY: "k" });
  await assert.rejects(pickForCompany(ctx, "a.com"), ProviderError);
  await assert.rejects(searchCompanies(ctx, [], 5), (e: any) => e instanceof ProviderError && e.httpStatus === 500);
  await assert.rejects(findWorkEmail(ctx, "x"), ProviderError);
});

test("adapters send the key from ctx.getKey", async () => {
  const seen = stub(200, { email: "a@b.com" });
  const email = await findWorkEmail(keysCtx({ COLDIQ_API_KEY: "ciq-key" }), "linkedin.com/in/x");
  assert.equal(email, "a@b.com");
  assert.equal(seen[0].init.headers.Authorization, "Bearer ciq-key");
  assert.equal(JSON.parse(seen[0].init.body).linkedin_url, "https://linkedin.com/in/x");
});

test("agenticdata picks most senior person with email, same row shape", async () => {
  stub(200, { results: [
    { first_name: "M", last_name: "Gr", job_title: "Manager", primary_email: "m@a.com" },
    { first_name: "Jo", last_name: "Ce", job_title: "CEO", primary_email: "JO@A.COM", linkedin_url: "li" },
  ] });
  const r = await pickForCompany(keysCtx({ ADATA_API_KEY: "k" }), "a.com", "CEO");
  assert.deepEqual(r, { email: "jo@a.com", first_name: "Jo", last_name: "Ce", company_name: "", company_domain: "a.com", title: "CEO", linkedin_url: "li", find_source: "agenticdata" });
});
