/**
 * plusvibe-upload.ts — create a DRAFT campaign in Plusvibe: sequence + schedule + verified leads.
 * Never activates — leaves the campaign inactive for a human to review and Start.
 *
 *   npm run plusvibe-upload -- --leads=verified.csv --sequence=sequence.json \
 *     [--name="Campaign"] [--workspace=<id>] [--max=10] [--all] [--no-accounts]
 *
 * API: base https://api.plusvibe.ai/api/v1, header x-api-key, workspace-scoped.
 * Flow: GET /authenticate → POST /campaign/add/campaign → GET /account/list →
 *       PATCH /campaign/update/campaign (sequences+schedule+accounts) → POST /lead/add.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireKey, args, parseCsv } from "../lib/env.ts";

const BASE = "https://api.plusvibe.ai/api/v1";
const KEY = requireKey("PLUSVIBE_API_KEY");

async function pv(path: string, method = "GET", body?: any): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Plusvibe ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function main() {
  const a = args();
  const leadsPath = resolve((a.leads as string) || "");
  const seqPath = resolve((a.sequence as string) || "");
  if (!a.leads || !a.sequence) { console.error("--leads=verified.csv --sequence=sequence.json required"); process.exit(1); }
  const seq = JSON.parse(readFileSync(seqPath, "utf8"));
  const max = Number(a.max || 10);

  // 1) workspace
  const auth = await pv("/authenticate");
  const ws = (a.workspace as string) || auth.workspaces?.[0]?._id;
  if (!ws) throw new Error("No workspace found for this API key.");
  console.log(`✓ Workspace: ${auth.workspaces?.[0]?.name} (${ws}) · account ${auth.account}`);

  // 2) create campaign (draft) — or reuse an existing one via --campaign-id
  const name = (a.name as string) || seq.campaign_name || "GTM Draft Campaign";
  let campaignId = (a["campaign-id"] as string) || "";
  if (campaignId) {
    console.log(`✓ Reusing existing campaign ${campaignId}`);
  } else {
    const created = await pv("/campaign/add/campaign", "POST", { workspace_id: ws, camp_name: name });
    campaignId = created.id || created.campaign_id || created._id;
    if (!campaignId) throw new Error(`No campaign id returned: ${JSON.stringify(created).slice(0, 200)}`);
    console.log(`✓ Created draft campaign "${name}" (${campaignId})`);
  }

  // 3) email accounts (optional — attach warmed inboxes if any)
  let emailAccounts: string[] = [];
  if (!a["no-accounts"]) {
    try {
      const accts = await pv(`/account/list?workspace_id=${ws}`);
      const list = accts.data || accts.accounts || accts || [];
      emailAccounts = (Array.isArray(list) ? list : []).map((x: any) => x._id || x.id).filter(Boolean).slice(0, 25);
      console.log(`✓ Found ${emailAccounts.length} email account(s) in workspace.`);
    } catch (e: any) { console.log(`  (could not list email accounts: ${e.message.slice(0, 60)})`); }
  }

  // 4) update campaign with sequence + schedule (stays draft — no status set)
  const upd: any = {
    workspace_id: ws, campaign_id: campaignId,
    schedules: [seq.schedule],          // API expects an array of schedule objects
    sequences: seq.sequences,
    first_wait_time: 0,                  // required by the API
    first_wait_time_unit: "days",
    stop_on_lead_replied: "yes",
    is_unsubscribed_link: "no",
  };
  if (emailAccounts.length) upd.email_accounts = emailAccounts;
  await pv("/campaign/update/campaign", "PATCH", upd);
  console.log(`✓ Set ${seq.sequences.length}-step sequence + schedule${emailAccounts.length ? " + inboxes" : ""}.`);

  // 5) add verified leads
  const rows = parseCsv(readFileSync(leadsPath, "utf8"));
  let usable = a.all ? rows : rows.filter((r) => (r.sendable || "").toLowerCase() === "yes");
  usable = usable.filter((r) => r.email).slice(0, max);
  const leads = usable.map((r) => ({
    email: r.email, first_name: r.first_name || "", last_name: r.last_name || "",
    company_name: r.company_name || "", company_website: r.company_domain || "",
    linkedin_person_url: r.linkedin_url || "",
    custom_variables: { functional_role: r.title || "" },
  }));
  if (!leads.length) { console.error("No sendable leads to add."); process.exit(1); }
  const added = await pv("/lead/add", "POST", { workspace_id: ws, campaign_id: campaignId, leads, skip_if_in_workspace: true });
  console.log(`✓ Added ${leads.length} verified leads. ${JSON.stringify(added).slice(0, 160)}`);

  console.log(`\n🎯 DRAFT ready (NOT sending — review + Start manually):`);
  console.log(`   Campaign: ${name}`);
  console.log(`   Open Plusvibe → Campaigns: https://app.plusvibe.ai/v2/campaign/${campaignId}`);
  console.log(`   (or app.plusvibe.ai → workspace "A for Analytics" → Campaigns)`);
}

main().catch((e) => { console.error("\n❌ " + (e?.message || e)); process.exit(1); });
