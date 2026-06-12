import * as vscode from "vscode";

export type NotificationLevel = "off" | "important" | "all";

export type EventKind = "new" | "complete" | "failed" | "review" | "anomaly";

export interface FactoryConfig {
  cfactoryUrl: string;
  autoConnect: boolean;
  githubRepo: string;
  notificationLevel: NotificationLevel;
  /** Event kinds the user has muted globally, regardless of level. */
  mutedKinds: EventKind[];
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
    githubRepo: (c.get<string>("githubRepo") ?? "").trim().replace(/^\/+|\/+$/g, ""),
    notificationLevel: c.get<NotificationLevel>("notifications.level") ?? "important",
    mutedKinds: c.get<EventKind[]>("notifications.mutedKinds") ?? [],
    consoleMaxLines: c.get<number>("console.maxLines") ?? 5000,
    pollIntervalMs: c.get<number>("poll.intervalMs") ?? 5000,
  };
}

/** Fire `cb` whenever any `factory.*` setting changes. */
export function onConfigChange(cb: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      cb(e);
    }
  });
}

/**
 * Settings that change *where* or *how* the extension connects to CFactory.
 * Only these warrant tearing down and re-establishing the live connection.
 */
const CONNECTION_KEYS = [
  "factory.cfactoryUrl",
  "factory.cfactoryToken",
  "factory.keycloak.issuerUrl",
  "factory.keycloak.clientId",
] as const;

/** True if a configuration change touched any connection-relevant setting. */
export function affectsConnection(e: vscode.ConfigurationChangeEvent): boolean {
  return CONNECTION_KEYS.some((k) => e.affectsConfiguration(k));
}

export const TOKEN_SECRET_KEY = "factory.cfactoryToken";
