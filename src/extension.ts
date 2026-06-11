import * as vscode from "vscode";
import { readConfig, onConfigChange, TOKEN_SECRET_KEY } from "./config";
import { FactoryPipelineProvider } from "./pipelineView";
import { CockpitPanel } from "./cockpitPanel";
import { FactoryStatusBar } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new FactoryStatusBar();
  const pipeline = new FactoryPipelineProvider();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider("factory.pipeline", pipeline),
  );

  // Connect: the scaffold flips connection state and surfaces the target URL.
  // The real REST hydrate + WebSocket subscription land in issues #3 and #4.
  const connect = async () => {
    const cfg = readConfig();
    statusBar.setState("connecting");
    pipeline.setConnected(false);
    statusBar.setState("connected");
    pipeline.setConnected(true);
    vscode.window.setStatusBarMessage(`Factory: targeting ${cfg.cfactoryUrl}`, 4000);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("factory.connect", connect),
    vscode.commands.registerCommand("factory.refresh", () => pipeline.refresh()),
    vscode.commands.registerCommand("factory.openCockpit", () => CockpitPanel.show(context)),
    vscode.commands.registerCommand("factory.openConsole", () => {
      vscode.window.showInformationMessage("Factory: the live agent console is implemented in the cockpit milestone.");
    }),
    vscode.commands.registerCommand("factory.openWorkItemOnGitHub", (url?: string) => {
      if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url));
      } else {
        vscode.window.showInformationMessage("Factory: no work item selected.");
      }
    }),
    vscode.commands.registerCommand("factory.setToken", async () => {
      const token = await vscode.window.showInputBox({
        prompt: "CFactory bearer token",
        password: true,
        ignoreFocusOut: true,
      });
      if (token !== undefined) {
        await context.secrets.store(TOKEN_SECRET_KEY, token);
        vscode.window.showInformationMessage("Factory: CFactory token saved.");
      }
    }),
  );

  context.subscriptions.push(onConfigChange(() => pipeline.refresh()));

  if (readConfig().autoConnect) {
    void connect();
  }
}

export function deactivate(): void {
  // Disposables registered on the context are cleaned up by VS Code.
}
