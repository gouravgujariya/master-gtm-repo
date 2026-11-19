import { test } from "node:test";
import assert from "node:assert/strict";
import { missingApproval, laterStages } from "../src/core/gates.ts";

const a = (stage: string, decision: string, t: number) => ({ stage, decision, decidedAt: new Date(t) });

test("no research before intake; no sourcing before strategy AND offer", () => {
  assert.equal(missingApproval("research", []), "intake");
  assert.equal(missingApproval("research", [a("intake", "approved", 1)]), null);
  assert.equal(missingApproval("source", []), "strategy");
  assert.equal(missingApproval("source", [a("strategy", "approved", 1)]), "offer");
  assert.equal(missingApproval("source", [a("strategy", "approved", 1), a("offer", "approved", 2)]), null);
});

test("a later revoke wins, re-approval unblocks", () => {
  const rows = [a("strategy", "approved", 1), a("offer", "approved", 1), a("strategy", "revoked", 2)];
  assert.equal(missingApproval("source", rows), "strategy");
  assert.equal(missingApproval("source", [...rows, a("strategy", "approved", 3)]), null);
});

test("qualify sits between companies and contacts; copy needs the offer", () => {
  assert.equal(missingApproval("qualify", [a("companies", "approved", 1)]), null);
  assert.equal(missingApproval("find", [a("companies", "approved", 1)]), "qualified");
  assert.equal(missingApproval("copy", [a("contacts", "approved", 1)]), "offer");
});

test("draft needs copy and send", () => {
  assert.equal(missingApproval("draft", [a("copy", "approved", 1)]), "send");
  assert.deepEqual(laterStages("copy"), ["send"]);
  assert.deepEqual(laterStages("companies"), ["qualified", "contacts", "copy", "send"]);
});
