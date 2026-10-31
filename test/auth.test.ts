import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://test:test@127.0.0.1:1/none"; // pool connects lazily
const { hashPassword, verifyPassword } = await import("../src/api/auth.ts");

test("scrypt round-trip; bad password rejected", async () => {
  const h = await hashPassword("s3cret!");
  assert.match(h, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("s3cret!", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
  assert.equal(await verifyPassword("s3cret!", "garbage"), false);
});

test("login → me → logout against a real DB", { skip: !process.env.TEST_DATABASE_URL && "TEST_DATABASE_URL not set" }, async () => {
  const { createApp } = await import("../src/api/app.ts");
  const { db } = await import("../src/db/client.ts");
  const { users } = await import("../src/db/schema.ts");
  const { eq } = await import("drizzle-orm");
  const email = `t${Date.now()}@test.local`;
  await db.insert(users).values({ email, passHash: await hashPassword("pw") });
  try {
    const app = createApp();
    const post = (path: string, body: unknown, cookie = "") => app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", cookie } });
    assert.equal((await post("/auth/login", { email, password: "nope" })).status, 401);
    const res = await post("/auth/login", { email, password: "pw" });
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const me = await app.request("/auth/me", { headers: { cookie } });
    assert.equal((await me.json()).user.email, email);
    await post("/auth/logout", {}, cookie);
    assert.equal((await app.request("/auth/me", { headers: { cookie } })).status, 401);
  } finally {
    await db.delete(users).where(eq(users.email, email));
  }
});
