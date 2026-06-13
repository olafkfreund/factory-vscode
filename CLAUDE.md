# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension ("Factory Pipeline Cockpit") that surfaces the live PARR pipeline (PFactory → AIFactory → TFactory, observed through CFactory) inside the editor: a native TreeView, status bar, notifications, an animated React webview cockpit with an embedded xterm agent console, and handover commands that push work to the factories. Built on stable `vscode.*` APIs only (no proposed APIs) so the same VSIX works on VSCode, VSCodium, Cursor, Windsurf, etc.

## Commands

```bash
npm run build            # full build: webview (Vite) + extension host (esbuild)
npm run build:ext        # extension host only → out/extension.js
npm run build:webview    # webview only (runs npm ci in webview-ui, then vite build → webview-ui/dist)
npm run watch            # esbuild watch for the extension host (webview must be built separately)
npm run typecheck        # tsc --noEmit (extension host)
npm run lint             # eslint src --ext ts (webview-ui is NOT linted by this)
npm test                 # unit tests: node --import tsx --test test/*.test.ts
node --import tsx --test test/store.test.ts   # run a single unit test file
npm run build:e2e && npm run test:e2e         # VS Code integration smoke test (@vscode/test-electron, config in .vscode-test.mjs)
npm run package          # vsce package → factory-vscode.vsix
```

The webview has its own package under `webview-ui/` (`npm --prefix webview-ui run build|dev`). Its build runs `tsc --noEmit` first, so type errors in the webview fail `npm run build`.

Releases: pushing a `v*` tag runs `.github/workflows/release.yml` (build → package → publish to VS Marketplace + Open VSX when tokens exist → attach VSIX to the GitHub release).

## Architecture

Two separately bundled halves communicating over a typed message protocol:

1. **Extension host** (`src/`, bundled by `esbuild.js` → CJS/node18, `vscode` external).
2. **Webview UI** (`webview-ui/`, React 19 + framer-motion + xterm.js, built by Vite → `webview-ui/dist`, loaded by `CockpitPanel`).

### Data flow

CFactory is the *only* backend integration point for monitoring — the extension never talks to the individual factories for pipeline state. All state flows through one hub:

- `src/cfactory/restClient.ts` — REST snapshot (`/api/workitems`, `/api/anomalies`, `/api/rollups`, …) hydrates the store on connect; polling (`factory.poll.intervalMs`) is the fallback when the WebSocket is down.
- `src/cfactory/liveSocket.ts` — WebSocket `/api/ws` delivers `snapshot`/`workitem`/`progress` frames that keep the store current.
- `src/state/store.ts` — **`StateStore` is the single source of truth**, keyed by correlation key (the GitHub issue number, see `src/util/correlationKey.ts`). It is an `EventEmitter` deliberately free of any `vscode` import so it is unit-testable. Every surface (tree view, status bar, badge, cockpit webview, notifier) subscribes to its `"change"` event; none of them keep their own state.
- `src/cfactory/consoleSocket.ts` — per-work-item live agent console (`/api/live-agents/{key}/ws`). The socket is opened **host-side** and raw ANSI bytes are forwarded to the webview base64-encoded, so the bearer token never reaches the webview.

### Webview protocol (manual mirror — keep in sync)

`src/webview/protocol.ts` (host side) and `webview-ui/src/protocol.ts` (webview side) are **two hand-maintained copies** of the host↔webview message types, not a shared module — the webview copy also inlines the `WorkItem`/`Anomaly` types and the `acquireVsCodeApi` wrapper. When changing any message shape, update both files.

### Auth

`src/auth.ts` (`Auth`) resolves the CFactory bearer token with precedence: `factory.cfactoryToken` setting (for CI/cluster) → SecretStorage (set via `Factory: Set CFactory Token`) → Keycloak OIDC login (`src/auth/oidc.ts`, enabled when `factory.keycloak.issuerUrl` is set). The single `Auth` instance is shared by every client (REST, sockets, handover, MCP). Tokens are never written to settings by the extension and never passed to webviews.

### Handover (design doc 0002)

`src/handover/` implements pushing work *to* the factories (the one place the extension talks to them directly):

- `factoryUrls.ts` — PFactory/AIFactory/TFactory base URLs are derived from `factory.cfactoryUrl` by replacing the first hostname label (e.g. `cfactory-mcp.x.org` → `pfactory.x.org`); `factory.{p,ai,t}factoryUrl` settings override.
- `client.ts` — typed REST clients for the three factories, sharing `Auth`.
- `projectRegistry.ts` — `globalState` cache mapping git remote → factory project IDs, so `Send to Code`/`Send to Test` can auto-register a project once.
- `workflow.ts` — orchestration: plan session lifecycle (ingest → process → poll → preview → approve/emit via `src/planPreview/panel.ts`), and the send-to-code/test flows. `src/review/panel.ts` is the human-review webview.

### Other integration points

- `src/mcp/register.ts` — registers CFactory's MCP server with the IDE assistant, **feature-detected**: guard any use of `vscode.lm`-adjacent APIs so OpenVSX editors without the API still load the extension.
- `src/notify/` — `events.ts` derives notification-worthy events from store transitions; `notifier.ts` dedupes and respects `factory.notifications.level`.
- All commands, views, settings, and menus are declared in `package.json` `contributes` and wired in `src/extension.ts#activate`.

## Testing conventions

- Unit tests (`test/`, `node:test` via tsx) cover only `vscode`-free modules (store, status, events, restClient, liveSocket, mcp url logic). Keep new logic out of `vscode`-importing files where possible so it stays unit-testable — this separation is deliberate.
- `test-e2e/extension.test.ts` is a mocha-TDD smoke test run inside a real VS Code via `@vscode/test-electron`; it must be bundled first (`npm run build:e2e`).

## Design docs

Substantial features get a numbered design doc in `docs/design/` (`0001` core extension, `0002` handover workflows) — consult them before changing those areas; `docs/` is otherwise the GitHub Pages site.
