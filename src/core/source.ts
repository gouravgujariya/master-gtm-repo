// Company sourcing. Strategy rule (fixed): BULK FIRST. The free local datasets are the default;
// a paid source only runs with an explicit allowPaid + a written reason (e.g. "bulk returned 0 for X").
import type { Ctx } from "./ctx.ts";
import { AppError } from "./errors.ts";
import { bulkSaas, bulkLocal, DEFAULT_LISTS_DIR, type Filters } from "../providers/bulk.ts";

export type Row = Record<string, string>;
export interface SourceOpts {
  dataset: "saas" | "local";
  filters?: Filters;
  limit?: number;
  dir?: string;
  /** Paid live source (e.g. AI Ark lookalikes) — passed in by the caller, gated below. */
  paid?: (ctx: Ctx) => Promise<Row[]>;
  allowPaid?: boolean;
  reason?: string;
}

/** Throws unless the caller explicitly opted into a paid source and said why. */
export function assertPaidAllowed(opts: { allowPaid?: boolean; reason?: string }): void {
  if (!opts.allowPaid || !opts.reason?.trim())
    throw new AppError(400, "BULK_FIRST", "Paid sources need allowPaid: true and a reason — try the bulk lists first.");
}

export async function sourceCompanies(ctx: Ctx, opts: SourceOpts): Promise<Row[]> {
  if (opts.paid) {
    assertPaidAllowed(opts);
    ctx.log(`Paid source approved: ${opts.reason}`);
    return opts.paid(ctx);
  }
  const dir = opts.dir || DEFAULT_LISTS_DIR, f = opts.filters || {}, limit = opts.limit ?? 5;
  return opts.dataset === "saas" ? bulkSaas(dir, f, limit) : bulkLocal(dir, f, limit);
}
