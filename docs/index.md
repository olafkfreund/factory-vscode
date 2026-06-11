---
layout: default
title: Home
description: The PARR pipeline cockpit inside your editor, for VSCode and compatible IDEs.
---

# factory-vscode

The PARR pipeline cockpit, inside your editor.

`factory-vscode` brings the live Factory software-delivery pipeline into VSCode and compatible
IDEs. Watch work items flow through Prepare, Act, Reflect, and Review (PFactory, AIFactory,
TFactory, CFactory) with live progress, an animated pipeline cockpit, the streaming agent console,
and actionable notifications, without ever leaving your editor.

<div class="hero-actions">
  <a class="btn" href="{{ '/blog/' | relative_url }}">Read the blog</a>
  <a class="btn secondary" href="https://github.com/olafkfreund/factory-vscode">View on GitHub</a>
</div>

> Status: planning / pre-0.1. The build plan lives in the project epic on GitHub.

## Why it exists

Today the only unified view of a PARR run is the CFactory web cockpit in a browser tab. Developers
live in the IDE, so answering "where is issue #142, what is it doing, is it stuck?" means a context
switch out of the editor. factory-vscode closes that gap.

## What it does

- Pipeline TreeView: every work item, its three PARR stages, status and progress at a glance.
- Animated cockpit: a Webview where work items travel Plan, Code, Test with motion that conveys
  state change, progress rings, and a token and cost ticker.
- Live agent console: attach to the running agent's terminal stream in an embedded terminal.
- Native notifications: stage complete, failure, awaiting-review, and anomaly nudges.
- Status bar and badge: running and anomaly counts always visible.

## How it works

The extension is a consumer of CFactory, the suite's observability tower, which already threads all
three factories together by the correlation key (the GitHub issue number). It reads CFactory's REST
API for snapshots, subscribes to its WebSocket for live frames, and renders the proxied agent
console. It does not integrate with each factory separately.

Built on stable IDE extension APIs and published to OpenVSX and the VS Marketplace, so it runs in
VSCode, Antigravity, Cursor, Windsurf, and VSCodium.

## Learn more

- [Why we are building factory-vscode]({{ '/blog/' | relative_url }})
- [Design document](https://github.com/olafkfreund/factory-vscode/blob/main/docs/design/0001-factory-vscode-design.md)
- [Project board and epic](https://github.com/olafkfreund/factory-vscode/issues)
