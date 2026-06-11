import * as vscode from "vscode";
import { readConfig, onConfigChange } from "./config";
import { Auth } from "./auth";
import { RestClient, FactoryHttpError } from "./cfactory/restClient";
import { LiveSocket } from "./cfactory/liveSocket";
import { StateStore } from "./state/store";
import { FactoryPipelineProvider } from "./pipelineView";
import { CockpitPanel } from "./cockpitPanel";
import { FactoryStatusBar } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Factory");
  const statusBar = new FactoryStatusBar();
  const store = new StateStore();
  const pipeline = new FactoryPipelineProvider(store);
  const auth = new Auth(context.secrets);

  let socket: LiveSocket | undefined;
  const stopSocket = () => {
    socket?.close();
    socket = undefined;
  };

  // Status bar tracks store counts on every change.
  store.on("change", () => statusBar.setCounts(store.runningCount, store.anomalyCount));

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerTreeDataProvider("factory.pipeline", pipeline),
    new vscode.Disposable(stopSocket),
  );

  const makeClient = (): RestClient => {
    const cfg = readConfig();
    return new RestClient({ baseUrl: cfg.cfactoryUrl, getToken: () => auth.getToken() });
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
    vscode.commands.registerCommand("factory.openCockpit", () => CockpitPanel.show(context)),
    vscode.commands.registerCommand("factory.openConsole", () => {
      vscode.window.showInformationMessage("Factory: the live agent console is implemented in the cockpit milestone.");
    }),
    vscode.commands.registerCommand("factory.openWorkItemOnGitHub", (url?: string) => {
      if (url) {
        void vscode.env.openExternal(vscode.Uri.parse(url));
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
