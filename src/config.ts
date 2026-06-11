import * as vscode from "vscode";

export type NotificationLevel = "off" | "important" | "all";

export interface FactoryConfig {
  cfactoryUrl: string;
  autoConnect: boolean;
  notificationLevel: NotificationLevel;
  consoleMaxLines: number;
  pollIntervalMs: number;
}

const SECTION = "factory";

/** Read the current extension configuration. */
export function readConfig(): FactoryConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    cfactoryUrl: (c.get<string>("cfactoryUrl") ?? "http://localhost:3111").replace(/\/+$/, ""),
    autoConnect: c.get<boolean>("autoConnect") ?? true,
    notificationLevel: c.get<NotificationLevel>("notifications.level") ?? "important",
    consoleMaxLines: c.get<number>("console.maxLines") ?? 5000,
    pollIntervalMs: c.get<number>("poll.intervalMs") ?? 5000,
  };
}

/** Fire `cb` whenever any `factory.*` setting changes. */
export function onConfigChange(cb: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      cb();
    }
  });
}

export const TOKEN_SECRET_KEY = "factory.cfactoryToken";
