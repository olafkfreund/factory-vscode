import { EventEmitter } from "node:events";
import type { Anomaly, FeedMessage, LiveProgress, WorkItem } from "../cfactory/types";
import { classifyStatus } from "../status";

/**
 * Single source of truth for pipeline state, keyed by correlation key.
 *
 * A REST snapshot hydrates it; live `/api/ws` frames keep it current. Views
 * (tree, status bar, cockpit, notifications) subscribe to the "change" event.
 * Intentionally free of any `vscode` dependency so it is unit-testable.
 */
export class StateStore extends EventEmitter {
  private items = new Map<string, WorkItem>();
  private progressByKey = new Map<string, LiveProgress>();
  private anomalyList: Anomaly[] = [];

  /** Replace the entire work-item set (REST snapshot). */
  hydrate(items: WorkItem[]): void {
    this.items = new Map(items.map((i) => [i.correlation_key, i]));
    // Drop progress for keys that no longer exist.
    for (const key of [...this.progressByKey.keys()]) {
      if (!this.items.has(key)) {
        this.progressByKey.delete(key);
      }
    }
    this.emitChange();
  }

  /** Insert or update one work item. */
  upsert(item: WorkItem): void {
    this.items.set(item.correlation_key, item);
    this.emitChange();
  }

  /** Record the latest live progress for a work item. */
  applyProgress(p: LiveProgress): void {
    this.progressByKey.set(p.correlation_key, p);
    this.emitChange();
  }

  /** Apply a live feed frame from /api/ws. */
  applyFeed(msg: FeedMessage): void {
    switch (msg.type) {
      case "snapshot":
        this.hydrate(msg.items);
        break;
      case "workitem":
        this.upsert(msg.item);
        break;
      case "progress":
        this.applyProgress(msg.item);
        break;
    }
  }

  setAnomalies(anomalies: Anomaly[]): void {
    this.anomalyList = anomalies;
    this.emitChange();
  }

  clear(): void {
    this.items.clear();
    this.progressByKey.clear();
    this.anomalyList = [];
    this.emitChange();
  }

  // --- Reads ---

  /** All work items, sorted by correlation key (numeric where possible). */
  getItems(): WorkItem[] {
    return [...this.items.values()].sort((a, b) =>
      compareKeys(a.correlation_key, b.correlation_key),
    );
  }

  get(correlationKey: string): WorkItem | undefined {
    return this.items.get(correlationKey);
  }

  getProgress(correlationKey: string): LiveProgress | undefined {
    return this.progressByKey.get(correlationKey);
  }

  getAnomalies(): Anomaly[] {
    return this.anomalyList;
  }

  /** Count of work items currently reporting live progress (in flight). */
  get runningCount(): number {
    return this.progressByKey.size;
  }

  get anomalyCount(): number {
    return this.anomalyList.length;
  }

  /** Work items with any stage awaiting review. */
  get reviewCount(): number {
    let n = 0;
    for (const item of this.items.values()) {
      if (
        classifyStatus(item.pfactory.status) === "review" ||
        classifyStatus(item.aifactory.status) === "review" ||
        classifyStatus(item.tfactory.status) === "review"
      ) {
        n++;
      }
    }
    return n;
  }

  /** Total items needing a human: anomalies plus awaiting-review work items. */
  get attentionCount(): number {
    return this.anomalyCount + this.reviewCount;
  }

  get size(): number {
    return this.items.size;
  }

  private emitChange(): void {
    this.emit("change");
  }
}

/** Sort GitHub-issue-number keys numerically, synthetic keys lexically. */
function compareKeys(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return na - nb;
  }
  return a.localeCompare(b);
}
