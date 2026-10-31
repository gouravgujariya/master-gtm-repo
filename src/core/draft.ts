// Step 7: push verified leads into a Plusvibe DRAFT campaign. Strategy rules (fixed):
//  - ALWAYS DRAFT: never starts the campaign (the adapter can't), a human hits Start.
//  - VERIFY EVERY EMAIL: only rows marked sendable=yes (OptimaVerifier gate) are uploaded; the rest are refused.
import type { Ctx } from "./ctx.ts";
import { AppError } from "./errors.ts";
import * as plusvibe from "../providers/plusvibe.ts";

export type LeadRow = Record<string, string>;

/** Only verified (sendable=yes) rows with an email, capped at max. */
export function sendableLeads(rows: LeadRow[], max = 10) {
  const ok = rows.filter((r) => (r.sendable || "").toLowerCase() === "yes" && r.email);
  return { leads: ok.slice(0, max), refused: rows.length - ok.length };
}

export interface DraftOpts {
  rows: LeadRow[];
  seq: { campaign_name?: string; schedule: unknown; sequences: unknown[] };
  name?: string;
  workspace?: string;
  campaignId?: string;
  max?: number;
  accounts?: boolean;
}

export async function createDraft(ctx: Ctx, o: DraftOpts) {
  // filter BEFORE any API call so a bad file never leaves an empty draft behind
  const { leads: usable, refused } = sendableLeads(o.rows, o.max ?? 10);
  if (refused) ctx.log(`  Refused ${refused} non-sendable lead(s) — only verified (sendable=yes) leads are drafted.`);
  if (!usable.length) throw new AppError(400, "NO_SENDABLE_LEADS", "No sendable leads to add.");

  // 1) workspace
  const auth = await plusvibe.authenticate(ctx);
  const ws = o.workspace || auth.workspaces?.[0]?._id;
  if (!ws) throw new Error("No workspace found for this API key.");
  ctx.log(`✓ Workspace: ${auth.workspaces?.[0]?.name} (${ws}) · account ${auth.account}`);

  // 2) create campaign (draft) — or reuse an existing one
  const name = o.name || o.seq.campaign_name || "GTM Draft Campaign";
  let campaignId = o.campaignId || "";
  if (campaignId) {
    ctx.log(`✓ Reusing existing campaign ${campaignId}`);
  } else {
    const created = await plusvibe.createCampaign(ctx, ws, name);
    campaignId = created.id || created.campaign_id || created._id;
    if (!campaignId) throw new Error(`No campaign id returned: ${JSON.stringify(created).slice(0, 200)}`);
    ctx.log(`✓ Created draft campaign "${name}" (${campaignId})`);
  }

  // 3) email accounts (optional — attach warmed inboxes if any)
  let emailAccounts: string[] = [];
  if (o.accounts !== false) {
    try {
      const accts = await plusvibe.listAccounts(ctx, ws);
      const list = accts.data || accts.accounts || accts || [];
      emailAccounts = (Array.isArray(list) ? list : []).map((x: any) => x._id || x.id).filter(Boolean).slice(0, 25);
      ctx.log(`✓ Found ${emailAccounts.length} email account(s) in workspace.`);
    } catch (e: any) { ctx.log(`  (could not list email accounts: ${e.message.slice(0, 60)})`); }
  }

  // 4) update campaign with sequence + schedule (stays draft — no status set)
  const upd: Record<string, unknown> = {
    workspace_id: ws, campaign_id: campaignId,
    schedules: [o.seq.schedule],         // API expects an array of schedule objects
    sequences: o.seq.sequences,
    first_wait_time: 0,                  // required by the API
    first_wait_time_unit: "days",
    stop_on_lead_replied: "yes",
    is_unsubscribed_link: "no",
  };
  if (emailAccounts.length) upd.email_accounts = emailAccounts;
  await plusvibe.updateCampaign(ctx, upd);
  ctx.log(`✓ Set ${o.seq.sequences.length}-step sequence + schedule${emailAccounts.length ? " + inboxes" : ""}.`);

  // 5) add verified leads
  const leads = usable.map((r) => ({
    email: r.email, first_name: r.first_name || "", last_name: r.last_name || "",
    company_name: r.company_name || "", company_website: r.company_domain || "",
    linkedin_person_url: r.linkedin_url || "",
    // email_body: per-lead step-1 body (worker sets step 1 to {{email_body}}); CLI rows simply omit it
    custom_variables: { functional_role: r.title || "", ...(r.email_body ? { email_body: r.email_body } : {}) },
  }));
  const added = await plusvibe.addLeads(ctx, ws, campaignId, leads);
  ctx.log(`✓ Added ${leads.length} verified leads. ${JSON.stringify(added).slice(0, 160)}`);

  return { campaignId, name, added: leads.length, refused };
}
