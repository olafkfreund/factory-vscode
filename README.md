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
