/**
 * plusvibe-upload.ts — create a DRAFT campaign in Plusvibe: sequence + schedule + verified leads.
 * Never activates — leaves the campaign inactive for a human to review and Start.
 *
 *   npm run plusvibe-upload -- --leads=verified.csv --sequence=sequence.json \
 *     [--name="Campaign"] [--workspace=<id>] [--max=10] [--no-accounts] [--campaign-id=<id>]
 *
 * Logic lives in src/core/draft.ts (+ src/providers/plusvibe.ts). Only sendable=yes leads are uploaded;
 * --all is accepted but ignored (verify every email).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { args, parseCsv } from "../lib/env.ts";
import { cliCtx, runCli } from "../src/core/ctx.ts";
import { createDraft } from "../src/core/draft.ts";

runCli(async () => {
  const ctx = cliCtx();
  ctx.getKey("PLUSVIBE_API_KEY"); // fail fast, as before
  const a = args();
  if (!a.leads || !a.sequence) { console.error("--leads=verified.csv --sequence=sequence.json required"); process.exit(1); }
  const seq = JSON.parse(readFileSync(resolve(a.sequence as string), "utf8"));
  const rows = parseCsv(readFileSync(resolve(a.leads as string), "utf8"));
  if (a.all) console.log("  --all ignored: only verified (sendable=yes) leads go to Plusvibe.");

  const { campaignId, name } = await createDraft(ctx, {
    rows, seq,
    name: a.name as string, workspace: a.workspace as string, campaignId: a["campaign-id"] as string,
    max: Number(a.max || 10), accounts: !a["no-accounts"],
  });

  console.log(`\n🎯 DRAFT ready (NOT sending — review + Start manually):`);
  console.log(`   Campaign: ${name}`);
  console.log(`   Open Plusvibe → Campaigns: https://app.plusvibe.ai/v2/campaign/${campaignId}`);
  console.log(`   (or app.plusvibe.ai → workspace "A for Analytics" → Campaigns)`);
});
