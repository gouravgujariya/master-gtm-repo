// Postgres schema (Drizzle). Team-only app: no RLS, no client logins.
// Generate SQL: DATABASE_URL=... npx drizzle-kit generate   Apply: npm run db:migrate
import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, jsonb, integer, boolean, bigserial, customType,
  index, unique, primaryKey, check,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passHash: text("pass_hash").notNull(),
  role: text("role").notNull().default("operator"),
  disabledAt: ts("disabled_at"),
  createdAt: createdAt(),
}, (t) => [check("users_role_check", sql`${t.role} in ('admin','operator')`)]);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_id_idx").on(t.userId)]);

export const clients = pgTable("clients", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  website: text("website"),
  stage: text("stage"),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
});

export const clientProfiles = pgTable("client_profiles", {
  clientId: uuid("client_id").primaryKey().references(() => clients.id, { onDelete: "cascade" }),
  icp: jsonb("icp"),
  offer: jsonb("offer"),
  personalization: jsonb("personalization"),
  infrastructureStatus: jsonb("infrastructure_status"),
  stack: jsonb("stack"),
  contextMd: text("context_md"),
  angles: jsonb("angles"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const clientSecrets = pgTable("client_secrets", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ciphertext: bytea("ciphertext").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [unique("client_secrets_client_name_uq").on(t.clientId, t.name)]);

export const files = pgTable("files", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime"),
  size: integer("size"),
  contentText: text("content_text"),
  storagePath: text("storage_path"),
  createdAt: createdAt(),
}, (t) => [
  check("files_kind_check", sql`${t.kind} in ('questionnaire','transcript','upload','research','other')`),
  index("files_client_id_idx").on(t.clientId),
]);

export const campaigns = pgTable("campaigns", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  angle: text("angle"),
  persona: text("persona"),
  segment: text("segment"),
  targetMarket: text("target_market"),
  sendingProvider: text("sending_provider"),
  targeting: jsonb("targeting"), // source/find inputs edited in the UI (dataset, filters, titles, seeds)
  sequence: jsonb("sequence"),
  externalCampaignId: text("external_campaign_id"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
}, (t) => [index("campaigns_client_id_idx").on(t.clientId)]);

export const companies = pgTable("companies", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  segment: text("segment"),
  targetMarket: text("target_market"),
  listSource: text("list_source"),
  companyName: text("company_name"),
  domain: text("domain").notNull(),
  industry: text("industry"),
  companySize: text("company_size"),
  location: text("location"),
  linkedinUrl: text("linkedin_url"),
  phone: text("phone"),
  raw: jsonb("raw"),
  createdAt: createdAt(),
}, (t) => [
  unique("companies_client_domain_uq").on(t.clientId, t.domain),
  index("companies_campaign_id_idx").on(t.campaignId),
]);

export const contacts = pgTable("contacts", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  email: text("email").notNull(), // always stored lowercased
  firstName: text("first_name"),
  lastName: text("last_name"),
  companyName: text("company_name"),
  companyDomain: text("company_domain"),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  findSource: text("find_source"),
  emailStatus: text("email_status"),
  sendable: boolean("sendable").notNull().default(false),
  verifyNote: text("verify_note"),
  raw: jsonb("raw"),
  createdAt: createdAt(),
}, (t) => [
  unique("contacts_client_email_uq").on(t.clientId, t.email),
  check("contacts_email_lower_check", sql`${t.email} = lower(${t.email})`),
  index("contacts_company_id_idx").on(t.companyId),
]);

export const emailVerifications = pgTable("email_verifications", {
  id: id(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  verdict: text("verdict"),
  raw: jsonb("raw"),
  checkedAt: ts("checked_at").notNull().defaultNow(),
}, (t) => [index("email_verifications_contact_id_idx").on(t.contactId)]);

export const campaignLeads = pgTable("campaign_leads", {
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("selected"),
  personalization: jsonb("personalization"),
  externalLeadId: text("external_lead_id"),
  uploadedAt: ts("uploaded_at"),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.campaignId, t.contactId] }),
  check("campaign_leads_status_check", sql`${t.status} in ('selected','excluded','uploaded','failed')`),
  index("campaign_leads_contact_id_idx").on(t.contactId),
]);

export const jobs = pgTable("jobs", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("queued"),
  input: jsonb("input"),
  result: jsonb("result"),
  log: text("log").notNull().default(""),
  attempts: integer("attempts").notNull().default(0),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  heartbeatAt: ts("heartbeat_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  createdAt: createdAt(),
}, (t) => [
  check("jobs_status_check", sql`${t.status} in ('queued','running','done','error','cancelled')`),
  index("jobs_client_id_idx").on(t.clientId),
  index("jobs_queued_idx").on(t.createdAt).where(sql`${t.status} = 'queued'`),
]);

export const approvals = pgTable("approvals", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  stage: text("stage").notNull(),
  decision: text("decision").notNull(),
  snapshot: jsonb("snapshot"),
  note: text("note"),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: ts("decided_at").notNull().defaultNow(),
}, (t) => [
  check("approvals_stage_check", sql`${t.stage} in ('icp','competitors','strategy','companies','contacts','copy','send')`),
  check("approvals_decision_check", sql`${t.decision} in ('approved','rejected','revoked')`),
  index("approvals_client_id_idx").on(t.clientId, t.stage),
]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  clientId: uuid("client_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  data: jsonb("data"),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("audit_log_client_id_idx").on(t.clientId, t.at)]);
