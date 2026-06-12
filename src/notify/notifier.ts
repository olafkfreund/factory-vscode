import * as vscode from "vscode";
import type { StateStore } from "../state/store";
import { readConfig, type NotificationLevel } from "../config";
import { diffWorkItems, diffAnomalies, snapshotOf, anomalySignature, type PipelineEvent, type SnapshotEntry } from "./events";

const IMPORTANT_KINDS = new Set<PipelineEvent["kind"]>(["failed", "review", "anomaly"]);

/**
 * Raises editor notifications from store transitions. Seeds baseline state on
 * the first change so connecting to a populated pipeline does not spam, then
 * notifies on subsequent transitions, filtered by `factory.notifications.level`.
 */
export class Notifier implements vscode.Disposable {
  private prev = new Map<string, SnapshotEntry>();
  private firedAnomalies = new Set<string>();
  private seeded = false;
  private readonly listener: () => void;

  /**
   * @param isMuted optional predicate; when it returns true for a correlation
   *   key, that work item raises no notifications (per-item mute).
   */
  constructor(
    private readonly store: StateStore,
    private readonly isMuted: (key: string) => boolean = () => false,
  ) {
    this.listener = () => this.onChange();
    this.store.on("change", this.listener);
  }

  private onChange(): void {
    const items = this.store.getItems();
    const anomalies = this.store.getAnomalies();

    if (!this.seeded) {
      // Record baseline without notifying.
      this.prev = snapshotOf(items);
      for (const a of anomalies) {
        this.firedAnomalies.add(anomalySignature(a));
      }
      this.seeded = true;
      return;
    }

    const events = [...diffWorkItems(this.prev, items), ...diffAnomalies(this.firedAnomalies, anomalies)];
    this.prev = snapshotOf(items);

    const level = readConfig().notificationLevel;
    for (const e of events) {
      this.show(e, level);
    }
  }

  private show(e: PipelineEvent, level: NotificationLevel): void {
    if (level === "off") {
      return;
    }
    if (level === "important" && !IMPORTANT_KINDS.has(e.kind)) {
      return;
    }
    // Globally muted event kinds, and per-item muted work items, stay silent.
    if (readConfig().mutedKinds.includes(e.kind)) {
      return;
    }
    if (this.isMuted(e.key)) {
      return;
    }

    const label = `#${e.key}${e.title ? ` ${e.title}` : ""}`;
    const stage = e.stage ? ` (${e.stage})` : "";

    const handle = (pick: string | undefined) => {
      if (pick === "Review Now") {
        void vscode.commands.executeCommand("factory.reviewTask", e.key);
      } else if (pick === "Open Console") {
        void vscode.commands.executeCommand("factory.openConsole", e.key);
      } else if (pick === "View on GitHub") {
        void vscode.commands.executeCommand("factory.openWorkItemOnGitHub", e.key);
      } else if (pick === "Stop Agent") {
        void vscode.commands.executeCommand("factory.stopTask", e.key);
      }
    };

    switch (e.kind) {
      case "failed":
        void vscode.window.showWarningMessage(`Factory: ${label}${stage} failed`, "Open Console", "Stop Agent", "View on GitHub").then(handle);
        break;
      case "anomaly":
        void vscode.window.showWarningMessage(`Factory: ${label} ${e.detail ?? "anomaly"}`, "Open Console", "Stop Agent", "View on GitHub").then(handle);
        break;
      case "review":
        void vscode.window.showWarningMessage(`Factory: ${label}${stage} awaiting review`, "Review Now", "Open Console").then(handle);
        break;
      case "complete":
        void vscode.window.showInformationMessage(`Factory: ${label}${stage} complete`, "Open Console", "View on GitHub").then(handle);
        break;
      case "new":
        void vscode.window.showInformationMessage(`Factory: ${label} started`);
        break;
    }
  }

  dispose(): void {
    this.store.off("change", this.listener);
  }
}
