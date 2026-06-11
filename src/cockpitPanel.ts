import * as vscode from "vscode";

/**
 * The animated cockpit Webview.
 *
 * The scaffold renders a styled placeholder. Mounting the React + framer-motion
 * app from `webview-ui/dist` (with the host owning sockets and forwarding frames
 * over postMessage) is issue #8 (Webview cockpit shell).
 */
export class CockpitPanel {
  private static current: CockpitPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext): void {
    const column = vscode.ViewColumn.Active;
    if (CockpitPanel.current) {
      CockpitPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "factory.cockpit",
      "Factory Cockpit",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview-ui", "dist")],
      },
    );
    CockpitPanel.current = new CockpitPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.placeholderHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private placeholderHtml(): string {
    const nonce = makeNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #282828; color: #ebdbb2; display: flex; align-items: center;
         justify-content: center; height: 100vh; }
  .card { text-align: center; max-width: 520px; padding: 32px; }
  h1 { color: #fabd2f; margin-bottom: 8px; }
  p { color: #a89984; line-height: 1.6; }
  code { color: #b8bb26; }
</style>
</head>
<body>
  <div class="card">
    <h1>Factory Cockpit</h1>
    <p>The animated PARR pipeline cockpit mounts here. The React + framer-motion
       app and live frame forwarding are implemented in the cockpit milestone.</p>
    <p>Pipeline data feed: <code>CFactory REST + WebSocket</code></p>
  </div>
</body>
</html>`;
  }

  dispose(): void {
    CockpitPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function makeNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
