import * as vscode from "vscode";
import { TOKEN_SECRET_KEY } from "./config";
import * as oidc from "./auth/oidc";

/**
 * Token resolution order:
 *   1. Keycloak OIDC session (auto-refreshed, stored in SecretStorage as JSON)
 *   2. factory.cfactoryToken setting (plaintext fallback for CI/scripted envs)
 *   3. Legacy SecretStorage bearer token (set via Factory: Set Token)
 */
export class Auth {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getToken(): Promise<string | undefined> {
    // 1. OIDC session
    const cfg = vscode.workspace.getConfiguration("factory");
    const issuerUrl = cfg.get<string>("keycloak.issuerUrl") ?? "";
    const clientId = cfg.get<string>("keycloak.clientId") ?? "cfactory";

    if (issuerUrl) {
      const tokens = await oidc.loadTokens(this.secrets);
      if (tokens) {
        if (Date.now() < tokens.expiresAt) {
          return tokens.accessToken;
        }
        // Try refresh
        try {
          const refreshed = await oidc.refresh(issuerUrl, clientId, tokens, this.secrets);
          return refreshed.accessToken;
        } catch {
          // Refresh failed — fall through to other methods
          await oidc.clearTokens(this.secrets);
        }
      }
    }

    // 2. Plaintext settings token
    const fromSettings = cfg.get<string>("cfactoryToken");
    if (fromSettings?.trim()) {
      return fromSettings.trim();
    }

    // 3. Legacy SecretStorage token
    return this.secrets.get(TOKEN_SECRET_KEY);
  }

  /** Trigger the Keycloak browser login flow. */
  async loginWithKeycloak(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("factory");
    const issuerUrl = cfg.get<string>("keycloak.issuerUrl") ?? "";
    const clientId = cfg.get<string>("keycloak.clientId") ?? "cfactory";

    if (!issuerUrl) {
      throw new Error(
        "factory.keycloak.issuerUrl is not configured. Set it to your Keycloak realm URL."
      );
    }

    await oidc.login(issuerUrl, clientId, this.secrets);
  }

  async logout(): Promise<void> {
    await oidc.clearTokens(this.secrets);
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_SECRET_KEY, token);
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  /** Prompt the user for a bearer token and store it. Returns true if saved. */
  async promptAndStore(): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      prompt: "CFactory bearer token (leave empty to clear)",
      password: true,
      ignoreFocusOut: true,
    });
    if (token === undefined) { return false; }
    if (token === "") {
      await this.clearToken();
    } else {
      await this.setToken(token);
    }
    return true;
  }
}
