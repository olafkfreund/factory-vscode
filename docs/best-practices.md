---
layout: default
title: Best practices
description: Recommendations distilled from the way the factory-vscode cockpit is built to be used.
permalink: /best-practices/
---

# Best practices

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

---

See also: [How to use]({{ '/how-to/' | relative_url }}) · [Home]({{ '/' | relative_url }})
