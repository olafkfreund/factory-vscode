# Design 0001 — factory-vscode

> Status: Accepted · Created: 2026-06-11 · Author: Olaf Freund

## Context

The Factory suite runs the PARR pipeline (PFactory = Prepare/Plan, AIFactory = Act/Build,
TFactory = Reflect/Verify, CFactory = Review/Observe). Today the **only** unified view of a run is
the CFactory web cockpit (`:3110`) in a browser. Developers live in their IDE, so they
context-switch to a browser tab to answer "where is issue #142, what's it doing, is it stuck?"
There is no VSCode extension anywhere in the suite — this is greenfield.

`factory-vscode` brings the live PARR pipeline into the editor: a navigable tree, an animated
cockpit, the live agent (tmux/rmux) console, and native notifications. Target: genuinely useful
first, visually standout where it earns it.

**Key finding that shapes everything:** CFactory is already the aggregator. It threads all three
factories by the RFC-0001 correlation key (GitHub issue #) and exposes REST + a live WebSocket +
a token-safe proxy of the agent console. So the plugin is primarily a **CFactory consumer**, not
three separate integrations.

## Goal

Ship a cross-IDE extension (VSCode + Antigravity/Cursor/Windsurf/VSCodium via OpenVSX) that shows
live PARR progress, animated pipeline state, the live agent console, and actionable notifications —
sourced entirely from CFactory's REST + WebSocket API.

## Decisions

| Decision | Choice |
|---|---|
| Data feed | CFactory REST (`:3111`) + WebSocket `/api/ws` (single aggregator) |
| UI surface | Hybrid: native TreeView/status-bar/notifications + animated Webview cockpit |
| Live console | Consume `/api/live-agents/{key}/ws` (proxied rmux/tmux) into webview xterm.js |
| MCP | Runtime feed is REST/WS; CFactory `/mcp` registered with IDE assistant is a secondary feature |
| Repo | `olafkfreund/factory-vscode`, public |

## Integration surface (CFactory `:3111`)

- **REST:** `GET /api/workitems`, `/api/workitems/{key}`, `/api/workitems/{key}/timeline`,
  `/api/workitems/{key}/process` (rich live progress: `phase_percent`, `overall_percent`,
  `current_subtask`, `subtasks[]`), `/api/rollups`, `/api/anomalies`, `/api/live-agents`,
  `/api/activity`, `/health`.
- **WebSocket `/api/ws`** — broadcast hub; frames `{type:"workitem"|"snapshot"|"progress", ...}`;
  client sends periodic `ping`; reconnect with exponential backoff.
- **WebSocket `/api/live-agents/{correlation_key}/ws`** — ANSI/xterm-compatible agent console,
  re-streamed from AIFactory/TFactory rmux so the upstream token never leaks.
- **Models:** `CompletionEvent`, `WorkItem` (`pfactory`/`aifactory`/`tfactory` ServiceState +
  `timeline`), `LiveProgress`, `Anomaly` (`kind: failure|handback_loop|stuck`). Reuse the TS types
  from CFactory's `apps/frontend-web/src/api.ts`.
- **Auth:** bearer via `CFACTORY_MCP_SECRET` / `CFACTORY_API_KEYS`; dev default open.
- **Frontend stack to mirror:** React 19 + Vite 6 + framer-motion 12 + xterm.js 5.5 + addon-fit.

## Architecture

TypeScript extension, **stable `vscode.*` APIs only** (no proposed APIs) for cross-IDE portability.
The extension host owns all sockets and the auth token; webviews receive only forwarded frames via
`postMessage` (the token never enters the webview).

### Components

1. **`src/client/`** — `RestClient` (typed REST wrapper, ports `api.ts` types), `LiveSocket`
   (`/api/ws`, backoff reconnect + heartbeat, emits typed `workitem`/`snapshot`/`progress`),
   `ConsoleSocket` (per-key `/api/live-agents/{key}/ws`), `Auth` (base URL from config; token in
   `vscode.SecretStorage`).
2. **`src/state/`** — single in-memory store keyed by correlation key; REST snapshot hydrates,
   WS deltas keep it live; `EventEmitter` so all views share one source of truth.
3. **Native UI** — `FactoryPipelineProvider` TreeView (work item → Plan/Code/Test children, status
   ThemeIcons + color, inline actions: open cockpit/console/issue); status bar item
   (`Factory: 3▶ 1⚠`, spinner when active); activity-bar badge (awaiting-review + anomalies).
4. **`webview-ui/`** — Animated cockpit (React + framer-motion): work items travel Plan→Code→Test
   with layout transitions, progress rings, token/cost ticker, anomaly pulse; embedded xterm.js
   (+ addon-fit) bound to `ConsoleSocket`; rollups header from `/api/rollups`.
5. **`src/notify/`** — fire on new item / stage complete / failure / awaiting-review / anomaly;
   dedup by `kind:key`; configurable verbosity (`off|important|all`); actionable buttons.
6. **`src/mcp/`** — register CFactory `/mcp` with the IDE assistant where supported; degrade
   gracefully where the API is absent.
7. **Commands & config** — `factory.openCockpit|connect|refresh|openConsole|openWorkItemOnGitHub|setToken|focusItem`;
   settings `factory.cfactoryUrl`, `factory.notifications.level`, `factory.autoConnect`,
   `factory.console.maxLines`, `factory.poll.intervalMs`.

### Data flow

REST snapshot on connect hydrates the store → `/api/ws` deltas keep it live → tree/status/webview
re-render → console WS opens on demand per item → notifications fire on transitions/anomalies.

### Error handling

- WS drop → status bar "disconnected", backoff reconnect, fall back to REST polling.
- CFactory down → "offline" state, retry, tree shows last-known + stale badge.
- 401 → prompt for token (SecretStorage). Webview crash → reload command.

### Testing

- Unit: client parsing, store reducers, notification dedup.
- Integration: mock CFactory REST+WS fixture replaying recorded frames.
- E2E: `@vscode/test-electron` smoke (activate + tree renders against mock).

### Cross-IDE

Stable APIs only; standard Webview API; publish to OpenVSX + VS Marketplace; documented tested-IDE
matrix (Antigravity, Cursor, Windsurf, VSCodium).

## Roadmap (epic children)

*Foundation:* scaffold + packaging + CI · REST client + auth/config · LiveSocket + state store.
*Native UI:* TreeView · status bar + badge · notifications.
*Cockpit:* webview shell · animated PARR visualization · embedded live console.
*Intelligence/Polish:* anomaly surfacing · MCP-for-chat · cross-IDE/OpenVSX · docs · test suite.
