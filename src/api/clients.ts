// /api/clients — list, create (from website or name), detail, profile edit, intake (inputs + offer facts), new campaign.
import { Hono } from "hono";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
const FILE_KINDS = ["questionnaire", "transcript", "case_study", "dnc", "other"] as const;
const NewFile = z.object({ kind: z.enum(FILE_KINDS), filename: z.string().min(1).max(200), contentText: z.string().min(1).max(200000) });
const Intake = z.object({ offer: z.string().max(5000).optional(), pricing: z.string().max(2000).optional(), bookingLink: z.string().max(500).optional(), senderNames: z.string().max(500).optional() });

/** What the intake gate checks (the video's rule: no offer or no case studies stops the build). */
export async function intakeStatus(clientId: string) {
  const [[p], fs] = await Promise.all([
    db.select({ offer: clientProfiles.offer }).from(clientProfiles).where(eq(clientProfiles.clientId, clientId)),
    db.select({ kind: files.kind }).from(files).where(eq(files.clientId, clientId)),
  ]);
  const o: any = p?.offer ?? {}, n = (k: string) => fs.filter((f) => f.kind === k).length;
  const status = {
    offer: !!o.offer?.trim(), caseStudies: n("case_study"), questionnaire: n("questionnaire"), transcripts: n("transcript"),
    dnc: n("dnc"), bookingLink: !!o.bookingLink?.trim(), senderNames: !!o.senderNames?.trim(),
  };
  const missing = [!status.offer && "offer & pricing", !status.caseStudies && "at least one case study"].filter(Boolean) as string[];
  return { ...status, missing };
}
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
    const [[profile], appr, camps, latest, fileList, intake] = await Promise.all([
      db.select().from(clientProfiles).where(eq(clientProfiles.clientId, client.id)),
      db.select().from(approvals).where(eq(approvals.clientId, client.id)).orderBy(approvals.decidedAt),
      db.select().from(campaigns).where(eq(campaigns.clientId, client.id)).orderBy(campaigns.createdAt),
      db.selectDistinctOn([jobs.type]).from(jobs).where(eq(jobs.clientId, client.id)).orderBy(jobs.type, desc(jobs.createdAt)),
      db.select({ id: files.id, kind: files.kind, filename: files.filename, size: files.size, createdAt: files.createdAt })
        .from(files).where(eq(files.clientId, client.id)).orderBy(files.createdAt),
      intakeStatus(client.id),
    ]);
    return c.json({ client, profile: profile ?? null, approvals: appr, campaigns: camps, latestJobs: Object.fromEntries(latest.map((j) => [j.type, j])), files: fileList, intake });
  })
  .patch("/:id/profile", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const b = await body(c, Profile);
    const set = { ...b, updatedAt: new Date() };
    // An ICP edit re-opens the ICP and everything after it. An angles-only edit (adding the client's own angle) revokes
    // nothing: each campaign already copied its segment + targeting when it was created, so running campaigns stay put.
    const touchesIcp = b.icp !== undefined || b.contextMd !== undefined;
    const profile = await db.transaction(async (tx) => {
      const [p] = await tx.insert(clientProfiles).values({ clientId: client.id, ...set })
        .onConflictDoUpdate({ target: clientProfiles.clientId, set }).returning();
      if (touchesIcp) await revokeApproved(tx, client.id, ["icp", ...laterStages("icp")], c.get("user").id); // edited → re-approve
      return p;
    });
    return c.json(profile);
  })
  .patch("/:id/intake", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const b = await body(c, Intake);
    const [p] = await db.select({ offer: clientProfiles.offer }).from(clientProfiles).where(eq(clientProfiles.clientId, client.id));
    const offer = { ...((p?.offer as object) ?? {}), ...b };
    await db.insert(clientProfiles).values({ clientId: client.id, offer })
      .onConflictDoUpdate({ target: clientProfiles.clientId, set: { offer, updatedAt: new Date() } });
    return c.json({ offer, intake: await intakeStatus(client.id) });
  })
  .post("/:id/files", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const b = await body(c, NewFile);
    const [f] = await db.insert(files).values({ clientId: client.id, kind: b.kind, filename: b.filename, mime: "text/plain", size: Buffer.byteLength(b.contentText), contentText: b.contentText })
      .returning({ id: files.id, kind: files.kind, filename: files.filename, size: files.size, createdAt: files.createdAt });
    return c.json({ file: f, intake: await intakeStatus(client.id) }, 201);
  })
  .get("/:id/files/:fileId", async (c) => {
    const [f] = await db.select().from(files).where(and(eq(files.id, uuidParam(c, "fileId")), eq(files.clientId, uuidParam(c, "id"))));
    const file = need(f, "File");
    let text = file.contentText;
    if (text == null && file.storagePath) text = await readFile(file.storagePath, "utf8").catch(() => null);
    return c.json({ ...file, contentText: text, storagePath: undefined });
  })
  .delete("/:id/files/:fileId", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const [f] = await db.delete(files).where(and(eq(files.id, uuidParam(c, "fileId")), eq(files.clientId, client.id))).returning({ id: files.id });
    need(f, "File");
    return c.json({ ok: true, intake: await intakeStatus(client.id) });
  })
  .post("/:id/campaigns", async (c) => {
    const client = await getClient(uuidParam(c, "id"));
    const b = await body(c, NewCampaign);
    const [camp] = await db.insert(campaigns).values({ clientId: client.id, ...b }).returning();
    return c.json(camp, 201);
  });
