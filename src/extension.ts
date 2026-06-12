import * as vscode from "vscode";
import { readConfig, onConfigChange, affectsConnection } from "./config";
import { parseCorrelationKey } from "./util/correlationKey";
import { Auth } from "./auth";
import { RestClient, FactoryHttpError } from "./cfactory/restClient";
import { LiveSocket } from "./cfactory/liveSocket";
import { StateStore } from "./state/store";
import { FactoryPipelineProvider, WorkItemNode } from "./pipelineView";
import { CockpitPanel, type ConsoleConnector } from "./cockpitPanel";
import { ConsoleSocket } from "./cfactory/consoleSocket";
import { FactoryStatusBar } from "./statusBar";
import { Notifier } from "./notify/notifier";
import { registerCfactoryMcp } from "./mcp/register";
import { HandoverWorkflow } from "./handover/workflow";
import type { AgentFactoryClient, Task } from "./handover/client";
import { showPlanPreview } from "./planPreview/panel";
import { HumanReviewPanel } from "./review/panel";
import { makeNonce } from "./webview/util";

/** Extract a correlation key from a tree node or a raw key string. */
function keyOf(arg?: WorkItemNode | string): string | undefined {
  return typeof arg === "string" ? arg : arg?.item.correlation_key;
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Factory");
  const statusBar = new FactoryStatusBar();
  const store = new StateStore();
  const pipeline = new FactoryPipelineProvider(store);
  const auth = new Auth(context.secrets);

  // Per-item notification mute, persisted in globalState.
  const MUTED_KEY = "factory.mutedItems";
  const isMutedItem = (key: string): boolean =>
    (context.globalState.get<string[]>(MUTED_KEY) ?? []).includes(key);
  const setMutedItem = (key: string, muted: boolean): void => {
    const set = new Set(context.globalState.get<string[]>(MUTED_KEY) ?? []);
    if (muted) { set.add(key); } else { set.delete(key); }
    void context.globalState.update(MUTED_KEY, [...set]);
  };

  const notifier = new Notifier(store, isMutedItem);
  context.subscriptions.push(notifier);

  // Optional: expose CFactory's MCP tools to the IDE assistant where supported.
  if (registerCfactoryMcp(context, auth)) {
    output.appendLine("Registered CFactory MCP server with the IDE assistant.");
  }

  let socket: LiveSocket | undefined;
  let anomalyTimer: NodeJS.Timeout | undefined;
  const stopSocket = () => {
    socket?.close();
    socket = undefined;
    if (anomalyTimer) {
      clearInterval(anomalyTimer);
      anomalyTimer = undefined;
    }
  };

  const treeView = vscode.window.createTreeView("factory.pipeline", { treeDataProvider: pipeline });

  // Status bar counts and the activity-bar badge track store changes.
  store.on("change", () => {
    statusBar.setCounts(store.runningCount, store.anomalyCount);
    const attention = store.attentionCount;
    treeView.badge = attention > 0
      ? { value: attention, tooltip: `${store.anomalyCount} anomalies, ${store.reviewCount} awaiting review` }
      : undefined;
  });

  context.subscriptions.push(
    output,
    statusBar,
    treeView,
    new vscode.Disposable(stopSocket),
  );

  const makeClient = (): RestClient => {
    const cfg = readConfig();
    return new RestClient({ baseUrl: cfg.cfactoryUrl, getToken: () => auth.getToken() });
  };

  // Opens a host-side console stream for a work item and forwards ANSI bytes
  // (base64) to the webview. The token stays in the host.
  const consoleConnector: ConsoleConnector = (key, handlers) => {
    const cfg = readConfig();
    const client = makeClient();
    let sock: ConsoleSocket | undefined;
    let cancelled = false;
    void (async () => {
      let wsPath = `/api/live-agents/${encodeURIComponent(key)}/ws`;
      try {
        const agent = (await client.liveAgents()).agents.find((a) => a.correlation_key === key);
        if (agent?.ws_path) {
          wsPath = agent.ws_path;
        }
      } catch {
        /* fall back to the conventional path */
      }
      if (cancelled) {
        return;
      }
      sock = new ConsoleSocket(cfg.cfactoryUrl, wsPath, () => auth.getToken(), {
        onData: (buf) => handlers.onData(buf.toString("base64")),
        onOpen: () => handlers.onStatus("open"),
        onClose: () => handlers.onStatus("closed"),
      });
    })();
    return new vscode.Disposable(() => {
      cancelled = true;
      sock?.close();
    });
  };

  // Connect: hydrate from REST, then keep current via the live WebSocket.
  const connect = async () => {
    const cfg = readConfig();
    stopSocket();
    statusBar.setState("connecting");
    pipeline.setConnected(false);
    const client = makeClient();
    try {
      const health = await client.health();
      const [items, anomalies] = await Promise.all([client.workItems(), safeAnomalies(client)]);
      // Single combined update so the Notifier seeds its baseline with the
      // existing anomalies and does not fire a burst of stale notifications.
      store.hydrateAll(items, anomalies);
      statusBar.setState("connected");
      pipeline.setConnected(true);
      output.appendLine(
        `Connected to CFactory ${health.service} v${health.version} at ${cfg.cfactoryUrl} — ${items.length} work item(s).`,
      );

      // Live feed keeps the store current; status bar falls back to "connecting"
      // visuals while the socket is down, but REST data remains shown.
      socket = new LiveSocket({
        baseUrl: cfg.cfactoryUrl,
        getToken: () => auth.getToken(),
        onMessage: (msg) => store.applyFeed(msg),
        onOpen: () => output.appendLine("Live feed connected."),
        onClose: () => output.appendLine("Live feed closed; will reconnect."),
        onAuthError: () => {
          output.appendLine("Live feed rejected as unauthorized; stopped retrying.");
          stopSocket();
          statusBar.setState("offline");
          void (async () => {
            const pick = await vscode.window.showWarningMessage(
              "Factory: CFactory rejected the live connection (unauthorized). Set a token?",
              "Set Token",
            );
            if (pick === "Set Token" && (await auth.promptAndStore())) {
              void connect();
            }
          })();
        },
      });

      // Anomalies are computed by CFactory and not pushed over the feed, so
      // refresh them on an interval while connected.
      const interval = Math.max(cfg.pollIntervalMs, 5000);
      anomalyTimer = setInterval(() => {
        void (async () => {
          try {
            store.setAnomalies(await makeClient().anomalies());
          } catch {
            /* transient; keep last-known */
          }
        })();
      }, interval);
    } catch (err) {
      stopSocket();
      statusBar.setState("offline");
      pipeline.setConnected(false);
      if (err instanceof FactoryHttpError && err.isUnauthorized) {
        const pick = await vscode.window.showWarningMessage(
          `Factory: CFactory rejected the request (HTTP ${err.status}). Set a token?`,
          "Set Token",
        );
        if (pick === "Set Token" && (await auth.promptAndStore())) {
          void connect();
        }
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        output.appendLine(`Connect failed: ${detail}`);
        vscode.window.showErrorMessage(`Factory: could not connect to ${cfg.cfactoryUrl}. ${detail}`);
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("factory.connect", connect),
    vscode.commands.registerCommand("factory.refresh", () => void connect()),
    vscode.commands.registerCommand("factory.openCockpit", () => CockpitPanel.show(context, store, consoleConnector)),
    vscode.commands.registerCommand("factory.openConsole", (arg?: WorkItemNode | string) => {
      const key = keyOf(arg);
      const panel = CockpitPanel.show(context, store, consoleConnector);
      if (key) {
        panel.openConsole(key);
      } else {
        vscode.window.showInformationMessage("Factory: select a work item to open its console.");
      }
    }),
    vscode.commands.registerCommand("factory.openWorkItemOnGitHub", (arg?: WorkItemNode | string) => {
      const key = keyOf(arg);
      const repo = readConfig().githubRepo;
      if (key && repo && /^\d+$/.test(key)) {
        void vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${repo}/issues/${key}`));
      } else if (key && !repo) {
        vscode.window.showWarningMessage("Factory: set 'factory.githubRepo' (owner/repo) to open work items on GitHub.");
      } else {
        vscode.window.showInformationMessage("Factory: no work item selected.");
      }
    }),
    vscode.commands.registerCommand("factory.setToken", async () => {
      if (await auth.promptAndStore()) {
        vscode.window.showInformationMessage("Factory: CFactory token updated.");
        void connect();
      }
    }),
    vscode.commands.registerCommand("factory.connectViaBrowser", () => void connectViaBrowser()),
    vscode.commands.registerCommand("factory.getToken", async () => {
      const cfg = readConfig();
      await vscode.env.openExternal(vscode.Uri.parse(`${cfg.cfactoryUrl}/settings/token`));
      vscode.window.showInformationMessage(
        "Factory: opened the CFactory token page. Copy the token, then run 'Factory: Set CFactory Token'.",
      );
    }),
    vscode.commands.registerCommand("factory.login", async () => {
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Factory: Opening Keycloak login…", cancellable: false },
          async () => auth.loginWithKeycloak()
        );
        vscode.window.showInformationMessage("Factory: Logged in via Keycloak.");
        void connect();
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: Login failed — ${(err as Error).message}`);
      }
    }),
    vscode.commands.registerCommand("factory.logout", async () => {
      await auth.logout();
      vscode.window.showInformationMessage("Factory: Logged out.");
    }),
  );

  // ── Handover commands ───────────────────────────────────────────────────────
  const handover = new HandoverWorkflow(auth, context);

  // globalState key holding the last plan session id (for Resume Plan Session).
  const PLAN_SESSION_KEY = "factory.lastPlanSession";

  /** Show the plan preview and, on approval, emit the selected issues. */
  async function emitFromPreview(session: import("./handover/client").PlanSession): Promise<void> {
    const decision = await showPlanPreview(context, session);
    if (decision.action !== "approve") {
      vscode.window.showInformationMessage("Factory: plan discarded.");
      return;
    }
    const result = await handover.approvePlanSession(session.id, decision.issues);
    void context.globalState.update(PLAN_SESSION_KEY, undefined);
    vscode.window.showInformationMessage(`Factory: plan emitted — ${result.count} GitHub issue(s) created.`);
  }

  const FACTORY_LABEL = { aifactory: "AIFactory", tfactory: "TFactory" } as const;

  /**
   * Capture a multi-paragraph description in a real editor buffer instead of a
   * single-line input box: opens an untitled markdown document pre-filled with
   * the active editor selection, then waits for the user to confirm via a
   * notification button. Returns the body with the instruction comment stripped,
   * or undefined if cancelled.
   */
  async function captureDescription(opts: { instruction: string; submitLabel: string }): Promise<string | undefined> {
    const active = vscode.window.activeTextEditor;
    const selection = active && !active.selection.isEmpty ? active.document.getText(active.selection) : "";
    const header = `<!-- ${opts.instruction}\n     Write below, then click "${opts.submitLabel}". You can close this buffer without saving. -->\n\n`;
    const doc = await vscode.workspace.openTextDocument({ content: header + selection, language: "markdown" });
    await vscode.window.showTextDocument(doc, { preview: false });
    const pick = await vscode.window.showInformationMessage(
      `Factory: ${opts.instruction}`,
      { modal: false },
      opts.submitLabel,
      "Cancel",
    );
    if (pick !== opts.submitLabel) { return undefined; }
    const body = doc.getText().replace(/<!--[\s\S]*?-->/g, "").trim();
    return body || undefined;
  }

  async function promptIssueNumber(): Promise<number | undefined> {
    const input = await vscode.window.showInputBox({ title: "Factory: issue number", prompt: "Enter the GitHub issue number", validateInput: (v) => /^\d+$/.test(v.trim()) ? undefined : "Must be a number" });
    return input ? parseInt(input.trim(), 10) : undefined;
  }

  async function pickIssueNumber(preselectedKey?: string): Promise<number | undefined> {
    if (preselectedKey) {
      const n = parseCorrelationKey(preselectedKey).seq;
      if (n !== undefined) { return n; }
    }
    const items = store.getItems().map((it) => {
      const { seq, label } = parseCorrelationKey(it.correlation_key);
      return { label, description: it.title ?? "", num: seq };
    });
    const manual: vscode.QuickPickItem = { label: "$(edit)  Enter issue number manually…", description: "" };
    const pick = await vscode.window.showQuickPick([...items, manual], { title: "Factory: select work item" });
    if (!pick) { return undefined; }
    if (pick === manual) {
      return promptIssueNumber();
    }
    // An item without a numeric issue number can't be sent directly — fall
    // through to manual entry instead of silently doing nothing.
    const num = (pick as typeof items[number]).num;
    if (num === undefined) {
      vscode.window.showInformationMessage("Factory: that work item has no GitHub issue number — enter one manually.");
      return promptIssueNumber();
    }
    return num;
  }

  function registerSendCommand(id: string, factory: "aifactory" | "tfactory"): vscode.Disposable {
    const label = FACTORY_LABEL[factory];
    return vscode.commands.registerCommand(id, async (arg?: WorkItemNode | string) => {
      const num = await pickIssueNumber(keyOf(arg));
      if (num === undefined) { return; }
      try {
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Factory: sending #${num} to ${label}…`, cancellable: false }, () => handover.sendToFactory(factory, num));
        const detail = result.status === "started" ? "agent starting" : "queued (start not confirmed)";
        vscode.window.showInformationMessage(`Factory: task #${num} sent to ${label} — ${detail}.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: ${id} failed — ${(err as Error).message}`);
      }
    });
  }

  function registerCreateTaskCommand(
    id: string,
    factory: "aifactory" | "tfactory",
    titlePrompt: { title: string; placeHolder: string },
    descPrompt: { title: string; prompt: string; placeHolder: string },
  ): vscode.Disposable {
    const label = FACTORY_LABEL[factory];
    return vscode.commands.registerCommand(id, async () => {
      const title = await vscode.window.showInputBox({ title: titlePrompt.title, prompt: "Short title", placeHolder: titlePrompt.placeHolder });
      if (!title?.trim()) { return; }
      const description = await captureDescription({
        instruction: descPrompt.prompt,
        submitLabel: `Send to ${label}`,
      });
      if (!description?.trim()) { return; }
      try {
        const task = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Factory: creating ${label} task…`, cancellable: false },
          () => handover.createDirectTask(factory, title.trim(), description.trim()),
        );
        const pick = await vscode.window.showInformationMessage(`Factory: ${label} task created — ${task.id.slice(0, 8)}…`, "Review Task");
        if (pick === "Review Task") {
          const client = handover.getFactoryClient(factory);
          HumanReviewPanel.show(context, client, task, label);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: ${id} failed — ${(err as Error).message}`);
      }
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("factory.createPlan", async () => {
      const title = await vscode.window.showInputBox({ title: "Factory: plan title (optional)", prompt: "Short title for the plan — leave blank to auto-generate." });
      if (title === undefined) { return; }
      const text = await captureDescription({
        instruction: "Describe the work for PFactory to plan (a description, user story, or requirements).",
        submitLabel: "Send to PFactory",
      });
      if (!text?.trim()) { return; }
      try {
        const session = await handover.startPlanSession(
          text.trim(),
          title.trim() || undefined,
          // Persist the session id so it can be resumed after a window reload.
          (id) => void context.globalState.update(PLAN_SESSION_KEY, id),
        );
        await emitFromPreview(session);
      } catch (err) {
        if (err instanceof vscode.CancellationError) {
          vscode.window.showInformationMessage("Factory: plan processing cancelled.");
          return;
        }
        vscode.window.showErrorMessage(`Factory: createPlan failed — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("factory.resumePlanSession", async () => {
      const id = context.globalState.get<string>(PLAN_SESSION_KEY);
      if (!id) {
        vscode.window.showInformationMessage("Factory: no plan session to resume.");
        return;
      }
      try {
        const session = await handover.getPlanSession(id);
        if (session.status !== "ready" && session.status !== "approved") {
          vscode.window.showInformationMessage(`Factory: plan session is not ready yet (status: ${session.status}).`);
          return;
        }
        await emitFromPreview(session);
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: could not resume plan — ${(err as Error).message}`);
      }
    }),

    registerSendCommand("factory.sendToCode", "aifactory"),
    registerSendCommand("factory.sendToTest", "tfactory"),

    vscode.commands.registerCommand("factory.onboardProject", async () => {
      try {
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Factory: registering project…", cancellable: false }, () => handover.onboardCurrentWorkspace());
        vscode.window.showInformationMessage(`Factory: project registered (${result.remoteUrl}) — ready for Send to Code and Send to Test.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: onboard failed — ${(err as Error).message}`);
      }
    }),

    registerCreateTaskCommand(
      "factory.createCodeTask", "aifactory",
      { title: "New Code Task — Title", placeHolder: "Implement feature X" },
      { title: "New Code Task — Description", prompt: "Describe what the agent should code", placeHolder: "Create a REST endpoint that…" },
    ),

    registerCreateTaskCommand(
      "factory.createTestTask", "tfactory",
      { title: "New Test Task — Title", placeHolder: "Test feature X" },
      { title: "New Test Task — Description", prompt: "Describe what TFactory should test", placeHolder: "Verify that the REST endpoint handles…" },
    ),

    // ── Human review ────────────────────────────────────────────────────────

    vscode.commands.registerCommand("factory.reviewTask", async (arg?: WorkItemNode | string) => {
      const resolved = await resolveActiveTaskFromArg(arg, { title: "Factory: select task to review" });
      if (resolved) {
        HumanReviewPanel.show(context, resolved.client, resolved.task, resolved.label);
      }
    }),

    // ── Task control: stop / logs ─────────────────────────────────────────────

    vscode.commands.registerCommand("factory.stopTask", async (arg?: WorkItemNode | string) => {
      const resolved = await resolveActiveTaskFromArg(arg, { title: "Factory: select task to stop" });
      if (!resolved) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Factory: stop the ${resolved.label} agent for "${resolved.task.title ?? resolved.task.id.slice(0, 8)}"?`,
        { modal: true },
        "Stop Agent",
      );
      if (confirm !== "Stop Agent") { return; }
      try {
        await resolved.client.stopTask(resolved.task.id);
        vscode.window.showInformationMessage(`Factory: ${resolved.label} agent stopped.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: could not stop task — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("factory.viewLogs", async (arg?: WorkItemNode | string) => {
      const resolved = await resolveActiveTaskFromArg(arg, { title: "Factory: select task to view logs" });
      if (!resolved) { return; }
      try {
        const logs = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Factory: fetching logs…", cancellable: false },
          () => resolved.client.getTaskLogs(resolved.task.id),
        );
        const doc = await vscode.workspace.openTextDocument({
          content: logs || "(no logs returned)",
          language: "log",
        });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
      } catch (err) {
        vscode.window.showErrorMessage(`Factory: could not load logs — ${(err as Error).message}`);
      }
    }),

    // ── Connection & project registry control ─────────────────────────────────

    vscode.commands.registerCommand("factory.toggleMute", (arg?: WorkItemNode | string) => {
      const key = keyOf(arg);
      if (!key) {
        vscode.window.showInformationMessage("Factory: select a work item to mute or unmute.");
        return;
      }
      const nowMuted = !isMutedItem(key);
      setMutedItem(key, nowMuted);
      vscode.window.showInformationMessage(
        `Factory: notifications ${nowMuted ? "muted" : "unmuted"} for ${parseCorrelationKey(key).label}.`,
      );
    }),

    vscode.commands.registerCommand("factory.disconnect", () => {
      stopSocket();
      statusBar.setState("offline");
      pipeline.setConnected(false);
      store.clear();
      output.appendLine("Disconnected by user.");
      vscode.window.showInformationMessage("Factory: disconnected.");
    }),

    vscode.commands.registerCommand("factory.showProject", async () => {
      const entries = handover.registryEntries();
      if (!entries.length) {
        vscode.window.showInformationMessage("Factory: no projects registered yet.");
        return;
      }
      const picks = entries.map((e) => ({
        label: e.remoteUrl,
        description: [e.aifactory ? `AI ${e.aifactory.slice(0, 8)}` : "", e.tfactory ? `T ${e.tfactory.slice(0, 8)}` : ""].filter(Boolean).join("  ·  "),
        remoteUrl: e.remoteUrl,
      }));
      const chosen = await vscode.window.showQuickPick(picks, { title: "Factory: registered projects — pick to forget" });
      if (!chosen) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Factory: forget the registration for ${chosen.remoteUrl}? The next Send to Code/Test will re-register it.`,
        { modal: true },
        "Forget",
      );
      if (confirm === "Forget") {
        handover.forgetProject(chosen.remoteUrl);
        vscode.window.showInformationMessage("Factory: project registration forgotten.");
      }
    }),
  );

  /**
   * Resolve a work item (from a tree node, key, or a quick-pick) and its active
   * factory task. Shared by the review / stop / logs commands. Shows the
   * appropriate message and returns undefined when nothing is resolvable.
   */
  async function resolveActiveTaskFromArg(
    arg: WorkItemNode | string | undefined,
    opts: { title: string },
  ): Promise<{ client: AgentFactoryClient; task: Task; label: "AIFactory" | "TFactory" } | undefined> {
    const key = keyOf(arg);
    const items = store.getItems();
    let item = key ? items.find((i) => i.correlation_key === key) : undefined;

    if (!item) {
      const withTasks = items.filter((i) => i.aifactory.task_id || i.tfactory.task_id);
      const all = withTasks.length ? withTasks : items;
      if (!all.length) {
        vscode.window.showInformationMessage("Factory: no active tasks.");
        return undefined;
      }
      const picks = all.map((i) => ({
        label: parseCorrelationKey(i.correlation_key).label,
        description: i.title ?? "",
        item: i,
      }));
      const chosen = await vscode.window.showQuickPick(picks, { title: opts.title });
      if (!chosen) { return undefined; }
      item = chosen.item;
    }

    const resolved = handover.resolveActiveTask(
      item.aifactory.task_id, item.tfactory.task_id,
      item.aifactory.status,  item.tfactory.status,
    );
    if (!resolved) {
      vscode.window.showInformationMessage("Factory: no active task found for this work item.");
      return undefined;
    }

    const client = handover.getFactoryClient(resolved.factory);
    try {
      const task = await client.getTask(resolved.taskId);
      return { client, task, label: FACTORY_LABEL[resolved.factory] };
    } catch (err) {
      vscode.window.showErrorMessage(`Factory: could not load task — ${(err as Error).message}`);
      return undefined;
    }
  }

  // ── Connect via browser (deep-link token hand-off) ──────────────────────────
  // The user is already logged into the CFactory web UI; this asks CFactory to
  // redirect back to the editor with a token, so there is nothing to copy/paste.
  // A random `state` nonce ties the redirect to this request so a stray page
  // cannot inject a token. See the CFactory contract in issue #47.
  let pendingAuthState: string | undefined;

  async function connectViaBrowser(): Promise<void> {
    const cfg = readConfig();
    pendingAuthState = makeNonce();
    // uriScheme adapts to the host editor (vscode / vscodium / cursor / …).
    const callback = await vscode.env.asExternalUri(
      vscode.Uri.parse(`${vscode.env.uriScheme}://olafkfreund.factory-vscode/auth-callback`),
    );
    const target = vscode.Uri.parse(
      `${cfg.cfactoryUrl}/connect/vscode?redirect=${encodeURIComponent(callback.toString())}&state=${pendingAuthState}`,
    );
    const opened = await vscode.env.openExternal(target);
    if (opened) {
      vscode.window.showInformationMessage(
        "Factory: complete the connection in your browser — the editor will pick up the token automatically.",
      );
    } else {
      pendingAuthState = undefined;
      vscode.window.showErrorMessage("Factory: could not open the browser for CFactory login.");
    }
  }

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: (uri) => {
        if (uri.path !== "/auth-callback") {
          return;
        }
        const params = new URLSearchParams(uri.query);
        const token = params.get("token") ?? "";
        const state = params.get("state") ?? "";
        // Reject if we never initiated, or the nonce does not match.
        if (!pendingAuthState || state !== pendingAuthState) {
          vscode.window.showWarningMessage("Factory: ignored an unexpected auth callback (state mismatch).");
          return;
        }
        pendingAuthState = undefined;
        if (!token) {
          vscode.window.showErrorMessage("Factory: the auth callback did not include a token.");
          return;
        }
        void (async () => {
          await auth.setToken(token);
          output.appendLine("Received CFactory token via browser deep link.");
          vscode.window.showInformationMessage("Factory: connected via browser.");
          void connect();
        })();
      },
    }),
  );

  // Only reconnect when a connection-relevant setting changes, and only if the
  // user actually wants to be connected. Changing notification level, console
  // scrollback, etc. must not drop the live feed.
  context.subscriptions.push(
    onConfigChange((e) => {
      if (affectsConnection(e) && readConfig().autoConnect) {
        void connect();
      }
    }),
  );

  if (readConfig().autoConnect) {
    void connect();
  }
}

export function deactivate(): void {
  // Disposables registered on the context are cleaned up by VS Code.
}

/** Anomalies are best-effort; never fail a connect because of them. */
async function safeAnomalies(client: RestClient) {
  try {
    return await client.anomalies();
  } catch {
    return [];
  }
}
