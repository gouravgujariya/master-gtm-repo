// OptimaVerifier adapter — https://app.optimaverifier.com/api/v1, Bearer auth.
// Docs: references/optimaverifier-api.md
// NOTE: bulk response field names (job id, results shape) are handled defensively — confirm against a
// real run and tighten if needed.
import { sleep } from "../../lib/env.ts";
import type { Ctx } from "../core/ctx.ts";
import { ProviderError } from "../core/errors.ts";

const BASE = "https://app.optimaverifier.com/api/v1";

async function ov(ctx: Ctx, path: string, init: RequestInit = {}): Promise<any> {
  const key = ctx.getKey("OPTIMAVERIFIER_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: ctx.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new ProviderError(`OptimaVerifier ${path}`, res.status, text);
  return json;
}

/** Credit balance (raw response; balance is in .balance or .credits). */
export async function getCredits(ctx: Ctx): Promise<any> {
  return ov(ctx, "/credits");
}

/** Single verify (1 credit). Returns the raw status string + raw response. */
export async function verifySingle(ctx: Ctx, email: string): Promise<{ status: string; raw: any }> {
  const r = await ov(ctx, "/verifications/single", { method: "POST", body: JSON.stringify({ email }) });
  return { status: r.status ?? r.result ?? "unknown", raw: r };
}

/** Bulk verify: submit, poll until done, page results. Returns lowercase email -> raw status. */
export async function verifyBulk(
  ctx: Ctx,
  emails: string[],
  jobName: string,
  onProgress?: (status: string, pct: string) => void,
): Promise<Map<string, string>> {
  ctx.log(`Submitting ${emails.length} emails to OptimaVerifier bulk...`);
  const submit = await ov(ctx, "/verifications/bulk", {
    method: "POST",
    body: JSON.stringify({ emails, job_name: jobName }),
  });
  const jobId = submit.job_id ?? submit.id ?? submit.jobId ?? submit.job?.id;
  if (!jobId) throw new Error(`Could not find job id in bulk response: ${JSON.stringify(submit).slice(0, 300)}`);
  ctx.log(`Job ${jobId} queued. Polling...`);

  // Poll until completed
  for (let i = 0; i < 600; i++) {
    const job = await ov(ctx, `/verifications/job/${jobId}`);
    const status = (job.status ?? "").toLowerCase();
    const pct = job.progress_percentage ?? job.progress ?? "";
    onProgress?.(status, String(pct));
    if (status === "completed" || status === "complete" || status === "done") break;
    await sleep(3000);
  }

  // Page through results
  const map = new Map<string, string>();
  for (let page = 1; page < 100000; page++) {
    const r = await ov(ctx, `/verifications/job/${jobId}/results?page=${page}&per_page=100`);
    const items: any[] = r.results ?? r.data ?? r.items ?? [];
    if (!items.length) break;
    for (const it of items) {
      const em = (it.email ?? it.address ?? "").toLowerCase();
      const st = it.status ?? it.result ?? "unknown";
      if (em) map.set(em, st);
    }
    if (items.length < 100) break;
  }
  return map;
}
