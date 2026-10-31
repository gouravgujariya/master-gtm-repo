// Validated runtime config for the API + worker. Fails fast at boot on bad env.
// Load env with: tsx --env-file=.env.development ... (see package.json scripts).

import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  STORAGE_DIR: z.string().default("./data/files"),
  BULK_DIR: z.string().default("./Common Outbound Lists"),
  SECRETS_MASTER_KEY: z.string().optional(), // required once client secrets are used (Phase 3)
  CORS_ORIGIN: z.string().default("http://localhost:5173"), // comma-separated list allowed
  // on: every job uses fixtures; auto: fall back to fixtures on MissingKeyError (never for draft); off: errors surface
  DEMO_MODE: z.enum(["off", "auto", "on"]).default("auto"),
  LLM_DAILY_BUDGET_USD: z.coerce.number().default(5),
});

export type Config = z.infer<typeof Env>;

let cached: Config | null = null;
export function config(): Config {
  if (cached) return cached;
  const r = Env.safeParse(process.env);
  if (!r.success) {
    console.error("Invalid environment:\n" + r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }
  return (cached = r.data);
}
