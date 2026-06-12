# factory-vscode — Handover Workflows Design

> Doc: 0002
> Date: 2026-06-11
> Status: Approved

## Summary

Extend the Factory VSCode extension so developers can hand work off to PFactory,
AIFactory, and TFactory directly from the editor — without leaving VSCode, without
opening a browser, and without manually wiring GitHub issue numbers to factory
jobs. Three new commands cover the full PARR handover surface:

- **Send to Plan** (`factory.createPlan`) — write a description in VSCode, review
  the AI-generated plan, approve it, and PFactory emits GitHub issues.
- **Send to Code** (`factory.sendToCode`) — hand an existing issue to AIFactory;
  auto-registers the project if needed.
- **Send to Test** (`factory.sendToTest`) — same, targeting TFactory.

An additional **Onboard Project** command (`factory.onboardProject`) makes
project registration an explicit one-click action for first-time setup.

---

## Architecture

```
VSCode extension host
  ├── src/handover/
  │     ├── client.ts          PFactory / AIFactory / TFactory typed REST clients
  │     ├── factoryUrls.ts     URL derivation from cfactoryUrl setting
  │     ├── projectRegistry.ts globalState cache: gitRemote → {ai,t}ProjectId
  │     └── workflow.ts        high-level orchestration (plan lifecycle, auto-register)
  └── src/planPreview/
        └── panel.ts           standalone webview — plan markdown + Approve button
```

All three factory clients share the existing `Auth` instance. No new auth surfaces.

### URL derivation

`factory.cfactoryUrl` is the single required setting. Factory URLs are derived by
replacing the first subdomain:

```
https://cfactory-mcp.freundcloud.org.uk
  → https://pfactory.freundcloud.org.uk
  → https://aifactory.freundcloud.org.uk
  → https://tfactory.freundcloud.org.uk
```

Algorithm: strip the first label from the hostname, prepend the target service name.

Optional override settings (`factory.pfactoryUrl`, `factory.aifactoryUrl`,
`factory.tfactoryUrl`) allow non-standard deployments without changing the
derivation logic for users who follow the naming convention.

---

## Send to Plan flow

Command: `factory.createPlan`
Entry point: command palette; "+" button in Pipeline tree view title bar.

1. Extension shows a multi-step input:
   - Step 1: title (optional, defaults to first line of description)
   - Step 2: description text (pre-fills with editor selection if any)
2. Calls `POST pfactory/api/plan/sessions/ingest-text` with `{text, title}`.
3. Calls `POST pfactory/api/plan/sessions/{id}/process`.
   Polls `GET .../sessions/{id}` every 3 seconds with a VS Code progress notification
   until `status === "ready"` (or times out after 5 minutes).
4. Opens `PlanPreviewPanel` — a standalone webview showing:
   - Session title
   - Full plan markdown (rendered)
   - List of planned issue titles
   - Primary button: "Approve & Emit"
   - Secondary button: "Discard"
5. On "Approve & Emit": calls `POST .../approve` then `POST .../emit`.
   Shows notification: "Plan emitted — {N} issues created."
6. On "Discard": panel closes. Session is abandoned (PFactory GCs unused sessions).

---

## Send to Code / Send to Test flows

Commands: `factory.sendToCode`, `factory.sendToTest`

### Entry points

**Tree context menu** (primary): right-click a `WorkItemNode` → inline actions.
Issue number extracted from `item.correlation_key` using the existing `shortKey`
helper (strips UUID prefix, returns the numeric part).

**Command palette** (secondary): shows a quick-pick of all items currently in the
pipeline store, labelled `#NNN — title`, plus a "Enter issue number manually…"
option at the bottom for issues not yet visible.

### Execution

1. Resolve numeric issue number from correlation key or manual input.
2. Resolve project ID:
   a. Check `ProjectRegistry` for the workspace's git remote.
   b. If missing: run auto-onboard (see Onboarding section below).
3. Call `POST aifactory/api/projects/{id}/github/import` or
   `POST tfactory/api/projects/{id}/github/import` with `{issueNumbers: [n]}`.
4. If response includes a task ID, call `POST .../tasks/{taskId}/start`.
   If no task ID is returned (factory manages start internally), skip the start call.
