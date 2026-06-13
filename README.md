# factory-vscode

The PARR pipeline cockpit, inside your editor.

`factory-vscode` brings the live [Factory](https://factory.freundcloud.com) software-delivery
pipeline into VSCode and compatible IDEs. Watch work items flow through Prepare, Act, Reflect, and
Review (PFactory, AIFactory, TFactory, CFactory) with live progress, an animated pipeline cockpit,
the streaming agent console, and actionable notifications, without ever leaving your editor.

> Status: planning / pre-0.1. Work is tracked in the [project epic](../../issues). Nothing is
> published yet.

Project site and blog: https://olafkfreund.github.io/factory-vscode/

## Why

Today the only unified view of a PARR run is the CFactory web cockpit in a browser tab. Developers
live in the IDE, so answering "where is issue #142, what's it doing, is it stuck?" means a context
switch. This extension closes that gap.

## How it works

The extension is a consumer of CFactory, the suite's observability tower, which already threads all
three factories together by the [RFC-0001](https://factory.freundcloud.com/rfc/correlation-key/)
correlation key (the GitHub issue number). It does not integrate with each factory separately.

```
CFactory :3111
   REST snapshot --------+          +--> Pipeline TreeView (native)
   /api/ws  -------------+-> State -+--> Status bar + activity-bar badge (native)
   /api/live-agents/{key}/ws -------+--> Notifications (native)
                                    +--> Animated Webview Cockpit (React + framer-motion + xterm.js)
```

- REST (`/api/workitems`, `/api/workitems/{key}/process`, `/api/rollups`, `/api/anomalies`, and so
  on) for snapshots and rich per-task progress.
- WebSocket `/api/ws` for live `workitem` / `snapshot` / `progress` frames, the animation feed.
- WebSocket `/api/live-agents/{key}/ws` for the live agent (rmux/tmux) console, already proxied
  token-safe by CFactory and rendered with xterm.js.

## Features

**Watch the pipeline**

- Pipeline TreeView: every work item, its three PARR stages, status and progress at a glance.
- Animated cockpit: a Webview where work items travel Plan, Code, Test with motion that conveys
  state change, progress rings, and a token/cost ticker. It follows your editor theme, honours
  *reduce motion*, and remembers your filter across reloads.
- Live agent console: attach to the running agent's terminal stream in an embedded xterm.
- Status bar and badge: running and attention counts always visible.

**Push work to the factories** (see [design doc 0002](docs/design/0002-handover-workflows-design.md))

- Create Plan: describe work in a markdown buffer (pre-filled from your editor selection), review the
  AI-generated plan with per-issue select & rename, then emit GitHub issues. Processing is cancellable
  and resumable.
- Send to Code / Send to Test: hand an existing issue to AIFactory or TFactory; the project
  auto-registers on first use.
- Review Task: an inline panel showing the agent's branch, subtasks, and review reason — approve,
  reject, message the agent, or open its logs without leaving the editor.

**Stay in control**

- Stop Task, View Task Logs, Disconnect, and Show / Forget Registered Project.
- Notifications you can trust: "started" vs "queued" is reported honestly, never a false success; no
  burst of stale alerts on connect. Mute individual work items or whole event kinds.
- Anomaly nudges (stuck, handback-loop, failure) with actionable buttons (Review, Open Console,
  Stop Agent).

**Connect without friction** <!-- needs the CFactory endpoints in olafkfreund/CFactory#73 -->

- Connect via Browser: open CFactory where you're already signed in and the editor picks up the token
  automatically over a secure (`state`-validated) deep link — the token never touches your settings.
- Or Keycloak OIDC login, a `Set CFactory Token` paste flow, or a settings/CI token.

**Optional**

- MCP for chat: register CFactory's MCP with the IDE assistant so it can answer "where is #142 and
  why is it stuck?". Feature-detected, so editors without the API still load everything else.

## Getting started

1. Install the extension (from the VS Marketplace / Open VSX, or a packaged VSIX).
2. Make sure CFactory is running and reachable (default `http://localhost:3111`).
3. Set `factory.cfactoryUrl` if CFactory is elsewhere. For the token, the easiest path is
   `Factory: Connect via Browser` — it opens CFactory and hands the token back to the editor
   automatically. (You can also use `Factory: Set CFactory Token`, Keycloak login, or a settings token.)
4. Open the Factory view in the activity bar. The extension auto-connects (toggle with
   `factory.autoConnect`); use `Factory: Connect` to connect manually.
5. Open the animated cockpit with `Factory: Open Cockpit`, and a work item's live agent console
   from the tree's inline action or the cockpit.

### Connecting to a hosted CFactory

How you authenticate depends on how the deployment is secured:

- **Local / unsecured CFactory** — nothing to do. Leave `factory.cfactoryToken` empty; the
  extension connects with no token.
- **Hosted, with an API token (recommended)** — open CFactory's token page,
  e.g. `https://<your-cfactory>/settings/token`, copy the token, then run
  **Factory: Set CFactory Token** (or set `factory.cfactoryToken`). **Point `factory.cfactoryUrl`
  at the API URL shown on that page, not the cockpit URL** — see the gotcha below.
- **Hosted, with SSO (Keycloak)** — set `factory.keycloak.issuerUrl` (and `clientId`) and run
  **Factory: Login (Keycloak)**. The token is obtained and auto-refreshed via your SSO; no paste.
- **One-click** — where the deployment supports it, **Factory: Connect via Browser** opens
  CFactory (where you're already logged in) and hands the token back automatically.

> ⚠️ **Cockpit URL vs API URL.** A CFactory cockpit behind an SSO proxy (e.g. oauth2-proxy)
> only accepts a browser login on its main URL, so a *pasted token* sent there is rejected.
> Hosted deployments expose a separate **direct API host** for editors/clients
> (e.g. `https://cfactory-mcp.<domain>`) — use that as `factory.cfactoryUrl` with a pasted token.
> The `/settings/token` page shows the correct API URL. If you set `factory.keycloak.issuerUrl`,
> the extension tries SSO login first — leave it blank to use a pasted token.

## Commands

_Connecting & monitoring_

| Command | What it does |
|---|---|
| `Factory: Connect via Browser` | Open CFactory and pick up the token automatically via a deep link |
| `Factory: Connect` | Connect using an already-configured URL and token |
| `Factory: Disconnect` | Close the live feed and clear state |
| `Factory: Refresh` | Reconnect and re-hydrate the pipeline |
| `Factory: Open Cockpit` | Open the animated pipeline cockpit |
| `Factory: Open Live Console` | Stream a work item's live agent console |
| `Factory: Open Work Item on GitHub` | Open the issue (requires `factory.githubRepo`) |

_Authentication_

| Command | What it does |
|---|---|
| `Factory: Set CFactory Token` | Store the CFactory bearer token in SecretStorage |
| `Factory: Get Token from CFactory` | Open CFactory's token page to copy a token (fallback) |
| `Factory: Login (Keycloak)` / `Logout` | Browser-based OIDC login when `factory.keycloak.issuerUrl` is set |

_Pushing & controlling work_

| Command | What it does |
|---|---|
| `Factory: Create Plan` | Describe work, review the plan, emit GitHub issues |
| `Factory: Resume Plan Session` | Re-open the last plan session after a reload |
| `Factory: Send to Code` / `Send to Test` | Hand an issue to AIFactory / TFactory |
| `Factory: New Code Task` / `New Test Task` | Create a task directly without a GitHub issue |
| `Factory: Review Task` | Approve, reject, or message a running agent inline |
| `Factory: Stop Task` | Stop a running agent (with confirmation) |
| `Factory: View Task Logs` | Open a task's logs in an editor tab |
| `Factory: Onboard Project` | Register the workspace's repo with the factories |
| `Factory: Show Registered Projects` | Inspect / forget cached project registrations |
| `Factory: Mute/Unmute Notifications for Work Item` | Silence a noisy work item |

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `factory.cfactoryUrl` | string | `http://localhost:3111` | Base URL of the CFactory backend (REST + WebSocket). |
| `factory.cfactoryToken` | string | `""` | Bearer token for cluster/CI use. Takes precedence over the SecretStorage token; useful where SecretStorage is unavailable. |
| `factory.autoConnect` | boolean | `true` | Connect automatically when the editor starts. |
| `factory.githubRepo` | string | `""` | `owner/repo` used to build work-item issue links from the correlation key. Empty disables "Open Work Item on GitHub". |
| `factory.notifications.level` | enum | `important` | Which events notify: `off`, `important` (failures / awaiting-review / anomalies), or `all`. |
| `factory.notifications.mutedKinds` | array | `[]` | Event kinds to never notify about (`new`, `complete`, `failed`, `review`, `anomaly`), regardless of level. |
| `factory.cockpit.animations` | enum | `full` | Cockpit animation intensity: `full`, `subtle`, or `off`. The OS *reduce motion* setting is always honoured. |
| `factory.console.maxLines` | number | `5000` | Scrollback lines kept in the live agent console. |
| `factory.poll.intervalMs` | number | `5000` | REST fallback poll interval, and the base for the anomaly refresh interval (which backs off on failure). |
| `factory.keycloak.issuerUrl` | string | `""` | Keycloak realm issuer URL. When set, `Factory: Login` uses browser-based OIDC. |
| `factory.keycloak.clientId` | string | `cfactory` | Keycloak client ID for OIDC login. |
| `factory.pfactoryUrl` / `aifactoryUrl` / `tfactoryUrl` | string | `""` | Override the factory base URLs (otherwise derived from `factory.cfactoryUrl`). |

The CFactory token is never stored in settings by the extension; it lives in the editor's
SecretStorage and is held only by the extension host (never the webview).

## How to use

A task-oriented tour of the everyday workflows. Every action is a command — open the Command
Palette (`Ctrl/Cmd+Shift+P`) and type `Factory:`.

### 1. Connect

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

### 2. Watch the pipeline

- **`Factory: Open Cockpit`** — the live board: every work item flowing through Plan → Code → Test,
  keyed by its GitHub issue number (the correlation key). Status badges, token usage, and anomalies
  update in real time over the WebSocket.
- **`Factory: Open Live Console`** (from a work item) — streams the agent's log output.
- **`Factory: Open Work Item on GitHub`** — jumps to the linked issue (set `factory.githubRepo`).

### 3. Plan and push work from the editor

- **`Factory: Create Plan`** — opens a real untitled markdown buffer (pre-filled from your editor
  selection). Write the brief with full multi-line editing, then hit the **Send to Factory**
  editor-title button. Review the AI-generated plan inline: deselect or rename issues before emit.
- **`Factory: Resume Plan Session`** — re-attaches to a plan run you started earlier.
- **`Factory: Send Selection to Code` / `…to Test`** and **`Create Code Task` / `Create Test Task`**
  — hand a buffer/selection straight to AIFactory or TFactory.

### 4. Review and approve

- **`Factory: Review Task`** — the human-in-the-loop panel: branch, phase, subtask checklist, the
  *why* of the review request, and a **View Logs** button. Approve or reject (with a reason) without
  leaving the editor.

### 5. Stay in control

- **`Factory: Stop Task`** — stop a runaway agent (also offered as **Stop Agent** on failure/anomaly
  notifications).
- **`Factory: View Task Logs`** — pull a failed item's logs into an editor tab.
- **`Factory: Disconnect`** — drop the live connection.
- **`Factory: Show Registered Project` / `Forget Registered Project`** — inspect or clear a wrong
  project registration.
- **`Factory: Toggle Mute`** — silence a noisy work item; pair with `factory.notifications.mutedKinds`
  for per-kind control.

## Best practices

Recommendations distilled from the way the cockpit is built to be used.

- **Prefer Connect via Browser over pasted tokens.** It's one click, the `state` nonce blocks token
  injection, and the secret never reaches your settings or logs. Reserve `factory.cfactoryToken` for
  CI/cluster contexts where SecretStorage isn't available.
- **Treat the GitHub issue number as the correlation key.** It's how the cockpit threads PFactory,
  AIFactory, and TFactory together. Set `factory.githubRepo` so every work item links back to its
  issue — your audit trail comes for free.
- **Write plans in the buffer, not a one-line box.** Use `Create Plan` and start from an editor
  selection: you get paste, undo, and syntax highlighting for the most thought-intensive input in
  the product. Prune the AI's issue list before emit instead of after.
- **Targets in multi-root windows are explicit.** With more than one workspace folder you'll get a
  folder pick, and a no-remote workspace prompts for the project — the cockpit never silently sends
  work to the wrong repo. Confirm the target when prompted.
- **Tune notifications instead of muting everything.** Keep `notifications.level: important` for
  signal; add specific kinds to `notifications.mutedKinds`, or mute a single chatty item with
  `Toggle Mute`, rather than dropping to `off`.
- **Calm the cockpit under load.** For large pipelines set `factory.cockpit.animations: subtle` or
  `off` (the OS *reduce motion* setting is always honoured) — readability over motion.
- **Stop early when an agent goes sideways.** `Stop Task` + `View Task Logs` beats waiting for a
  failure; logs land in an editor tab you can search and share.
- **Recover a bad registration, don't fight it.** If a workspace mapped to the wrong project, use
  `Forget Registered Project` and re-onboard rather than editing state by hand.

## Compatibility

Built on stable `vscode.*` APIs and the standard Webview API only (no proposed APIs), and published
to both the VS Marketplace and Open VSX, so the same package installs across VSCode and the
OpenVSX-based editors.

The MCP-for-chat integration is feature-detected: where an IDE lacks the MCP provider API, that
single feature is skipped and everything else works unchanged.

### Tested-IDE matrix

| Editor | Distribution | Status |
|---|---|---|
| VSCode | VS Marketplace | Primary target; built + packaged in CI |
| VSCodium | Open VSX | Target (stable APIs + Open VSX) |
| Cursor | Open VSX | Target (stable APIs + Open VSX) |
| Windsurf | Open VSX | Target (stable APIs + Open VSX) |
| Antigravity | Open VSX | Target (stable APIs + Open VSX) |

Runtime smoke tests (`@vscode/test-electron`) are tracked separately; this matrix records the
compatibility basis, and entries move to "Verified" as each editor is exercised.

### Releasing

Pushing a `v*` tag runs the release workflow: it builds, packages the VSIX, publishes to the VS
Marketplace (`VSCE_PAT`) and Open VSX (`OVSX_PAT`) when those secrets are present, and attaches the
VSIX to a GitHub release. Publishing steps are skipped automatically when the tokens are absent.

## Design

See [`docs/design/0001-factory-vscode-design.md`](docs/design/0001-factory-vscode-design.md).

## License

MIT, Olaf Freund.
