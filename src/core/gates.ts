// Approval gates: the strategy's "confirm at every stage" rule, enforced by the backend.
// Pure (no DB) so API and worker share it and tests need nothing. Callers pass the approvals
// for the client (campaignId null) plus the ones for the job's campaign.

export const STAGES = ["icp", "competitors", "strategy", "companies", "contacts", "copy", "send"] as const;
export type Stage = (typeof STAGES)[number];

export const JOB_TYPES = ["research", "competitors", "segments", "source", "find", "verify", "copy", "draft"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Stages that must be approved before a job of this type may run. */
export const REQUIRES: Record<JobType, Stage[]> = {
  research: [],
  competitors: ["icp"],
  segments: ["icp", "competitors"],
  source: ["strategy"], // never source before the angle is approved
  find: ["companies"],
  verify: ["contacts"],
  copy: ["contacts"],
  draft: ["copy", "send"],
};

/** The stage a job's output is approved under (verify/draft feed none). */
export const PRODUCES: Partial<Record<JobType, Stage>> = {
  research: "icp",
  competitors: "competitors",
  segments: "strategy",
  source: "companies",
  find: "contacts",
  copy: "copy",
};

/** Client-level stages are approved once per client; the rest per campaign. */
export const CLIENT_STAGES: Stage[] = ["icp", "competitors"];

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
