import * as vscode from "vscode";
import type { StateStore } from "./state/store";
import type { Anomaly, ServiceState, WorkItem } from "./cfactory/types";
import { classifyStatus, activeStage, STAGES, STAGE_SERVICE, type StatusCategory, type Stage } from "./status";

export type FactoryNode = WorkItemNode | StageNode;

/**
 * Two-level pipeline tree: work item -> Plan / Code / Test stages.
 * Live from the state store; emits on every store change.
 */
export class FactoryPipelineProvider implements vscode.TreeDataProvider<FactoryNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FactoryNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private connected = false;

  constructor(private readonly store: StateStore) {
    this.store.on("change", () => this.refresh());
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FactoryNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FactoryNode): FactoryNode[] {
    if (!element) {
      if (!this.connected) {
        return []; // empty -> "Connect" welcome view
      }
      return this.store.getItems().map((item) => {
        const percent = this.store.getProgress(item.correlation_key)?.percent ?? null;
        return new WorkItemNode(item, percent, this.store.getAnomaly(item.correlation_key));
      });
    }
    if (element instanceof WorkItemNode) {
      const percent = this.store.getProgress(element.item.correlation_key)?.percent ?? null;
      return STAGES.map((stage) => new StageNode(element.item, stage, percent));
    }
    return [];
  }
}

export class WorkItemNode extends vscode.TreeItem {
  constructor(
    readonly item: WorkItem,
    percent: number | null,
    anomaly?: Anomaly,
  ) {
    super(
      `#${item.correlation_key}${item.title ? ` ${item.title}` : ""}`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    const stage = activeStage(item);
    const base = stage === "Pending" ? "pending" : percent != null ? `${stage} ${Math.round(percent)}%` : stage;
    this.description = anomaly ? `${base} — ${anomaly.kind}` : base;
    this.contextValue = "factory.workItem";
    this.iconPath = anomaly
      ? new vscode.ThemeIcon("warning", new vscode.ThemeColor(anomaly.severity === "high" ? "charts.red" : "charts.orange"))
      : workItemIcon(item);
    let tip =
      `**#${item.correlation_key}** ${item.title ?? ""}\n\n` +
      `- Plan: ${item.pfactory.status ?? "-"}\n` +
      `- Code: ${item.aifactory.status ?? "-"}\n` +
      `- Test: ${item.tfactory.status ?? "-"}`;
    if (anomaly) {
      tip += `\n\n**Anomaly (${anomaly.kind}, ${anomaly.severity}):** ${anomaly.detail}`;
    }
    this.tooltip = new vscode.MarkdownString(tip);
  }
}

export class StageNode extends vscode.TreeItem {
  constructor(item: WorkItem, stage: Stage, workItemPercent: number | null) {
    const svc: ServiceState = item[STAGE_SERVICE[stage]];
    super(stage, vscode.TreeItemCollapsibleState.None);
    const cat = classifyStatus(svc.status);
    const showPercent = stage === activeStage(item) && workItemPercent != null;
    this.description = [svc.status ?? "-", svc.phase ? `(${svc.phase})` : "", showPercent ? `${Math.round(workItemPercent)}%` : ""]
      .filter(Boolean)
      .join(" ");
    this.iconPath = categoryIcon(cat);
    this.contextValue = "factory.stage";
  }
}

function workItemIcon(item: WorkItem): vscode.ThemeIcon {
  // Worst-of the three stages drives the work-item glyph.
  const cats = [item.pfactory, item.aifactory, item.tfactory].map((s) => classifyStatus(s.status));
  if (cats.includes("failed")) {
    return categoryIcon("failed");
  }
  if (cats.includes("review")) {
    return categoryIcon("review");
  }
  if (cats.includes("running")) {
    return categoryIcon("running");
  }
  if (cats.every((c) => c === "done")) {
    return categoryIcon("done");
  }
  return categoryIcon("pending");
}

function categoryIcon(cat: StatusCategory): vscode.ThemeIcon {
  switch (cat) {
    case "running":
      return new vscode.ThemeIcon("sync~spin", new vscode.ThemeColor("charts.yellow"));
    case "done":
      return new vscode.ThemeIcon("pass", new vscode.ThemeColor("charts.green"));
    case "failed":
      return new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red"));
    case "review":
      return new vscode.ThemeIcon("eye", new vscode.ThemeColor("charts.orange"));
    case "pending":
    default:
      return new vscode.ThemeIcon("circle-outline", new vscode.ThemeColor("disabledForeground"));
  }
}
