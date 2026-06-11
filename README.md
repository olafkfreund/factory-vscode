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

## Features (v0.1 vision)

- Pipeline TreeView: every work item, its three PARR stages, status and progress at a glance.
- Animated cockpit: a Webview where work items travel Plan, Code, Test with motion that conveys
  state change, progress rings, and a token/cost ticker. Cool, but it earns it.
- Live agent console: attach to the running agent's terminal stream in an embedded xterm.
- Native notifications: stage complete, failure, awaiting-review, and anomaly nudges (stuck,
  handback-loop, failure), deduped and with actionable buttons.
- Status bar and badge: running and anomaly counts always visible.
- MCP for chat (optional): register CFactory's MCP with the IDE assistant so it can answer
  "where is #142 and why is it stuck?".

## Getting started

1. Install the extension (from the VS Marketplace / Open VSX, or a packaged VSIX).
2. Make sure CFactory is running and reachable (default `http://localhost:3111`).
3. Set `factory.cfactoryUrl` if CFactory is elsewhere, and run `Factory: Set CFactory Token`
   if your CFactory requires a bearer token.
4. Open the Factory view in the activity bar. The extension auto-connects (toggle with
   `factory.autoConnect`); use `Factory: Connect` to connect manually.
5. Open the animated cockpit with `Factory: Open Cockpit`, and a work item's live agent console
   from the tree's inline action or the cockpit.

## Commands

| Command | What it does |
|---|---|
| `Factory: Connect` | Connect to CFactory and start the live feed |
| `Factory: Refresh` | Reconnect and re-hydrate the pipeline |
| `Factory: Open Cockpit` | Open the animated pipeline cockpit |
| `Factory: Open Live Console` | Stream a work item's live agent console |
| `Factory: Open Work Item on GitHub` | Open the issue (requires `factory.githubRepo`) |
| `Factory: Set CFactory Token` | Store the CFactory bearer token in SecretStorage |

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `factory.cfactoryUrl` | string | `http://localhost:3111` | Base URL of the CFactory backend (REST + WebSocket). |
| `factory.autoConnect` | boolean | `true` | Connect automatically when the editor starts. |
| `factory.githubRepo` | string | `""` | `owner/repo` used to build work-item issue links from the correlation key. Empty disables "Open Work Item on GitHub". |
| `factory.notifications.level` | enum | `important` | Which events notify: `off`, `important` (failures / awaiting-review / anomalies), or `all`. |
| `factory.console.maxLines` | number | `5000` | Scrollback lines kept in the live agent console. |
| `factory.poll.intervalMs` | number | `5000` | REST fallback poll interval, and the floor for the anomaly refresh interval. |

The CFactory token is never stored in settings; it lives in the editor's SecretStorage and is held
only by the extension host (never the webview).

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
