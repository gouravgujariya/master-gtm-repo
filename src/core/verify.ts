// The FIXED verify gate (Eric's strategy). Every email goes through OptimaVerifier before it can be sendable:
//   valid     -> sendable
//   invalid   -> dropped
//   catch-all -> NOT sendable unless cross-checked VALID (finder's ai_ark_status, or injected crossCheckCatchAll)
//   unknown   -> held (rescued only if the finder already source-verified it VALID via ai_ark_status)
import type { Ctx } from "./ctx.ts";
import { verifyBulk } from "../providers/optimaverifier.ts";

/** valid | invalid | catch-all | unknown  ->  gate decision */
export function gate(status: string): { sendable: boolean; note: string } {
  switch ((status || "").toLowerCase()) {
    case "valid": return { sendable: true, note: "" };
    case "invalid": return { sendable: false, note: "dropped: invalid" };
    case "catch-all":
    case "catch_all": return { sendable: false, note: "catch-all: needs cross-check (AgenticData)" };
    case "unknown": return { sendable: false, note: "unknown: hold, re-verify later" };
    default: return { sendable: false, note: `unrecognized status: ${status}` };
  }
}

export const normStatus = (status: string) => status.toLowerCase().replace("_", "-");

/** Apply the gate to CSV rows given an email -> status map. Rows missing from the map are "unknown". */
export async function gateRows(
  rows: Record<string, string>[],
  statusMap: Map<string, string>,
  emailCol = "email",
  crossCheckCatchAll?: (email: string) => Promise<boolean>,
): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const em = (r[emailCol] || "").toLowerCase().trim();
    const status = statusMap.get(em) || "unknown";
    const g = gate(status);
    let sendable = g.sendable, note = g.note;
    // Catch-all cross-check: if the email was found + BounceBan-verified VALID by AI Ark, rescue it.
    const s = normStatus(status);
    if (!sendable && (s === "catch-all" || s === "unknown") && /VALID/i.test(r.ai_ark_status || "")) {
      sendable = true; note = "rescued: AI Ark source-verified VALID";
    } else if (!sendable && s === "catch-all" && em && crossCheckCatchAll && await crossCheckCatchAll(em)) {
      sendable = true; note = "rescued: catch-all cross-check VALID";
    }
    out.push({ ...r, email_status: status, sendable: sendable ? "yes" : "no", verify_note: note });
  }
  return out;
}

/** Bulk-verify the unique emails in `rows` and gate every row. */
export async function verifyRows(
  ctx: Ctx,
  rows: Record<string, string>[],
  opts: {
    emailCol?: string;
    jobName: string;
    crossCheckCatchAll?: (email: string) => Promise<boolean>;
    onProgress?: (status: string, pct: string) => void;
  },
): Promise<Record<string, string>[]> {
  const emailCol = opts.emailCol || "email";
  const emails = Array.from(new Set(rows.map((r) => (r[emailCol] || "").toLowerCase().trim()).filter(Boolean)));
  const statusMap = await verifyBulk(ctx, emails, opts.jobName, opts.onProgress);
  return gateRows(rows, statusMap, emailCol, opts.crossCheckCatchAll);
}
