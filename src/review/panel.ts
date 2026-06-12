import * as vscode from "vscode";
import type { AgentFactoryClient, InboxMessage, Task } from "../handover/client";
import { makeNonce } from "../webview/util";

type HostMsg =
  | { type: "send"; message: string }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "refresh" };

type WebviewMsg =
  | { type: "state"; task: Task; messages: InboxMessage[] }
  | { type: "error"; message: string }
  | { type: "sent" };

/**
 * Human review panel — shows agent inbox messages for a running task and lets
 * the developer respond, approve or reject the agent's plan from within the IDE.
 */
export class HumanReviewPanel {
  private static panels = new Map<string, HumanReviewPanel>();

  private readonly panel: vscode.WebviewPanel;
  private pollTimer?: NodeJS.Timeout;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly client: AgentFactoryClient,
    private readonly task: Task,
    private readonly factory: string,
  ) {
    const title = `Review: ${task.title ?? task.id.slice(0, 8)}`;
    this.panel = vscode.window.createWebviewPanel(
      "factory.review",
      title,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.html = buildHtml(this.panel.webview, context);

    const callAndRefresh = async (action: () => Promise<void>): Promise<void> => {
      try {
        await action();
        this.send({ type: "sent" });
        void this.refresh();
      } catch (err) {
        this.send({ type: "error", message: (err as Error).message });
      }
    };

    this.panel.webview.onDidReceiveMessage(async (msg: HostMsg) => {
      switch (msg.type) {
        case "send":
          await callAndRefresh(() => this.client.postInbox(this.task.id, msg.message));
          break;
        case "approve":
          await callAndRefresh(async () => {
            await this.client.approvePlan(this.task.id);
            vscode.window.showInformationMessage(`Factory: plan approved for ${this.factory} task.`);
          });
          break;
        case "reject": {
          // Collect the reason host-side: window.prompt() is blocked in webviews.
          const reason = await vscode.window.showInputBox({
            title: "Factory: reject plan",
            prompt: "Reason for rejection (optional)",
            ignoreFocusOut: true,
          });
          // Cancelled the input box → abort the rejection entirely.
          if (reason === undefined) {
            break;
          }
          await callAndRefresh(async () => {
            await this.client.rejectPlan(this.task.id, reason.trim() || undefined);
            vscode.window.showInformationMessage(`Factory: plan rejected.`);
          });
          break;
        }
        case "refresh":
          void this.refresh();
          break;
      }
    });

    this.panel.onDidDispose(() => {
      HumanReviewPanel.panels.delete(this.task.id);
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    });

    // Only poll while the panel is visible; resume immediately on re-focus.
    this.panel.onDidChangeViewState(({ webviewPanel }) => {
      if (webviewPanel.visible) {
        void this.refresh();
        this.startPoll();
      } else {
        this.stopPoll();
      }
    });

    // Seed with data immediately, then start polling.
    void this.refresh();
    this.startPoll();
  }

  static show(
    context: vscode.ExtensionContext,
    client: AgentFactoryClient,
    task: Task,
    factory: string,
  ): HumanReviewPanel {
    const existing = HumanReviewPanel.panels.get(task.id);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }
    const p = new HumanReviewPanel(context, client, task, factory);
    HumanReviewPanel.panels.set(task.id, p);
    return p;
  }

  private async refresh(): Promise<void> {
    try {
      const [updated, messages] = await Promise.all([
        this.client.getTask(this.task.id),
        this.client.getInbox(this.task.id),
      ]);
      this.send({ type: "state", task: updated, messages });
    } catch (err) {
      this.send({ type: "error", message: (err as Error).message });
    }
  }

  private send(msg: WebviewMsg): void {
    void this.panel.webview.postMessage(msg);
  }

  private startPoll(): void {
    this.stopPoll();
    this.pollTimer = setInterval(() => { void this.refresh(); }, 8000);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }
}

