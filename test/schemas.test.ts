import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { Icp, Competitors, Segments, Copy, CompanyRow, ContactRow } from "../src/agents/schemas.ts";

const fx = JSON.parse(readFileSync(new URL("../fixtures/demo/scriptlens.json", import.meta.url), "utf8"));
const R = fx.results;

test("every fixture result parses with its schema", () => {
  Icp.parse(R.research.icp);
  Competitors.parse(R.competitors);
  Segments.parse(R.segments);
  Copy.parse(R.copy);
  z.object({ companies: z.array(CompanyRow).min(1) }).parse(R.source);
  z.object({ contacts: z.array(ContactRow).min(1) }).parse(R.find);
  z.object({
    contacts: z.array(z.object({ email: z.string(), emailStatus: z.string(), sendable: z.boolean(), verifyNote: z.string() })),
    counts: z.object({ sendable: z.number(), held: z.number(), dropped: z.number() }),
  }).parse(R.verify);
  z.object({ externalCampaignId: z.string(), uploaded: z.number() }).parse(R.draft);
});

test("fixture is internally consistent", () => {
  const sendable = R.verify.contacts.filter((c: any) => c.sendable).map((c: any) => c.email);
  assert.equal(R.verify.counts.sendable, sendable.length);
  assert.deepEqual(R.copy.leads.map((l: any) => l.email), sendable);
  assert.equal(R.draft.uploaded, sendable.length);
  for (const t of ["research", "competitors", "segments", "source", "find", "verify", "copy", "draft"]) assert.ok(fx.logs[t]?.length, t);
});

test("schemas reject bad shapes", () => {
  assert.equal(Copy.safeParse({ ...R.copy, subject: "one" }).success, false);
  assert.equal(Copy.safeParse({ ...R.copy, subject: "far too many words here" }).success, false);
  assert.equal(Segments.safeParse({ segments: R.segments.segments.slice(0, 5) }).success, false);
  assert.equal(Segments.safeParse({ segments: [{ ...R.segments.segments[0], angle: "nope" }, ...R.segments.segments.slice(1)] }).success, false);
  assert.ok(z.toJSONSchema(Segments)); // usable as structured-output schema
});
