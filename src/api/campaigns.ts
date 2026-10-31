// /api/campaigns — detail, edit, lead edits, and the send-approval + draft enqueue.
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { approvals, campaignLeads, campaigns, companies, contacts, jobs } from "../db/schema.ts";
import { missingApproval } from "../core/gates.ts";
import { body, need, uuidParam, type Env } from "./auth.ts";
import { gateApprovals } from "./approvals.ts";

const Edit = z.object({ name: z.string().min(1).max(200).optional(), sequence: z.unknown().optional() });
const LeadEdit = z.object({ personalization: z.unknown().optional(), status: z.enum(["selected", "excluded"]).optional() });

async function getCampaign(id: string) {
  const [k] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return need(k, "Campaign");
}

export const campaignRoutes = new Hono<Env>()
  .get("/:id", async (c) => {
    const campaign = await getCampaign(uuidParam(c, "id"));
    const [comps, leads] = await Promise.all([
      db.select().from(companies).where(eq(companies.campaignId, campaign.id)).orderBy(companies.createdAt),
      db.select({ contact: contacts, leadStatus: campaignLeads.status, personalization: campaignLeads.personalization })
        .from(campaignLeads).innerJoin(contacts, eq(contacts.id, campaignLeads.contactId))
        .where(eq(campaignLeads.campaignId, campaign.id)).orderBy(contacts.companyName, contacts.email),
    ]);
    const jl = await db.select().from(jobs).where(eq(jobs.campaignId, campaign.id)).orderBy(jobs.createdAt);
    const latestJobs = Object.fromEntries(jl.map((j) => [j.type, j])); // later rows overwrite → latest per type
    return c.json({ campaign, latestJobs, companies: comps, contacts: leads.map((l) => ({ ...l.contact, leadStatus: l.leadStatus, personalization: l.personalization })) });
  })
  .patch("/:id", async (c) => {
    const id = uuidParam(c, "id");
    await getCampaign(id);
    const b = await body(c, Edit);
    if (!Object.keys(b).length) return c.json(await getCampaign(id));
    const [k] = await db.update(campaigns).set(b).where(eq(campaigns.id, id)).returning();
    return c.json(k);
  })
  .patch("/:id/leads/:contactId", async (c) => {
    const id = uuidParam(c, "id"), contactId = uuidParam(c, "contactId");
    const b = await body(c, LeadEdit);
    const where = and(eq(campaignLeads.campaignId, id), eq(campaignLeads.contactId, contactId));
    const [lead] = Object.keys(b).length
      ? await db.update(campaignLeads).set(b).where(where).returning()
      : await db.select().from(campaignLeads).where(where);
    return c.json(need(lead, "Lead"));
  })
  .post("/:id/draft", async (c) => {
    const campaign = await getCampaign(uuidParam(c, "id"));
    const user = c.get("user").id;
    const res = await db.transaction(async (tx) => {
      const appr = await gateApprovals(tx, campaign.clientId, campaign.id);
      const needs = missingApproval("draft", [...appr, { stage: "send", decision: "approved", decidedAt: new Date() }]);
      if (needs) return { needs };
      await tx.insert(approvals).values({ clientId: campaign.clientId, campaignId: campaign.id, stage: "send", decision: "approved", decidedBy: user });
      const [j] = await tx.insert(jobs).values({ clientId: campaign.clientId, campaignId: campaign.id, type: "draft", input: {}, createdBy: user }).returning({ id: jobs.id });
      return { jobId: j.id };
    });
    if ("needs" in res) return c.json({ error: { code: "GATE", message: `Approve ${res.needs} first`, needs: res.needs } }, 409);
    return c.json({ jobId: res.jobId }, 202);
  });
