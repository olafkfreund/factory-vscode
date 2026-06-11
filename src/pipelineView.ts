import * as vscode from "vscode";

/**
 * Placeholder Pipeline tree provider for the scaffold.
 *
 * The real work-item / PARR-stage tree backed by the CFactory state store
 * lands in issue #5 (Pipeline TreeView), fed by the client + store from
 * issues #3 and #4. For now it renders an empty state so the "Connect"
 * welcome view is shown until a connection exists.
 */
export class FactoryPipelineProvider implements vscode.TreeDataProvider<FactoryTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FactoryTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private connected = false;

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FactoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): FactoryTreeItem[] {
    if (!this.connected) {
      // Empty -> the contributed viewsWelcome "Connect" content is shown.
      return [];
    }
    // Live data is wired in issue #5; show a single informational node for now.
    const item = new FactoryTreeItem("Connected. Waiting for work items...", vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon("sync~spin");
    return [item];
  }
}

export class FactoryTreeItem extends vscode.TreeItem {
  constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
  }
}
