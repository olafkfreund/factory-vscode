import * as vscode from "vscode";
import { readConfig, onConfigChange } from "./config";
import { Auth } from "./auth";
import { RestClient, FactoryHttpError } from "./cfactory/restClient";
import { FactoryPipelineProvider } from "./pipelineView";
import { CockpitPanel } from "./cockpitPanel";
import { FactoryStatusBar } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Factory");
  const statusBar = new FactoryStatusBar();
  const pipeline = new FactoryPipelineProvider();
  const auth = new Auth(context.secrets);

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerTreeDataProvider("factory.pipeline", pipeline),
  );

  /** Build a client bound to the current config + stored token. */
  const makeClient = (): RestClient => {
    const cfg = readConfig();
    return new RestClient({ baseUrl: cfg.cfactoryUrl, getToken: () => auth.getToken() });
  };

  // Connect: verify connectivity (health) and prove the data path (workitems).
  // The live WebSocket subscription and the rich tree land in issues #4 and #5.
  const connect = async () => {
    const cfg = readConfig();
    statusBar.setState("connecting");
    pipeline.setConnected(false);
    const client = makeClient();
    try {
      const health = await client.health();
      const items = await client.workItems();
      statusBar.setState("connected");
      pipeline.setConnected(true);
      output.appendLine(
        `Connected to CFactory ${health.service} v${health.version} at ${cfg.cfactoryUrl} — ${items.length} work item(s).`,
      );
      vscode.window.setStatusBarMessage(`Factory: connected (${items.length} work items)`, 4000);
    } catch (err) {
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
    vscode.commands.registerCommand("factory.refresh", () => {
      pipeline.refresh();
      void connect();
    }),
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
