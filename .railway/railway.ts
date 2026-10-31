// Railway Infrastructure as Code (replaces railway.json — Config as Code is deprecated,
// new services can't use it, and it stops being read 2026-12-01).
// Docs: https://docs.railway.com/infrastructure-as-code + /infrastructure-as-code/reference
// Preview/apply per environment:  railway config plan  →  railway config apply
// See docs/deploy-railway.md.
import { defineRailway, project, service, github, postgres, volume } from "railway/iac";

const REPO = "gouravgujariya/master-gtm-repo";

// Secrets/keys live as per-environment SHARED variables (set in the dashboard, never here);
// both services reference them. Missing ones resolve empty → DEMO_MODE=auto falls back to fixtures.
const SHARED = [
  "SECRETS_MASTER_KEY",
  "ANTHROPIC_API_KEY",
  "FIRECRAWL_API_KEY",
  "ADATA_API_KEY",
  "AI_ARK_API_KEY",
  "COLDIQ_API_KEY",
  "OPTIMAVERIFIER_API_KEY",
  "PLUSVIBE_API_KEY",
  "SERPER_API_KEY",
] as const;

export default defineRailway((ctx) => {
  const prod = ctx.isEnvironment("production");
  // ponytail: one dev branch; change here if development should track another branch.
  const source = github(REPO, { branch: prod ? "main" : "develop", checkSuites: true }); // checkSuites = "Wait for CI"

  const db = postgres("postgres"); // each environment gets its own instance

  const shared = Object.fromEntries(SHARED.map((k) => [k, ctx.shared[k]]));
  const env = {
    ...shared,
    DATABASE_URL: db.env.DATABASE_URL, // private network URL
    NODE_ENV: "production",
    RAILPACK_NODE_VERSION: "24", // engines.node (>=20) would otherwise float to the newest major
    DEMO_MODE: prod ? "off" : "auto",
    LLM_DAILY_BUDGET_USD: prod ? "20" : "5",
  };

  const api = service("api", {
    source,
    build: { builder: "RAILPACK", watchPatterns: ["src/**", "ui-prototype/**", "fixtures/**", "package.json", "package-lock.json"] },
    deploy: {
      startCommand: "npm start",
      preDeployCommand: ["npm run db:migrate:deploy"],
      healthcheckPath: "/health",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    env: {
      ...env,
      // UI is served by the api itself → same origin. Add the gtm-ui origin here when it ships (comma list).
      CORS_ORIGIN: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
    },
  });

  // Volumes attach to ONE service → the worker owns files (research md, exports) + bulk CSV lists.
  const data = volume("worker-data");

  const worker = service("worker", {
    source,
    build: { builder: "RAILPACK", watchPatterns: ["src/**", "skills/**", "fixtures/**", "package.json", "package-lock.json"] },
    deploy: { startCommand: "npm run worker", restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    volumeMounts: { "/data": data },
    env: {
      ...env,
      STORAGE_DIR: "/data/files",
      BULK_DIR: "/data/bulk",
      WORKER_CONCURRENCY: "2",
    },
  });

  return project("master-gtm", { environments: ["production", "development"], resources: [db, api, worker, data] });
});
