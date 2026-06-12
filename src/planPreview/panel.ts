import * as vscode from "vscode";
import type { PlanSession } from "../handover/client";
import { esc, makeNonce } from "../webview/util";

type Message = { type: "approve" } | { type: "discard" };

/**
 * Lightweight standalone webview showing the PFactory-generated plan.
 * Resolves with "approve" or "discard" when the user acts.
 */
export function showPlanPreview(
  _context: vscode.ExtensionContext,
  session: PlanSession,
): Promise<"approve" | "discard"> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "factory.planPreview",
      `Factory: Plan — ${session.title ?? session.id}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: false },
    );

    panel.webview.html = buildHtml(session);

    const sub = panel.webview.onDidReceiveMessage((msg: Message) => {
      sub.dispose();
      panel.dispose();
      resolve(msg.type === "approve" ? "approve" : "discard");
    });

    // User closed the panel via the X button = discard
    panel.onDidDispose(() => {
      sub.dispose();
      resolve("discard");
    });
  });
}

function buildHtml(session: PlanSession): string {
  const title    = esc(session.title ?? `Session ${session.id}`);
  const planMd   = esc(session.plan_text ?? "_No plan text returned._");
  const issues   = session.issues ?? [];
  const issueList = issues.length
    ? issues.map((iss) => `<li>${esc(iss.title)}</li>`).join("\n")
    : "<li><em>No issues listed yet.</em></li>";

  const nonce = makeNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 20px 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.5; background: var(--vscode-editor-background, #1d2021); color: var(--vscode-editor-foreground, #ebdbb2); }
  h1 { font-size: 1.1rem; font-weight: 700; color: var(--vscode-charts-yellow, #fabd2f); margin-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground, #a89984); font-size: 0.8rem; margin-bottom: 20px; }
  h2 { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground, #a89984); margin: 0 0 8px; }
  section { margin-bottom: 24px; }
  pre { white-space: pre-wrap; word-break: break-word; background: var(--vscode-textBlockQuote-background, #282828); border-left: 3px solid var(--vscode-charts-yellow, #fabd2f); padding: 12px 14px; border-radius: 4px; font-size: 0.82rem; max-height: 50vh; overflow-y: auto; }
  ul { margin: 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .actions { display: flex; gap: 10px; margin-top: 28px; }
  button { padding: 8px 20px; border: none; border-radius: 4px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
  .btn-approve { background: var(--vscode-charts-green, #b8bb26); color: #1d2021; }
  .btn-approve:hover { opacity: 0.88; }
  .btn-discard { background: var(--vscode-button-secondaryBackground, #3c3836); color: var(--vscode-button-secondaryForeground, #ebdbb2); }
  .btn-discard:hover { opacity: 0.88; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">Session ID: ${esc(session.id)}</p>

<section>
  <h2>Generated plan</h2>
  <pre>${planMd}</pre>
</section>

<section>
  <h2>Issues to be created (${issues.length})</h2>
  <ul>${issueList}</ul>
</section>

<div class="actions">
  <button class="btn-approve" id="approve-btn">Approve &amp; Emit</button>
  <button class="btn-discard" id="discard-btn">Discard</button>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  function act(type) { vscode.postMessage({ type }); }
  // addEventListener — inline onclick is blocked by the CSP nonce.
  document.getElementById('approve-btn').addEventListener('click', () => act('approve'));
  document.getElementById('discard-btn').addEventListener('click', () => act('discard'));
</script>
</body>
</html>`;
}

