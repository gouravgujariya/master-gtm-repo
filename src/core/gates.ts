// Approval gates: the strategy's "confirm at every stage" rule, enforced by the backend.
// Pure (no DB) so API and worker share it and tests need nothing. Callers pass the approvals
// for the client (campaignId null) plus the ones for the job's campaign.

// Order = the video's workflow: Strategy (intake → … → offer) · Data (companies → qualified → contacts → copy) · Launch (send).
export const STAGES = ["intake", "icp", "competitors", "strategy", "offer", "companies", "qualified", "contacts", "copy", "send"] as const;
export type Stage = (typeof STAGES)[number];

export const JOB_TYPES = ["research", "competitors", "segments", "offer", "source", "qualify", "find", "verify", "copy", "draft"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Stages that must be approved before a job of this type may run. */
export const REQUIRES: Record<JobType, Stage[]> = {
  research: ["intake"], // no research before the client's inputs (offer + case studies) are in
  competitors: ["icp"],
  segments: ["icp", "competitors"],
  offer: ["strategy"],
  source: ["strategy", "offer"], // never source before the angle and its offer are approved
  qualify: ["companies"],
  find: ["qualified"], // qualify first, then find contacts (only at qualified companies)
  verify: ["contacts"],
  copy: ["contacts", "offer"],
  draft: ["copy", "send"],
};

/** The stage a job's output is approved under (verify/draft feed none; intake is approved from the inputs). */
export const PRODUCES: Partial<Record<JobType, Stage>> = {
  research: "icp",
  competitors: "competitors",
  segments: "strategy",
  offer: "offer",
  source: "companies",
  qualify: "qualified",
  find: "contacts",
  copy: "copy",
};

/** Client-level stages are approved once per client; the rest per campaign. */
export const CLIENT_STAGES: Stage[] = ["intake", "icp", "competitors"];

export interface ApprovalRow { stage: string; decision: string; decidedAt: Date | string }

/** True if the latest decision for `stage` is "approved" (a later revoke/reject wins). */
export function isApproved(stage: Stage, approvals: ApprovalRow[]): boolean {
  let last: ApprovalRow | undefined;
  for (const a of approvals) {
    if (a.stage === stage && (!last || new Date(a.decidedAt) >= new Date(last.decidedAt))) last = a;
  }
  return last?.decision === "approved";
}

/** First required stage that is not approved, or null when the job may run. */
export function missingApproval(type: JobType, approvals: ApprovalRow[]): Stage | null {
  return REQUIRES[type].find((s) => !isApproved(s, approvals)) ?? null;
}

/** Stages after `stage` — revoke these when an upstream stage is re-run or edited. */
export function laterStages(stage: Stage): Stage[] {
  return STAGES.slice(STAGES.indexOf(stage) + 1);
}
