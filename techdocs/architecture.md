# Architecture

A short tour of how the extension is put together. For the full design rationale see the
[design doc](https://github.com/olafkfreund/factory-vscode/blob/main/docs/design/0001-factory-vscode-design.md).

## Principles

- **CFactory as the single aggregator.** The extension talks to one backend (CFactory) over REST +
  WebSocket. CFactory threads PFactory, AIFactory, and TFactory together by the correlation key (the
  GitHub issue number), so the editor never integrates with each factory separately.
- **A `vscode`-free single source of truth.** A `StateStore` holds all pipeline state and emits
  change events; it has no dependency on the `vscode` API, which keeps it unit-testable and keeps UI
  concerns out of the data layer.
- **The host owns the sockets; the token never reaches a webview.** The bearer token lives in
  SecretStorage and is held only by the extension host. Webviews receive rendered state over
  `postMessage` — never the secret.
- **Stable VS Code API only.** The extension restricts itself to stable APIs so the same build runs
  across VSCode and OpenVSX editors (VSCodium, Cursor, Windsurf, Antigravity). Capability-gated
  features (e.g. MCP-for-chat) are feature-detected and skipped where unavailable.

## Layers

| Layer | Responsibility |
|---|---|
| `cfactory/` | REST client, live WebSocket, and console socket to CFactory. |
| `state/` | `StateStore` — the single source of truth; pure, `vscode`-free, event-driven. |
| `handover/` | Plan/task workflows, the project registry, and factory URL derivation. |
| `review/`, `planPreview/` | Human-in-the-loop webview panels (nonce-CSP, host-side input). |
| `cockpitPanel`, `pipelineView` | The cockpit webview host and the tree view. |
| `notify/` | Event classification and notification policy (level + per-kind/per-item mute). |
| `shared/` | Single-sourced status vocabulary, synced into the webview to prevent drift. |

## Cross-cutting concerns

- **No update storms.** State-post and tree-refresh are throttled (~120 ms); the anomaly poll backs
  off when CFactory is unreachable.
- **One status vocabulary.** Status classification lives in `src/shared/statusVocab.ts` and is copied
  into the webview by a sync build-step, with a drift test that fails CI if the copies diverge.
- **Truthful UI.** Task-start reports started-vs-queued, onboarding never targets the wrong project
  silently, and connect produces a single state event so stale anomalies don't re-notify.

## Distribution

Pushing a `v*` tag runs the release workflow: build → package VSIX → publish to the VS Marketplace
(`VSCE_PAT`) and Open VSX (`OVSX_PAT`) when those secrets are present → attach the VSIX to a GitHub
release.
