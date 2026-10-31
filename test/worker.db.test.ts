// Needs a throwaway, migratable Postgres: TEST_DATABASE_URL=postgres://…/gtm_test npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL ||= url || "postgres://u@localhost:5432/unused";

test("worker against Postgres", { skip: !url && "set TEST_DATABASE_URL" }, async (t) => {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { eq } = await import("drizzle-orm");
  const schema = await import("../src/db/schema.ts");
  const { claim, startWorker } = await import("../src/jobs/worker.ts");
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema }) as any;
  await migrate(db, { migrationsFolder: new URL("../src/db/migrations", import.meta.url).pathname });
  await db.delete(schema.jobs).where(eq(schema.jobs.status, "queued"));
  const [client] = await db.insert(schema.clients).values({ slug: `w-${Date.now()}`, name: "W" }).returning();
  after(async () => { await db.delete(schema.clients).where(eq(schema.clients.id, client.id)); await pool.end(); });
  const enqueue = async (type = "research") => (await db.insert(schema.jobs).values({ clientId: client.id, type }).returning())[0];
  const until = async (id: string, status: string) => {
    for (let i = 0; i < 100; i++) {
      const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
      if (j.status === status) return j;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail(`job ${id} never reached ${status}`);
  };

  await t.test("two concurrent claims get different jobs", async () => {
    const a = await enqueue(), b = await enqueue();
    const [x, y] = await Promise.all([claim(db), claim(db)]);
    assert.deepEqual(new Set([x!.id, y!.id]), new Set([a.id, b.id]));
    assert.equal(x!.status, "running");
    assert.equal(x!.attempts, 1);
    assert.equal(await claim(db), null);
  });

  await t.test("cancel_requested aborts ctx.signal → cancelled; logs appended; gate refuses", async () => {
    let aborted = false;
    const w = startWorker(db, {
      concurrency: 1, pollMs: 20, heartbeatMs: 30,
      run: (ctx) => new Promise((_, no) => { ctx.log("started"); ctx.signal!.addEventListener("abort", () => { aborted = true; no(new Error("x")); }); }),
    });
    const job = await enqueue();
    await until(job.id, "running");
    await db.update(schema.jobs).set({ cancelRequested: true }).where(eq(schema.jobs.id, job.id));
    const done = await until(job.id, "cancelled");
    assert.equal(aborted, true);
    assert.match(done.log, /started\n/);
    const gated = await enqueue("source"); // needs "strategy" approval
    assert.match((await until(gated.id, "error")).result.error, /strategy/);
    await w.stop();
  });
});
