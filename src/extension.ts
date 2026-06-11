import * as vscode from "vscode";
import { readConfig, onConfigChange } from "./config";
import { Auth } from "./auth";
import { RestClient, FactoryHttpError } from "./cfactory/restClient";
import { LiveSocket } from "./cfactory/liveSocket";
import { StateStore } from "./state/store";
import { FactoryPipelineProvider, WorkItemNode } from "./pipelineView";
import { CockpitPanel, type ConsoleConnector } from "./cockpitPanel";
import { ConsoleSocket } from "./cfactory/consoleSocket";
import { FactoryStatusBar } from "./statusBar";
import { Notifier } from "./notify/notifier";

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
  const notifier = new Notifier(store);
  context.subscriptions.push(notifier);

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
      store.hydrate(items);
      store.setAnomalies(anomalies);
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
  );

  context.subscriptions.push(onConfigChange(() => void connect()));

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
