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

## Compatibility

Built on stable `vscode.*` APIs and the standard Webview API, published to OpenVSX and the VS
Marketplace, so it runs in VSCode, Antigravity, Cursor, Windsurf, and VSCodium.

## Design

See [`docs/design/0001-factory-vscode-design.md`](docs/design/0001-factory-vscode-design.md).

## License

MIT, Olaf Freund.
