import * as vscode from "vscode";
import type { PlanSession } from "../handover/client";
import { esc, makeNonce } from "../webview/util";

/** The selected (and possibly renamed) issues the user approved. */
export interface PlanApproval {
  action: "approve" | "discard";
  issues?: Array<{ title: string }>;
}

type Message =
  | { type: "approve"; issues: Array<{ title: string }> }
  | { type: "discard" };

/**
 * Standalone webview showing the PFactory-generated plan as rendered markdown,
 * with per-issue checkboxes and inline rename. Resolves with the user's action
 * and the included issues. Opens beside the active editor so it does not stomp
 * the user's current file.
 */
export function showPlanPreview(
  _context: vscode.ExtensionContext,
  session: PlanSession,
): Promise<PlanApproval> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "factory.planPreview",
      `Factory: Plan — ${session.title ?? session.id}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    panel.webview.html = buildHtml(session);

    let settled = false;
    const finish = (result: PlanApproval) => {
      if (settled) { return; }
      settled = true;
      resolve(result);
    };

    const sub = panel.webview.onDidReceiveMessage((msg: Message) => {
      finish(msg.type === "approve" ? { action: "approve", issues: msg.issues } : { action: "discard" });
      sub.dispose();
      panel.dispose();
    });

    // Closing the panel (X) before acting counts as discard.
    panel.onDidDispose(() => {
      sub.dispose();
      finish({ action: "discard" });
    });
  });
}

/**
 * Minimal, safe Markdown → HTML. Input is escaped first, so only the handled
 * constructs produce tags; everything else renders as literal text.
 */
function renderMarkdown(md: string): string {
  const lines = esc(md).split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let inCode = false;

  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };

  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line.trim())) {
      if (inCode) { out.push("</code></pre>"); inCode = false; }
      else { closeList(); out.push("<pre class='code'><code>"); inCode = true; }
      continue;
    }
    if (inCode) { out.push(line + "\n"); continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (line.trim() === "") { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) { out.push("</code></pre>"); }
  return out.join("\n");
}

/** Inline emphasis and code on already-escaped text. */
function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function buildHtml(session: PlanSession): string {
  const title  = esc(session.title ?? `Session ${session.id}`);
  const planHtml = renderMarkdown(session.plan_text ?? "_No plan text returned._");
  const issues = session.issues ?? [];
  const issueRows = issues.length
    ? issues.map((iss, i) => `
        <li class="issue">
          <input type="checkbox" id="inc-${i}" checked>
          <input type="text" id="title-${i}" class="issue-title" value="${esc(iss.title)}">
        </li>`).join("\n")
    : "<li><em>No issues listed yet.</em></li>";

  const nonce = makeNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin: 0; padding: 20px 24px; font-family: var(--vscode-font-family, sans-serif); font-size: 13px; line-height: 1.5; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  h1 { font-size: 1.1rem; font-weight: 700; color: var(--vscode-charts-yellow, #fabd2f); margin-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 0.8rem; margin-bottom: 20px; }
  h2.section { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
  section { margin-bottom: 24px; }
  .plan { background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-charts-yellow, #fabd2f); padding: 8px 14px; border-radius: 4px; max-height: 50vh; overflow-y: auto; }
  .plan h1, .plan h2, .plan h3, .plan h4 { color: var(--vscode-editor-foreground); text-transform: none; letter-spacing: normal; margin: 10px 0 4px; }
  .plan h1 { font-size: 1rem; } .plan h2 { font-size: 0.95rem; } .plan h3 { font-size: 0.9rem; }
  .plan p { margin: 4px 0; } .plan ul { margin: 4px 0; padding-left: 20px; }
  .plan code { background: var(--vscode-textPreformatBackground, #00000033); padding: 0 4px; border-radius: 3px; }
  .plan pre.code { background: var(--vscode-textCodeBlock-background, #00000033); padding: 8px 10px; border-radius: 4px; overflow-x: auto; }
  ul.issues { list-style: none; margin: 0; padding: 0; }
  .issue { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .issue-title { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 4px 8px; font-family: inherit; font-size: 0.85rem; }
  .issue-title:focus { outline: none; border-color: var(--vscode-focusBorder); }
  .issue input[type=checkbox]:not(:checked) ~ .issue-title { opacity: 0.5; text-decoration: line-through; }
  .actions { display: flex; gap: 10px; margin-top: 28px; }
  button { padding: 8px 20px; border: none; border-radius: 4px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
  .btn-approve { background: var(--vscode-button-background, #b8bb26); color: var(--vscode-button-foreground, #1d2021); }
  .btn-approve:hover { background: var(--vscode-button-hoverBackground, #b8bb26); }
  .btn-discard { background: var(--vscode-button-secondaryBackground, #3c3836); color: var(--vscode-button-secondaryForeground, #ebdbb2); }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">Session ID: ${esc(session.id)}</p>

<section>
  <h2 class="section">Generated plan</h2>
  <div class="plan">${planHtml}</div>
</section>

<section>
  <h2 class="section">Issues to create (${issues.length}) — uncheck to skip, edit to rename</h2>
  <ul class="issues">${issueRows}</ul>
</section>

<div class="actions">
  <button class="btn-approve" id="approve-btn">Approve &amp; Emit</button>
  <button class="btn-discard" id="discard-btn">Discard</button>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const count = ${issues.length};

  function collect() {
    const issues = [];
    for (let i = 0; i < count; i++) {
      const inc = document.getElementById('inc-' + i);
      const title = document.getElementById('title-' + i);
      if (inc && inc.checked && title && title.value.trim()) {
        issues.push({ title: title.value.trim() });
      }
    }
    return issues;
  }

  document.getElementById('approve-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'approve', issues: collect() });
  });
  document.getElementById('discard-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'discard' });
  });
</script>
</body>
</html>`;
}
