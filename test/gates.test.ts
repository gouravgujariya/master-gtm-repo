import { test } from "node:test";
import assert from "node:assert/strict";
import { missingApproval, laterStages } from "../src/core/gates.ts";

const a = (stage: string, decision: string, t: number) => ({ stage, decision, decidedAt: new Date(t) });

test("no sourcing before strategy is approved", () => {
  assert.equal(missingApproval("source", []), "strategy");
  assert.equal(missingApproval("source", [a("strategy", "approved", 1)]), null);
});

test("a later revoke wins, re-approval unblocks", () => {
  const rows = [a("strategy", "approved", 1), a("strategy", "revoked", 2)];
  assert.equal(missingApproval("source", rows), "strategy");
  assert.equal(missingApproval("source", [...rows, a("strategy", "approved", 3)]), null);
});

test("draft needs copy and send", () => {
  assert.equal(missingApproval("draft", [a("copy", "approved", 1)]), "send");
  assert.equal(missingApproval("research", []), null);
  assert.deepEqual(laterStages("copy"), ["send"]);
});
