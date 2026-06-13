---
layout: default
title: How to use
description: A task-oriented tour of the everyday factory-vscode workflows — connect, watch, plan, review, and stay in control.
permalink: /how-to/
---

# How to use

A task-oriented tour of the everyday workflows. Every action is a command — open the Command
Palette (<span class="kbd">Ctrl/Cmd+Shift+P</span>) and type `Factory:`.

## 1. Connect

- **Recommended — `Factory: Connect via Browser`.** Opens CFactory in the browser where you're
  already signed in and hands the token back to the editor over a one-time, `state`-validated deep
  link. The token lands in SecretStorage; it never touches your settings or the logs.
- **SSO — `Factory: Login`.** When `factory.keycloak.issuerUrl` is set, authenticates via
  browser-based OIDC.
- **Manual — `Factory: Set CFactory Token`.** Paste a token (use `Factory: Get Token from CFactory`
  to open the copyable token page). Best for cluster/CI, where you can also set
  `factory.cfactoryToken`.

With `factory.autoConnect` on (default), the editor reconnects on startup. Set `factory.cfactoryUrl`
to your CFactory backend first.

## 2. Watch the pipeline

- **`Factory: Open Cockpit`** — the live board: every work item flowing through Plan → Code → Test,
  keyed by its GitHub issue number (the correlation key). Status badges, token usage, and anomalies
  update in real time over the WebSocket.
- **`Factory: Open Live Console`** (from a work item) — streams the agent's log output.
- **`Factory: Open Work Item on GitHub`** — jumps to the linked issue (set `factory.githubRepo`).

## 3. Plan and push work from the editor

- **`Factory: Create Plan`** — opens a real untitled markdown buffer (pre-filled from your editor
  selection). Write the brief with full multi-line editing, then hit the **Send to Factory**
  editor-title button. Review the AI-generated plan inline: deselect or rename issues before emit.
- **`Factory: Resume Plan Session`** — re-attaches to a plan run you started earlier.
- **`Factory: Send Selection to Code` / `…to Test`** and **`Create Code Task` / `Create Test Task`**
  — hand a buffer/selection straight to AIFactory or TFactory.

## 4. Review and approve

- **`Factory: Review Task`** — the human-in-the-loop panel: branch, phase, subtask checklist, the
  *why* of the review request, and a **View Logs** button. Approve or reject (with a reason) without
  leaving the editor.

## 5. Stay in control

- **`Factory: Stop Task`** — stop a runaway agent (also offered as **Stop Agent** on failure/anomaly
  notifications).
- **`Factory: View Task Logs`** — pull a failed item's logs into an editor tab.
- **`Factory: Disconnect`** — drop the live connection.
- **`Factory: Show Registered Project` / `Forget Registered Project`** — inspect or clear a wrong
  project registration.
- **`Factory: Toggle Mute`** — silence a noisy work item; pair with `factory.notifications.mutedKinds`
  for per-kind control.

---

See also: [Best practices]({{ '/best-practices/' | relative_url }}) · [Home]({{ '/' | relative_url }})
