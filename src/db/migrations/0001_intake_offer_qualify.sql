ALTER TABLE "approvals" DROP CONSTRAINT "approvals_stage_check";--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "offer" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "qualified" boolean;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "qualify_reason" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_stage_check" CHECK ("approvals"."stage" in ('intake','icp','competitors','strategy','offer','companies','qualified','contacts','copy','send'));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_kind_check" CHECK ("files"."kind" in ('questionnaire','transcript','case_study','dnc','upload','research','other'));--> statement-breakpoint
-- Backfill: work already past the new gates stays unblocked (one 'approved' row per new stage, noted).
INSERT INTO "approvals" ("client_id", "campaign_id", "stage", "decision", "note")
  SELECT DISTINCT "client_id", NULL::uuid, 'intake', 'approved', 'backfilled: client predates the intake gate'
  FROM "approvals" WHERE "stage" = 'icp' AND "decision" = 'approved';--> statement-breakpoint
INSERT INTO "approvals" ("client_id", "campaign_id", "stage", "decision", "note")
  SELECT DISTINCT "client_id", "campaign_id", 'offer', 'approved', 'backfilled: campaign predates the offer gate'
  FROM "approvals" WHERE "stage" = 'strategy' AND "decision" = 'approved' AND "campaign_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "approvals" ("client_id", "campaign_id", "stage", "decision", "note")
  SELECT DISTINCT "client_id", "campaign_id", 'qualified', 'approved', 'backfilled: campaign predates the qualify gate'
  FROM "approvals" WHERE "stage" = 'companies' AND "decision" = 'approved' AND "campaign_id" IS NOT NULL;--> statement-breakpoint
UPDATE "companies" SET "qualified" = true, "qualify_reason" = 'backfilled: sourced before qualification existed'
  WHERE "campaign_id" IN (SELECT "campaign_id" FROM "approvals" WHERE "stage" = 'companies' AND "decision" = 'approved');
