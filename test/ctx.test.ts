import { test } from "node:test";
import assert from "node:assert/strict";
import { keysCtx } from "../src/core/ctx.ts";
import { MissingKeyError } from "../src/core/errors.ts";

test("keysCtx returns keys and throws MissingKeyError (never exits)", () => {
  const ctx = keysCtx({ A: "1" });
  assert.equal(ctx.getKey("A"), "1");
  assert.throws(() => ctx.getKey("B"), MissingKeyError);
});
