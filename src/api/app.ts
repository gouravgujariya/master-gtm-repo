// The HTTP app. createApp() is pure wiring so tests can call app.request() without a server.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { AppError } from "../core/errors.ts";
import { config } from "../config.ts";
import { authRoutes, dbSessionUser, requireAuth, type Env, type SessionLookup } from "./auth.ts";
import { clientRoutes } from "./clients.ts";
import { campaignRoutes } from "./campaigns.ts";
import { jobRoutes } from "./jobs.ts";
import { approvalRoutes } from "./approvals.ts";
import { lookupRoutes } from "./lookup.ts";

/** `sessionLookup` is swappable so tests can fake a logged-in user without a DB. */
export function createApp({ sessionLookup = dbSessionUser }: { sessionLookup?: SessionLookup } = {}) {
  const cfg = config();
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
    console.error(err);
    return c.json({ error: { code: "INTERNAL", message: "Internal error" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: `No route ${c.req.method} ${c.req.path}` } }, 404));

  app.use("*", cors({ origin: cfg.CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: true }));
  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", authRoutes(sessionLookup));

  app.use("/api/*", requireAuth(sessionLookup));
  app.route("/api/lookup", lookupRoutes);
  app.route("/api/clients", clientRoutes);
  app.route("/api/campaigns", campaignRoutes);
  app.route("/api/jobs", jobRoutes);
  app.route("/api/approvals", approvalRoutes);

  if (cfg.NODE_ENV === "development") {
    // same-origin UI in dev; in prod the UI is its own deploy
    app.get("/", serveStatic({ path: "./ui-prototype/index.html" }));
    app.use("/*", serveStatic({ root: "./ui-prototype" }));
  }
  return app;
}
