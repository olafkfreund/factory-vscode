---
layout: default
title: Home
description: The PARR pipeline cockpit inside your editor, for VSCode and compatible IDEs.
---

# factory-vscode

<p class="lead">The PARR pipeline cockpit, inside your editor. <em>Watch every work item flow through Plan → Code → Test, push work to the factories, and stay in control — without leaving VSCode.</em></p>

<div class="hero-actions">
  <a class="btn" href="https://github.com/olafkfreund/factory-vscode">View on GitHub</a>
  <a class="btn secondary" href="{{ '/how-to/' | relative_url }}">How to use</a>
  <a class="btn secondary" href="{{ '/best-practices/' | relative_url }}">Best practices</a>
  <a class="btn secondary" href="{{ '/blog/' | relative_url }}">Read the blog</a>
</div>

> Status: **v1.0.0** — the hardening &amp; UX-cleanup epic has shipped. New to the cockpit? Start with [How to use]({{ '/how-to/' | relative_url }}) and [Best practices]({{ '/best-practices/' | relative_url }}).

`factory-vscode` brings the live Factory software-delivery pipeline into VSCode and compatible IDEs.
It is a consumer of **CFactory**, the suite's observability tower — so it threads PFactory, AIFactory,
and TFactory together by the correlation key (the GitHub issue number) without integrating with each
factory separately.

## What's new <span class="pill new">latest</span>

The pipeline isn't just something you *watch* anymore — you can drive it and keep control, all from the editor.

<div class="highlight">
  <strong>🌐 One-click Connect via Browser.</strong> No more copy-pasting bearer tokens. Run <span class="kbd">Factory: Connect via Browser</span>, finish in the browser where you're already signed in, and the editor picks up the token automatically over a secure deep link — the token never touches your settings.
</div>

<div class="highlight">
  <strong>✍️ Plan and push work from the editor.</strong> Write a plan or task in a real markdown buffer (pre-filled from your selection), review the AI-generated plan with per-issue select &amp; rename, then send work to Plan, Code, or Test — and review the agent's plan inline.
</div>

<div class="highlight">
  <strong>🛑 Real control, not just visibility.</strong> Stop a runaway agent, view its logs, disconnect, mute a noisy work item, and recover from a wrong project registration — every verb you need when something goes sideways.
</div>

<div class="highlight">
  <strong>🎨 Cockpit that respects you.</strong> Follows your editor theme (light, dark, high-contrast), honours <em>reduce motion</em>, and remembers your filter across reloads.
</div>

## The four things it does

<div class="feature-grid">
  <div class="feature-card">
    <div class="ico">📡</div>
    <h3>Watch the pipeline</h3>
    <p>Live state with zero context-switching.</p>
    <ul>
      <li><strong>Pipeline TreeView</strong> — every work item, its three PARR stages, status and progress</li>
      <li><strong>Animated cockpit</strong> — work items travel Plan → Code → Test with progress rings and a token/cost ticker</li>
      <li><strong>Live agent console</strong> — attach to the running agent's terminal, streamed token-safe</li>
      <li><strong>Status bar &amp; badge</strong> — running and attention counts always visible</li>
    </ul>
  </div>
  <div class="feature-card">
    <div class="ico">🚀</div>
    <h3>Push work to the factories</h3>
    <p>Hand off from the editor, not a browser.</p>
    <ul>
      <li><strong>Create Plan</strong> — describe work in a markdown buffer; PFactory plans it; review &amp; emit GitHub issues</li>
      <li><strong>Send to Code / Test</strong> — hand an issue to AIFactory or TFactory; auto-registers the project</li>
      <li><strong>Review Task</strong> — see branch, subtasks, and the review reason; approve, reject, or message the agent inline</li>
    </ul>
  </div>
  <div class="feature-card">
    <div class="ico">🎛️</div>
    <h3>Stay in control</h3>
    <p>Every off-switch you'd reach for.</p>
    <ul>
      <li><strong>Stop Task</strong> and <strong>View Logs</strong> from the tree or a failure notification</li>
      <li><strong>Disconnect</strong> and <strong>Show / Forget Registered Project</strong></li>
      <li><strong>Mute</strong> a noisy work item or whole event kinds</li>
      <li>Truthful notifications — "started" vs "queued", never a false success</li>
    </ul>
  </div>
  <div class="feature-card">
    <div class="ico">🔔</div>
    <h3>Get nudged, not spammed</h3>
    <p>Actionable alerts, deduped and tuned.</p>
    <ul>
      <li>Stage complete, failure, awaiting-review, and anomaly nudges (stuck, handback loop)</li>
      <li>Per-kind and per-item muting, with action buttons (Review, Open Console, Stop Agent)</li>
      <li>No burst of stale alerts when you connect to a busy pipeline</li>
    </ul>
  </div>
</div>

## How it works

The extension owns all sockets and your token in the editor host; the webview only ever receives
forwarded frames, so the token never enters it. It reads CFactory's REST API for snapshots,
subscribes to its WebSocket for live frames, and renders the proxied agent console.

```
CFactory  ──REST snapshot──▶  ┌──────────────┐  ──▶  Pipeline TreeView (native)
          ──/api/ws live───▶  │  State store │  ──▶  Status bar + badge (native)
          ──agent console──▶  │ single truth │  ──▶  Notifications (native)
                              └──────────────┘  ──▶  Animated cockpit + live console
```

When the WebSocket drops it falls back to REST polling with backoff; an unauthorized connection stops
retrying and prompts you to re-authenticate instead of hammering the server.

## A few commands to know

| Command | What it does |
|---|---|
| `Factory: Connect via Browser` | Open CFactory and pick up the token automatically <span class="pill new">new</span> |
| `Factory: Open Cockpit` | Open the animated pipeline cockpit |
| `Factory: Create Plan` | Describe work, review the plan, emit GitHub issues |
| `Factory: Send to Code` / `Send to Test` | Hand an issue to AIFactory / TFactory |
| `Factory: Review Task` | Approve, reject, or message a running agent |
| `Factory: Stop Task` / `View Task Logs` | Control a running agent <span class="pill new">new</span> |

See the [README](https://github.com/olafkfreund/factory-vscode#readme) for the full command and
configuration reference.

## Runs where you work

Built on stable IDE extension APIs and the standard Webview API only — no proposed APIs — and
published to both OpenVSX and the VS Marketplace. The same package installs on **VSCode, VSCodium,
Cursor, Windsurf, and Antigravity**. Where an IDE lacks the optional MCP-for-chat API, that one
feature is skipped and everything else works unchanged.

## Learn more

- [Why we are building factory-vscode]({{ '/blog/' | relative_url }})
- [Design: core extension](https://github.com/olafkfreund/factory-vscode/blob/main/docs/design/0001-factory-vscode-design.md) · [Handover workflows](https://github.com/olafkfreund/factory-vscode/blob/main/docs/design/0002-handover-workflows-design.md)
- [Project board and epics](https://github.com/olafkfreund/factory-vscode/issues)
