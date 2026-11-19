// The video-derived steps: exclusions at sourcing, AI qualification, reachable counts, CSV export.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgres://u@localhost:5432/unused"; // config() validates; no DB is touched
process.env.BULK_DIR = "fixtures/bulk-sample";
import { keysCtx } from "../src/core/ctx.ts";
import { MissingKeyError } from "../src/core/errors.ts";
import { sourceCore, qualifyCore, parseDncDomains } from "../src/jobs/handlers.ts";
import { bulkSaas, bulkLocal, countSegments } from "../src/providers/bulk.ts";

const DIR = "fixtures/bulk-sample";

test("DNC parsing: domains and emails, any layout", () => {
  assert.deepEqual(parseDncDomains("acme.com\nbob@Beta.io, https://www.gamma.co.uk/x\nnot a domain"), ["acme.com", "beta.io", "gamma.co.uk"]);
});

test("source: skips with the specific reason and counts them", async () => {
  const lines: string[] = [];
  const skip = new Map([["northwindanalytics.example", "do-not-contact list"], ["bluefinmetrics.example", "competitor"]]);
  const r = await sourceCore(keysCtx({}, (m) => lines.push(m)), { dataset: "saas", filters: { industry: "analytics" }, limit: 2 }, skip);
  assert.ok(!r.companies.some((c) => skip.has(c.domain)));
  assert.equal(r.companies.length, 2);
  assert.deepEqual(r.skipped, { "do-not-contact list": 1, competitor: 1 });
  assert.ok(lines.some((l) => /northwindanalytics.example: do-not-contact list — skipped/.test(l)));
});

test("qualify: unreachable sites are null (never guessed), the rest judged with a reason", async () => {
  const ctx = keysCtx({ FIRECRAWL_API_KEY: "k" });
  const scrape = async (_c: unknown, url: string) => { if (url.includes("down")) throw new Error("timeout"); return url.includes("blank") ? "  " : `site of ${url}`; };
  let asked: string[] = [];
  const judge = async (_c: unknown, i: { criterion: string; companies: { domain: string }[] }) => {
    asked = i.companies.map((c) => c.domain);
    return { results: i.companies.map((c) => ({ domain: c.domain, qualified: c.domain === "yes.com", reason: "because" })), costUsd: 0.01 };
  };
  const r = await qualifyCore(ctx, [{ domain: "yes.com" }, { domain: "no.com" }, { domain: "down.com" }, { domain: "blank.com" }], "Is it a fit?", scrape as any, judge);
  assert.deepEqual(asked, ["yes.com", "no.com"]);
  assert.deepEqual(r.counts, { qualified: 1, rejected: 1, unknown: 2 });
  assert.equal(r.results.find((x) => x.domain === "down.com")?.qualified, null);
});

test("qualify: no FireCrawl key → MissingKeyError before any scrape (demo fallback under auto)", async () => {
  let scraped = 0;
  await assert.rejects(qualifyCore(keysCtx({}), [{ domain: "a.com" }], "q", (async () => { scraped++; return "x"; }) as any, async () => ({ results: [], costUsd: 0 })), MissingKeyError);
  assert.equal(scraped, 0);
});

test("reachable counts: one pass, same matching as sourcing; lookalike/none → null", async () => {
  const segs = [
    { dataset: "saas", filters: { industry: "analytics" } },
    { dataset: "local", filters: { category: "dentist", state: "TX" } },
    { dataset: "lookalike", filters: {} },
    { dataset: "saas", filters: {} },
  ];
  const n = await countSegments(DIR, segs);
  assert.equal(n[0], (await bulkSaas(DIR, segs[0].filters, 1e6)).length);
  assert.equal(n[1], (await bulkLocal(DIR, segs[1].filters, 1e6)).length);
  assert.equal(n[2], null);
  assert.equal(n[3], (await bulkSaas(DIR, {}, 1e6)).length);
  assert.deepEqual(await countSegments("/nope", [{ dataset: "saas" }]), [null]);
});

test("CSV export quotes only when needed", async () => {
  const { toCsv } = await import("../src/api/campaigns.ts"); // after DATABASE_URL is set (static imports hoist)
  assert.equal(toCsv([{ a: "x", b: 'say "hi", ok' }, { a: null, b: 2 }], ["a", "b"]), 'a,b\nx,"say ""hi"", ok"\n,2\n');
});
