import * as vscode from "vscode";
import type { StateStore } from "./state/store";
import type { CockpitState, WebviewToHost } from "./webview/protocol";

/**
 * The cockpit Webview. Mounts the built React app from webview-ui/dist and
 * bridges it to the host over postMessage. The host owns the store, sockets,
 * and token; the webview is a pure view fed `state` messages. The animated
 * pipeline (#9) and embedded console (#10) build on this shell.
 */
export class CockpitPanel {
  private static current: CockpitPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext, store: StateStore): void {
    if (CockpitPanel.current) {
      CockpitPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel("factory.cockpit", "Factory Cockpit", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview-ui", "dist")],
    });
    CockpitPanel.current = new CockpitPanel(panel, context, store);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly store: StateStore,
  ) {
    this.panel = panel;

    void this.render();

    this.panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg), null, this.disposables);

    const onChange = () => this.postState();
    this.store.on("change", onChange);
    this.disposables.push(new vscode.Disposable(() => this.store.off("change", onChange)));

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private onMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready":
        this.postState();
        break;
      case "openConsole":
        void vscode.commands.executeCommand("factory.openConsole", msg.key);
        break;
      case "openOnGitHub":
        void vscode.commands.executeCommand("factory.openWorkItemOnGitHub", msg.key);
        break;
    }
  }

  private postState(): void {
    const items = this.store.getItems();
    const progress: Record<string, number | null> = {};
    for (const item of items) {
      progress[item.correlation_key] = this.store.getProgress(item.correlation_key)?.percent ?? null;
    }
    const state: CockpitState = { items, progress, anomalies: this.store.getAnomalies() };
    void this.panel.webview.postMessage({ type: "state", state });
  }

  private async render(): Promise<void> {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, "webview-ui", "dist");
    const indexUri = vscode.Uri.joinPath(distUri, "index.html");

    let html: string;
    try {
      html = Buffer.from(await vscode.workspace.fs.readFile(indexUri)).toString("utf8");
    } catch {
      this.panel.webview.html = fallbackHtml("Cockpit assets not found. Run the webview build.");
      return;
    }

    const baseUri = webview.asWebviewUri(distUri).toString().replace(/\/+$/, "");
    const nonce = makeNonce();

    // Rewrite Vite's relative asset paths to webview URIs.
    html = html.replace(/(src|href)="\.?\/?(assets\/[^"]+)"/g, `$1="${baseUri}/$2"`);
    // Add a nonce to module scripts.
    html = html.replace(/<script /g, `<script nonce="${nonce}" `);
    // Inject a scoped CSP.
    const csp =
      `default-src 'none'; ` +
      `img-src ${webview.cspSource} https: data:; ` +
      `style-src ${webview.cspSource} 'unsafe-inline'; ` +
      `font-src ${webview.cspSource}; ` +
      `script-src 'nonce-${nonce}' ${webview.cspSource};`;
    html = html.replace(
      /<head>/,
      `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );

    this.panel.webview.html = html;
  }

  dispose(): void {
    CockpitPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function fallbackHtml(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;background:#282828;color:#ebdbb2;padding:40px">
<h1 style="color:#fabd2f">Factory Cockpit</h1><p style="color:#a89984">${message}</p></body></html>`;
}

function makeNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
