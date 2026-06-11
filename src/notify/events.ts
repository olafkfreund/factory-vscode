import type { Anomaly, WorkItem } from "../cfactory/types";
import { classifyStatus, STAGES, STAGE_SERVICE, type Stage, type StatusCategory } from "../status";

export type EventKind = "new" | "complete" | "failed" | "review" | "anomaly";

export interface PipelineEvent {
  kind: EventKind;
  key: string;
  title: string | null;
  stage?: Stage;
  detail?: string;
}

/** Per-stage status categories for one work item, used to detect transitions. */
export interface SnapshotEntry {
  Plan: StatusCategory;
  Code: StatusCategory;
  Test: StatusCategory;
}

export function snapshotOf(items: WorkItem[]): Map<string, SnapshotEntry> {
  const map = new Map<string, SnapshotEntry>();
  for (const item of items) {
    map.set(item.correlation_key, entryOf(item));
  }
  return map;
}

function entryOf(item: WorkItem): SnapshotEntry {
  return {
    Plan: classifyStatus(item[STAGE_SERVICE.Plan].status),
    Code: classifyStatus(item[STAGE_SERVICE.Code].status),
    Test: classifyStatus(item[STAGE_SERVICE.Test].status),
  };
}

/**
 * Compare the previous snapshot to the current items and emit events for new
 * work items and per-stage category transitions. Emitting only on change gives
 * inherent dedup: an unchanged state never refires.
 */
export function diffWorkItems(prev: Map<string, SnapshotEntry>, items: WorkItem[]): PipelineEvent[] {
  const events: PipelineEvent[] = [];
  for (const item of items) {
    const key = item.correlation_key;
    const before = prev.get(key);
    if (!before) {
      events.push({ kind: "new", key, title: item.title });
      continue;
    }
    const now = entryOf(item);
    for (const stage of STAGES) {
      const from = before[stage];
      const to = now[stage];
      if (from === to) {
        continue;
      }
      if (to === "failed") {
        events.push({ kind: "failed", key, title: item.title, stage });
      } else if (to === "review") {
        events.push({ kind: "review", key, title: item.title, stage });
      } else if (to === "done" && from !== "done") {
        events.push({ kind: "complete", key, title: item.title, stage });
      }
    }
  }
  return events;
}

/** Signature used to dedup an anomaly notification. */
export function anomalySignature(a: Anomaly): string {
  return `${a.kind}:${a.correlation_key}`;
}

/**
 * Emit events for anomalies not yet fired, adding their signatures to `fired`.
 * Mutates `fired` so repeated identical anomalies do not renotify.
 */
export function diffAnomalies(fired: Set<string>, anomalies: Anomaly[]): PipelineEvent[] {
  const events: PipelineEvent[] = [];
  for (const a of anomalies) {
    const sig = anomalySignature(a);
    if (fired.has(sig)) {
      continue;
    }
    fired.add(sig);
    events.push({ kind: "anomaly", key: a.correlation_key, title: a.title, detail: `${a.kind}: ${a.detail}` });
  }
  return events;
}