5. Notification: "Task #NNN sent to AIFactory — agent starting." (with task ID)
   or "Task #NNN queued in AIFactory." (without task ID).

---

## Project onboarding

Command: `factory.onboardProject`
Also invoked automatically by Send to Code / Send to Test when no project ID is
cached for the workspace.

1. Read git remote:
   - Primary: `vscode.extensions.getExtension('vscode.git')` API
     (`repo.state.remotes[0].fetchUrl`)
   - Fallback: `git remote get-url origin` via child_process
2. Show confirmation: "Register `<repo-url>` with Factory? This registers the
   project with AIFactory and TFactory so work items can be assigned."
3. Register with AIFactory and TFactory in parallel:
   `POST aifactory/api/projects` and `POST tfactory/api/projects`
   with `{git_url, name}` where `name` is derived from the URL.
4. Handle existing project (409 or duplicate name): fetch project list, match by
   git_url or name, use existing ID instead of failing.
5. Store both project IDs in `ProjectRegistry` keyed by the remote URL.
6. Notification: "Project registered — ready for Send to Code and Send to Test."

---

## ProjectRegistry

```typescript
// Persisted in ExtensionContext.globalState
type RegistryEntry = {
  aifactory?: string;   // project ID
  tfactory?: string;    // project ID
};
type Registry = Record<string, RegistryEntry>; // key: git remote URL
```

Stored at key `"factory.projectRegistry"`. Entries are invalidated (removed) when
a factory returns 404 for a project ID; the next operation triggers re-registration.

---

## PlanPreviewPanel

A standalone `vscode.WebviewPanel` (separate from the cockpit, no React build).
Content is generated from a template string in `panel.ts`:

- Renders plan markdown via a minimal `marked`-style replacement (or passes
  raw markdown and relies on VS Code's built-in `vscode-markdown-it` if available).
- Posts `{type: "approve"}` / `{type: "discard"}` messages back to the extension
  host on button click.
- The host handles the messages and drives the approve/emit sequence.
- Panel is disposed after the user acts or closes it.

---

## New commands and menus

| Command | Title | Entry point |
|---|---|---|
| `factory.createPlan` | Create Plan | Command palette; tree title "+" |
| `factory.sendToCode` | Send to Code | Command palette; tree item context |
| `factory.sendToTest` | Send to Test | Command palette; tree item context |
| `factory.onboardProject` | Onboard Project | Command palette |

Context menu additions (`view/item/context` when `viewItem == factory.workItem`):
- `factory.sendToCode` at `inline@3` (terminal icon)
- `factory.sendToTest` at `inline@4` (beaker icon)

---

## New settings

| Key | Type | Default | Description |
|---|---|---|---|
| `factory.pfactoryUrl` | string | `""` | Override derived PFactory URL |
| `factory.aifactoryUrl` | string | `""` | Override derived AIFactory URL |
| `factory.tfactoryUrl` | string | `""` | Override derived TFactory URL |

When an override is empty the derived URL is used.

---

## Error handling

- **PFactory process timeout** (>5 min): cancel progress, notify user, abandon session.
- **Factory unreachable** (network error): show error notification with the derived URL
  so user can check settings.
- **401 on any factory**: same token-prompt flow as CFactory (reuses `FactoryHttpError.isUnauthorized`).
- **Git remote not detected** (no `origin`, local-only repo, or no workspace open):
  both the primary (vscode.git API) and fallback (child_process) paths fall through
  to the same prompt: "Enter the git remote URL for this project." Manual entry is
  accepted and stored in the registry normally.
- **Project registration 409**: silently fall back to existing project (not an error condition).

---

## Files created or modified

New:
- `src/handover/client.ts`
- `src/handover/factoryUrls.ts`
- `src/handover/projectRegistry.ts`
- `src/handover/workflow.ts`
- `src/planPreview/panel.ts`

Modified:
- `src/extension.ts` — register 4 new commands
- `src/pipelineView.ts` — add `sendToCode` / `sendToTest` context actions
- `package.json` — commands, menus, settings
- `src/config.ts` — add optional URL overrides and factory URL resolution helper
