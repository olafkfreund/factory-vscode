import * as vscode from "vscode";
import { readConfig, onConfigChange } from "../config";
import type { Auth } from "../auth";
import { cfactoryMcpUrl, mcpHeaders } from "./url";

/**
 * Register CFactory's HTTP MCP server with the IDE assistant, so it can answer
 * pipeline questions (where is #142, why is it stuck) via the cfactory_* tools.
 *
 * The MCP provider API is newer than this extension's engine floor and is
 * absent in some compatible IDEs, so we feature-detect and no-op gracefully.
 * Returns true if a provider was registered.
 */
export function registerCfactoryMcp(context: vscode.ExtensionContext, auth: Auth): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lm = (vscode as any).lm;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const McpHttp = (vscode as any).McpHttpServerDefinition;
  if (!lm || typeof lm.registerMcpServerDefinitionProvider !== "function" || !McpHttp) {
    return false; // IDE without the MCP provider API
  }

  const didChange = new vscode.EventEmitter<void>();
  const provider = {
    onDidChangeMcpServerDefinitions: didChange.event,
    provideMcpServerDefinitions: async () => {
      const cfg = readConfig();
      const token = await auth.getToken();
      return [new McpHttp("CFactory", vscode.Uri.parse(cfactoryMcpUrl(cfg.cfactoryUrl)), mcpHeaders(token))];
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveMcpServerDefinition: (server: any) => server,
  };

  try {
    context.subscriptions.push(lm.registerMcpServerDefinitionProvider("factory.cfactory", provider));
    context.subscriptions.push(didChange, onConfigChange(() => didChange.fire()));
    return true;
  } catch {
    // Provider id not declared in contributes, or API mismatch.
    return false;
  }
}
