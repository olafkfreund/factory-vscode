import * as vscode from "vscode";
import type { StateStore } from "./state/store";
import type { CockpitState, WebviewToHost, ConsoleStatus } from "./webview/protocol";
import { makeNonce } from "./webview/util";
import { throttle } from "./util/throttle";
import { readConfig } from "./config";

export interface ConsoleHandlers {
  onData: (base64: string) => void;
  onStatus: (status: ConsoleStatus) => void;
}

/** Opens a host-side console stream for a work item; returns a disposable. */
export type ConsoleConnector = (key: string, handlers: ConsoleHandlers) => vscode.Disposable;

/**
 * The cockpit Webview. Mounts the built React app and bridges it to the host.
 * The host owns the store, sockets, and token; the webview is a pure view.
 */
export class CockpitPanel {
  private static current: CockpitPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private activeConsole: vscode.Disposable | undefined;
  /** Set once the webview has sent its "ready" handshake. */
  private webviewReady = false;
  /** A console requested before the webview was ready; flushed on "ready". */
  private pendingConsoleKey: string | undefined;

  static show(context: vscode.ExtensionContext, store: StateStore, connector: ConsoleConnector): CockpitPanel {
    if (CockpitPanel.current) {
      CockpitPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return CockpitPanel.current;
    }
    const panel = vscode.window.createWebviewPanel("factory.cockpit", "Factory Cockpit", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview-ui", "dist")],
    });
    CockpitPanel.current = new CockpitPanel(panel, context, store, connector);
    return CockpitPanel.current;
  }

  /** Open (or switch) the embedded console for a work item, revealing the cockpit. */
  openConsole(key: string): void {
    // On a cold cockpit the React app has not mounted yet; messages posted to an
    // unloaded webview are silently dropped. Defer until the "ready" handshake.
    if (!this.webviewReady) {
      this.pendingConsoleKey = key;
      return;
    }
    this.activeConsole?.dispose();
    void this.panel.webview.postMessage({ type: "consoleOpen", key });
    this.activeConsole = this.connector(key, {
      onData: (base64) => void this.panel.webview.postMessage({ type: "console", key, data: base64 }),
      onStatus: (status) => void this.panel.webview.postMessage({ type: "consoleStatus", key, status }),
    });
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly store: StateStore,
    private readonly connector: ConsoleConnector,
  ) {
    this.panel = panel;
    void this.render();

    this.panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg), null, this.disposables);

    // Coalesce the store's change stream — one post per ~120ms is plenty for a
    // cockpit and avoids a message storm when many items report progress.
    const post = throttle(() => this.postState(), 120);
    const onChange = () => post.trigger();
    this.store.on("change", onChange);
    this.disposables.push(new vscode.Disposable(() => {
      this.store.off("change", onChange);
      post.cancel();
    }));

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Re-push state when the animation preference changes so it applies live.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("factory.cockpit.animations")) {
          this.postState();
        }
      }),
    );
  }

  private onMessage(msg: WebviewToHost): void {
    switch (msg.type) {
      case "ready": {
        this.webviewReady = true;
        this.postState();
        // Flush a console that was requested before the webview was ready.
        if (this.pendingConsoleKey) {
          const key = this.pendingConsoleKey;
          this.pendingConsoleKey = undefined;
          this.openConsole(key);
        }
        break;
      }
      case "openConsole":
        this.openConsole(msg.key);
        break;
      case "closeConsole":
        this.activeConsole?.dispose();
        this.activeConsole = undefined;
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
    const state: CockpitState = {
      items,
      progress,
      anomalies: this.store.getAnomalies(),
      animations: readConfig().cockpitAnimations,
    };
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

    html = html.replace(/(src|href)="\.?\/?(assets\/[^"]+)"/g, `$1="${baseUri}/$2"`);
    html = html.replace(/<script /g, `<script nonce="${nonce}" `);
    const csp =
      `default-src 'none'; ` +
      `img-src ${webview.cspSource} https: data:; ` +
      `style-src ${webview.cspSource} 'unsafe-inline'; ` +
      `font-src ${webview.cspSource}; ` +
      `script-src 'nonce-${nonce}' ${webview.cspSource};`;
    html = html.replace(/<head>/, `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);

    this.panel.webview.html = html;
  }

  dispose(): void {
    CockpitPanel.current = undefined;
    this.activeConsole?.dispose();
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

