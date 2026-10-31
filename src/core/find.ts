// Contact-find waterfall. Order is FIXED: AgenticData (primary) → AI Ark → ColdIQ (last resort).
// Stops at the first provider that returns a contact with an email; the row carries `find_source`.
import type { Ctx } from "./ctx.ts";
import * as agenticdata from "../providers/agenticdata.ts";
import * as aiArk from "../providers/ai-ark.ts";
import * as coldiq from "../providers/coldiq.ts";

export interface FindRequest {
  domain: string;
  title?: string;            // AgenticData persona filter (pinned target title)
  seniority?: string[];      // AI Ark seniority filter (default: founder, owner, c-suite — same as --find-batch)
  company_name?: string;
  // ColdIQ needs a known person: LinkedIn URL, else full name + domain. Skipped when neither is given.
  linkedin_url?: string;
  first_name?: string;
  last_name?: string;
}

export async function findContact(ctx: Ctx, req: FindRequest): Promise<Record<string, string> | null> {
  const domain = agenticdata.clean(req.domain);
  const steps: [string, () => Promise<Record<string, string> | null>][] = [
    ["agenticdata", () => agenticdata.pickForCompany(ctx, domain, req.title)],
    ["ai-ark", () => aiArk.findForCompany(ctx, domain, req.seniority ?? ["founder", "owner", "c-suite"], req.company_name || "")],
    ["coldiq", async () => {
      const fullName = `${req.first_name || ""} ${req.last_name || ""}`.trim();
      if (!req.linkedin_url && !fullName) return null;
      const email = req.linkedin_url ? await coldiq.findWorkEmail(ctx, req.linkedin_url) : await coldiq.findWorkEmailByName(ctx, fullName, domain);
      return email ? {
        email: String(email).toLowerCase(), first_name: req.first_name || "", last_name: req.last_name || "",
        company_name: req.company_name || "", company_domain: domain, title: req.title || "",
        linkedin_url: req.linkedin_url || "", find_source: "coldiq",
      } : null;
    }],
  ];
  for (const [name, step] of steps) {
    try {
      const hit = await step();
      if (hit) { hit.company_name ||= req.company_name || ""; return hit; }
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      // ponytail: any provider error (incl. missing key) just falls through to the next provider.
      ctx.log(`  - ${domain}: ${name} failed: ${String((e as Error).message).slice(0, 70)}`);
    }
  }
  return null;
}
