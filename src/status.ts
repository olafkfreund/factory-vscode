import type { WorkItem } from "./cfactory/types";

/** Normalised status categories used for icons, colours, and counts. */
export type StatusCategory = "running" | "done" | "failed" | "review" | "pending";

/**
 * Map a per-service status string (vocabulary varies per factory) to a
 * category. Substring matching keeps this robust to new status names.
 * Pure (no vscode) so it is unit-testable.
 */
export function classifyStatus(status: string | null | undefined): StatusCategory {
  if (!status) {
    return "pending";
  }
  const s = status.toLowerCase();
  if (/(fail|reject|error|block|stuck|cancel)/.test(s)) {
    return "failed";
  }
  if (/review/.test(s)) {
    return "review";
  }
  if (/(done|complete|merged|emitted|triaged|pass|success|verified)/.test(s)) {
    return "done";
  }
  // A present, non-terminal status means work is in flight.
  return "running";
}

/**
 * Whether a service status represents an in-flight task (not idle/terminal).
 * Centralised here so every host module agrees on the vocabulary.
 */
export function isActiveStatus(status: string | null | undefined): boolean {
  return status != null && !/^(idle|not_started|done|complete|skipped)$/i.test(status);
}

/** Whether a status indicates the agent is waiting on a human (review/approval). */
export function isReviewStatus(status: string | null | undefined): boolean {
  return status != null && /review|approval|awaiting|human/i.test(status);
}

/** Whether a status specifically requests plan approval. */
export function needsPlanApproval(status: string | null | undefined): boolean {
  return status != null && /plan.*approval|awaiting.*plan|plan_approval/i.test(status);
}

export type Stage = "Plan" | "Code" | "Test";

/** The factory backing each PARR stage. */
export const STAGE_SERVICE: Record<Stage, keyof Pick<WorkItem, "pfactory" | "aifactory" | "tfactory">> = {
  Plan: "pfactory",
  Code: "aifactory",
  Test: "tfactory",
};

export const STAGES: Stage[] = ["Plan", "Code", "Test"];

/** The coarse stage currently doing something, for the work-item summary. */
export function activeStage(item: WorkItem): Stage | "Pending" {
  if (item.tfactory.status && classifyStatus(item.tfactory.status) === "running") {
    return "Test";
  }
  if (item.aifactory.status && classifyStatus(item.aifactory.status) === "running") {
    return "Code";
  }
  if (item.pfactory.status && classifyStatus(item.pfactory.status) === "running") {
    return "Plan";
  }
  // Otherwise report the furthest stage that has any status.
  if (item.tfactory.status) {
    return "Test";
  }
  if (item.aifactory.status) {
    return "Code";
  }
  if (item.pfactory.status) {
    return "Plan";
  }
  return "Pending";
}