function buildHtml(_webview: vscode.Webview, _context: vscode.ExtensionContext): string {
  const nonce = makeNonce();
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Factory Review</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px 20px 80px;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: 13px; line-height: 1.5;
    background: var(--vscode-editor-background, #1d2021);
    color: var(--vscode-editor-foreground, #ebdbb2);
  }
  h1 { font-size: 1rem; font-weight: 700; margin: 0 0 4px;
    color: var(--vscode-charts-yellow, #fabd2f); }
  .meta { font-size: 0.78rem; color: var(--vscode-descriptionForeground, #a89984); margin-bottom: 16px; }
  .status-pill {
    display: inline-block; padding: 2px 8px; border-radius: 100px;
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; margin-left: 8px;
    background: #fabd2f22; color: #fabd2f; border: 1px solid #fabd2f44;
  }
  .status-pill.done { background: #b8bb2622; color: #b8bb26; border-color: #b8bb2644; }
  .status-pill.failed { background: #fb493422; color: #fb4934; border-color: #fb493444; }
  .section-title {
    font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--vscode-descriptionForeground, #a89984);
    margin: 16px 0 8px;
  }
  .messages { display: flex; flex-direction: column; gap: 8px; }
  .msg {
    background: var(--vscode-textBlockQuote-background, #282828);
    border-radius: 6px; padding: 10px 12px;
    border-left: 3px solid var(--vscode-charts-blue, #83a598);
  }
  .msg.human { border-left-color: var(--vscode-charts-green, #b8bb26); }
  .msg-from { font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--vscode-descriptionForeground, #a89984); margin-bottom: 4px; }
  .msg-text { white-space: pre-wrap; word-break: break-word; font-size: 0.82rem; }
  .msg-time { font-size: 0.65rem; color: var(--vscode-descriptionForeground, #a89984);
    margin-top: 4px; text-align: right; }
  .empty { color: var(--vscode-descriptionForeground, #a89984); font-size: 0.82rem;
    text-align: center; padding: 20px 0; }
  .plan-actions {
    display: flex; gap: 8px; margin: 12px 0;
    padding: 12px; background: #fabd2f11;
    border: 1px solid #fabd2f33; border-radius: 6px;
  }
  .plan-label {
    flex: 1; font-size: 0.82rem;
    color: #fabd2f; align-self: center;
  }
  .compose {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--vscode-editor-background, #1d2021);
    border-top: 1px solid var(--vscode-widget-border, #3c3836);
    padding: 10px 20px;
    display: flex; gap: 6px; align-items: flex-end;
  }
  textarea {
    flex: 1; resize: none; height: 52px;
    background: var(--vscode-input-background, #3c3836);
    color: var(--vscode-input-foreground, #ebdbb2);
    border: 1px solid var(--vscode-input-border, #504945);
    border-radius: 4px; padding: 8px;
    font-family: inherit; font-size: 13px;
    outline: none;
  }
  textarea:focus { border-color: var(--vscode-focusBorder, #fabd2f); }
  button {
    padding: 6px 14px; border: none; border-radius: 4px;
    font-size: 0.82rem; font-weight: 600; cursor: pointer;
  }
  .btn-send { background: var(--vscode-button-background, #fabd2f); color: #1d2021; }
  .btn-send:hover { opacity: 0.88; }
  .btn-send:disabled { opacity: 0.4; cursor: default; }
  .btn-approve { background: var(--vscode-charts-green, #b8bb26); color: #1d2021; }
  .btn-approve:hover { opacity: 0.88; }
  .btn-reject { background: var(--vscode-errorForeground, #fb4934); color: #fff; }
  .btn-reject:hover { opacity: 0.88; }
  .btn-refresh {
    background: transparent; color: var(--vscode-descriptionForeground, #a89984);
    border: 1px solid var(--vscode-widget-border, #3c3836);
    font-size: 0.72rem; padding: 4px 10px;
    float: right; margin-top: -2px;
  }
  .btn-refresh:hover { color: var(--vscode-editor-foreground, #ebdbb2); }
  .error { color: var(--vscode-errorForeground, #fb4934); font-size: 0.78rem;
    margin: 6px 0; padding: 6px 10px;
    background: #fb493411; border-radius: 4px; }
  #flash { min-height: 22px; }
</style>
</head>
<body>
<h1 id="task-title">Loading…</h1>
<div class="meta" id="task-meta"></div>
<div id="plan-actions" style="display:none" class="plan-actions">
  <span class="plan-label">Agent is waiting for plan approval</span>
  <button class="btn-approve" id="approve-btn">Approve Plan</button>
  <button class="btn-reject" id="reject-btn">Reject</button>
</div>
<div style="display:flex;align-items:center;justify-content:space-between">
  <div class="section-title">Inbox</div>
  <button class="btn-refresh" id="refresh-btn">Refresh</button>
</div>
<div class="messages" id="messages"></div>
<div id="flash"></div>
<div class="compose">
  <textarea id="reply" placeholder="Type a message to the agent…"></textarea>
  <button class="btn-send" id="send-btn">Send</button>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'state': render(data.task, data.messages); break;
      case 'error': flash(data.message, true); break;
      case 'sent': flash('Sent.', false); document.getElementById('reply').value = ''; break;
    }
  });

  function render(task, messages) {
    document.getElementById('task-title').textContent = task.title || task.id;
    const status = task.status || '';
    const pill = statusPill(status);
    document.getElementById('task-meta').innerHTML =
      'ID: ' + esc(task.id) + ' &middot; Factory: ' + pill +
      (task.review_reason ? ' &middot; ' + esc(task.review_reason) : '');

    const needsPlanApproval = /plan.*approval|awaiting.*plan|plan_approval/i.test(status);
    document.getElementById('plan-actions').style.display = needsPlanApproval ? 'flex' : 'none';

    const container = document.getElementById('messages');
    if (!messages.length) {
      container.innerHTML = '<div class="empty">No inbox messages yet.</div>';
      return;
    }
    container.innerHTML = messages.map(m => {
      const isHuman = /human|user/i.test(m.from);
      return '<div class="msg' + (isHuman ? ' human' : '') + '">' +
        '<div class="msg-from">' + esc(m.from) + '</div>' +
        '<div class="msg-text">' + esc(m.text) + '</div>' +
        '<div class="msg-time">' + new Date(m.timestamp).toLocaleTimeString() + '</div>' +
        '</div>';
    }).join('');
  }

  function statusPill(s) {
    const cls = /done|complete/i.test(s) ? 'done' : /fail|error/i.test(s) ? 'failed' : '';
    return '<span class="status-pill ' + cls + '">' + esc(s || 'unknown') + '</span>';
  }

  function send() {
    const reply = document.getElementById('reply');
    const text = reply.value.trim();
    if (!text) { return; }
    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    vscode.postMessage({ type: 'send', message: text });
    setTimeout(() => { sendBtn.disabled = false; }, 1500);
  }

  function approve() { vscode.postMessage({ type: 'approve' }); }

  // The reject reason is collected host-side (window.prompt is blocked in webviews).
  function rejectPlan() { vscode.postMessage({ type: 'reject' }); }

  function refresh() { vscode.postMessage({ type: 'refresh' }); }

  // Wire controls via addEventListener — inline onclick handlers are blocked by
  // the nonce-based Content-Security-Policy.
  document.getElementById('send-btn').addEventListener('click', send);
  document.getElementById('approve-btn').addEventListener('click', approve);
  document.getElementById('reject-btn').addEventListener('click', rejectPlan);
  document.getElementById('refresh-btn').addEventListener('click', refresh);

  function flash(msg, isErr) {
    const el = document.getElementById('flash');
    el.innerHTML = '<div class="' + (isErr ? 'error' : '') + '">' + esc(msg) + '</div>';
    setTimeout(() => { el.innerHTML = ''; }, 3000);
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Keyboard shortcut: Ctrl/Cmd+Enter to send
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { send(); }
  });
</script>
</body>
</html>`;
}

