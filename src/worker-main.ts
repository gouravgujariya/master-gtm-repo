// Worker process entry (no HTTP). npm run worker / dev:worker. Shares only the database with the API.
import { config } from "./config.ts";
import { db, pool } from "./db/client.ts";
import { reapStale, startWorker } from "./jobs/worker.ts";

const cfg = config();
const reaped = await reapStale(db);
if (reaped) console.log(`marked ${reaped} stale running job(s) as error (worker restarted)`);

const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);
const worker = startWorker(db, { concurrency });
console.log(`worker up · concurrency ${concurrency} · DEMO_MODE ${cfg.DEMO_MODE}`);

let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, async () => {
  if (stopping) return;
  stopping = true;
  console.log(`${sig}: finishing current job(s)…`);
  await worker.stop(); // Railway sends SIGKILL ~30s after SIGTERM; stop() aborts at 20s
  await pool.end();
  process.exit(0);
});
