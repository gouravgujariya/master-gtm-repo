// /api/clients — list, create (from website or name), detail, profile edit, new campaign.
import { Hono } from "hono";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { approvals, campaigns, clientProfiles, clients, files, jobs } from "../db/schema.ts";
import { laterStages } from "../core/gates.ts";
import { body, need, uuidParam, type Env } from "./auth.ts";
import { lookupSite } from "./lookup.ts";
import { revokeApproved } from "./approvals.ts";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "client";

const NewClient = z.object({
  website: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  questionnaire: z.string().max(200000).optional(),
}).refine((b) => b.website || b.name, "website or name is required");

const Profile = z.object({ icp: z.unknown().optional(), angles: z.unknown().optional(), contextMd: z.string().optional() });
const NewCampaign = z.object({ name: z.string().min(1).max(200), angle: z.string().min(1), persona: z.string().optional(), segment: z.string().optional(), targeting: z.record(z.string(), z.unknown()).optional() });

async function getClient(id: string) {
  const [c] = await db.select().from(clients).where(eq(clients.id, id));
  return need(c, "Client");
}

export const clientRoutes = new Hono<Env>()
  .get("/", async (c) => {
    const cs = await db.select().from(clients).where(isNull(clients.archivedAt)).orderBy(clients.name);
    const camps = cs.length ? await db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, clientId: campaigns.clientId })
      .from(campaigns).where(inArray(campaigns.clientId, cs.map((x) => x.id))).orderBy(campaigns.createdAt) : [];
    return c.json(cs.map((x) => ({
      id: x.id, name: x.name, website: x.website,
      campaigns: camps.filter((k) => k.clientId === x.id).map(({ clientId, ...k }) => k),
    })));
  })
  .post("/", async (c) => {
    const b = await body(c, NewClient);
    const site = b.website ? await lookupSite(b.website) : null; // 422 on a bad site
    const name = b.name ?? site!.name;
    let slug = slugify(name);
    const [taken] = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, slug));
    if (taken) slug += "-" + randomBytes(2).toString("hex");
    const client = await db.transaction(async (tx) => {
      const [cl] = await tx.insert(clients).values({ slug, name, website: site ? `https://${site.domain}` : null, stage: "inputs" }).returning();
      await tx.insert(clientProfiles).values({ clientId: cl.id, contextMd: b.description ?? site?.description ?? null });
      if (b.questionnaire) await tx.insert(files).values({
        clientId: cl.id, kind: "questionnaire", filename: "questionnaire.md", mime: "text/markdown",
        size: Buffer.byteLength(b.questionnaire), contentText: b.questionnaire,
      });
      return cl;
    });
    return c.json(client, 201);
  })
  .get("/:id", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const [[profile], appr, camps, latest] = await Promise.all([
      db.select().from(clientProfiles).where(eq(clientProfiles.clientId, client.id)),
      db.select().from(approvals).where(eq(approvals.clientId, client.id)).orderBy(approvals.decidedAt),
      db.select().from(campaigns).where(eq(campaigns.clientId, client.id)).orderBy(campaigns.createdAt),
      db.selectDistinctOn([jobs.type]).from(jobs).where(eq(jobs.clientId, client.id)).orderBy(jobs.type, desc(jobs.createdAt)),
    ]);
    return c.json({ client, profile: profile ?? null, approvals: appr, campaigns: camps, latestJobs: Object.fromEntries(latest.map((j) => [j.type, j])) });
  })
  .patch("/:id/profile", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const b = await body(c, Profile);
    const set = { ...b, updatedAt: new Date() };
    const profile = await db.transaction(async (tx) => {
      const [p] = await tx.insert(clientProfiles).values({ clientId: client.id, ...set })
        .onConflictDoUpdate({ target: clientProfiles.clientId, set }).returning();
      await revokeApproved(tx, client.id, ["icp", ...laterStages("icp")], c.get("user").id); // edited → re-approve
      return p;
    });
    return c.json(profile);
  })
  .post("/:id/campaigns", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const b = await body(c, NewCampaign);
    const [camp] = await db.insert(campaigns).values({ clientId: client.id, ...b }).returning();
    return c.json(camp, 201);
  });
