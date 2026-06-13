# factory-vscode

The **PARR pipeline cockpit, inside your editor** — for VSCode and compatible IDEs (VSCodium,
Cursor, Windsurf, Antigravity).

`factory-vscode` brings the live Factory software-delivery pipeline into the editor. It is a consumer
of **CFactory**, the suite's observability tower, so it threads **PFactory** (Plan), **AIFactory**
(Code), and **TFactory** (Test) together by the **correlation key** — the GitHub issue number —
without integrating with each factory separately.

## What it gives you

- **A live cockpit** — every work item flowing through Plan → Code → Test, in real time over a
  WebSocket, with status, token usage, and anomalies.
- **Drive, don't just watch** — plan and push work from a real editor buffer, review AI plans inline,
  and approve/reject from a human-in-the-loop panel.
- **Real control** — stop a runaway agent, view its logs, disconnect, mute noisy items, and recover
  from a wrong project registration.
- **Frictionless connect** — one-click *Connect via Browser* deep-link token flow; the secret lives
  in SecretStorage and never touches settings or logs.
- **Respects your editor** — follows the theme (light/dark/high-contrast), honours *reduce motion*,
  and remembers your filter across reloads.

## Where to go next

- **[How to use](how-to.md)** — the everyday workflows, command by command.
- **[Best practices](best-practices.md)** — how to get the most out of the cockpit.
- **[Architecture](architecture.md)** — how the extension is put together and why.

## Links

- Source: <https://github.com/olafkfreund/factory-vscode>
- Public site: <https://olafkfreund.github.io/factory-vscode/>
- Design doc: [`docs/design/0001-factory-vscode-design.md`](https://github.com/olafkfreund/factory-vscode/blob/main/docs/design/0001-factory-vscode-design.md)
