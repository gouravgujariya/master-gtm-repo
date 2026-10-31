// Execution context passed to every provider adapter and core function.
// Adapters NEVER read process.env or call requireKey directly — they ask ctx.getKey().
// That is what lets the same code run as a CLI (global .env) or as a worker job (per-client keys).

import { loadEnv } from "../../lib/env.ts";
import { MissingKeyError } from "./errors.ts";

export interface Ctx {
  clientId?: string;
  /** Returns the key or throws MissingKeyError. */
  getKey(name: string): string;
  log(msg: string): void;
  signal?: AbortSignal;
}

/** Context for CLI scripts: keys from repo .env / process.env, logs to stdout. */
export function cliCtx(): Ctx {
  return {
    getKey(name) {
      const v = loadEnv()[name] || process.env[name];
      if (!v) throw new MissingKeyError(name);
      return v;
    },
    log: (msg) => console.log(msg),
  };
}

/** Context with explicit keys (worker jobs: client secrets merged over globals; tests: fakes). */
export function keysCtx(keys: Record<string, string | undefined>, log: (m: string) => void = () => {}, signal?: AbortSignal): Ctx {
  return {
    getKey(name) {
      const v = keys[name];
      if (!v) throw new MissingKeyError(name);
      return v;
    },
    log,
    signal,
  };
}

/** Wrap a CLI main(): MissingKeyError keeps the old "❌ Missing X" + exit 1 behaviour. */
export function runCli(main: () => Promise<void>): void {
  main().catch((e) => {
    if (e instanceof MissingKeyError) console.error(`\n❌ ${e.message}\n`);
    else console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
