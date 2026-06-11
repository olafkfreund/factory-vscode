import * as vscode from "vscode";
import type { StateStore } from "./state/store";
import type { WorkItem } from "./cfactory/types";

/**
 * Pipeline tree provider. For the Foundation milestone it renders a live, flat
 * list of work items from the state store (proving the store -> view binding).
 * The full PARR-stage hierarchy, status icons, and inline actions are issue #5.
 */
export class FactoryPipelineProvider implements vscode.TreeDataProvider<WorkItemNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<WorkItemNode | undefined>();
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

  getTreeItem(element: WorkItemNode): vscode.TreeItem {
    return element;
  }

  getChildren(): WorkItemNode[] {
    if (!this.connected) {
      return []; // empty -> the contributed "Connect" welcome view shows
    }
    return this.store.getItems().map((item) => new WorkItemNode(item, this.store.getProgress(item.correlation_key)?.percent ?? null));
  }
}

export class WorkItemNode extends vscode.TreeItem {
  constructor(item: WorkItem, percent: number | null) {
    super(`#${item.correlation_key}${item.title ? ` ${item.title}` : ""}`, vscode.TreeItemCollapsibleState.None);
    const stage = activeStage(item);
    this.description = percent != null ? `${stage} ${Math.round(percent)}%` : stage;
    this.iconPath = new vscode.ThemeIcon(percent != null ? "sync~spin" : "circle-outline");
    this.contextValue = "factory.workItem";
  }
}

/** Coarse label of the stage currently doing something. */
function activeStage(item: WorkItem): string {
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
