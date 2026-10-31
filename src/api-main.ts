// API process: HTTP + SSE. Shares only the database with the worker.
import { serve } from "@hono/node-server";
import { config } from "./config.ts";
import { pool } from "./db/client.ts";
import { createApp } from "./api/app.ts";

const port = config().PORT;
const server = serve({ fetch: createApp().fetch, port }, () => console.log(`api listening on :${port}`));

let stopping = false;
function shutdown(sig: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${sig}: shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref(); // open SSE streams can hold close() forever
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
