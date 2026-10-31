// Plusvibe adapter. ALWAYS DRAFT: this module deliberately exposes NO start/activate/launch/resume call,
// and updateCampaign refuses a `status` field. A human hits Start in the Plusvibe UI.
// API: base https://api.plusvibe.ai/api/v1, header x-api-key, workspace-scoped.
import type { Ctx } from "../core/ctx.ts";
import { AppError, ProviderError } from "../core/errors.ts";

const BASE = "https://api.plusvibe.ai/api/v1";

async function pv(ctx: Ctx, path: string, method = "GET", body?: any): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": ctx.getKey("PLUSVIBE_API_KEY"), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: ctx.signal,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new ProviderError(`Plusvibe ${method} ${path}`, res.status, text);
  return json;
}

export const authenticate = (ctx: Ctx) => pv(ctx, "/authenticate");

/** Creates the campaign; Plusvibe leaves new campaigns inactive (draft). */
export const createCampaign = (ctx: Ctx, workspaceId: string, name: string) =>
  pv(ctx, "/campaign/add/campaign", "POST", { workspace_id: workspaceId, camp_name: name });

export const listAccounts = (ctx: Ctx, workspaceId: string) => pv(ctx, `/account/list?workspace_id=${workspaceId}`);

/** Sequence/schedule/inbox update. Never sets status — that would be the Start button. */
export function updateCampaign(ctx: Ctx, body: Record<string, unknown>) {
  if ("status" in body) throw new AppError(400, "DRAFT_ONLY", "Refusing to set campaign status — campaigns stay DRAFT; a human hits Start.");
  return pv(ctx, "/campaign/update/campaign", "PATCH", body);
}

export const addLeads = (ctx: Ctx, workspaceId: string, campaignId: string, leads: unknown[]) =>
  pv(ctx, "/lead/add", "POST", { workspace_id: workspaceId, campaign_id: campaignId, leads, skip_if_in_workspace: true });
