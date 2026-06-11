import * as vscode from "vscode";
import { TOKEN_SECRET_KEY } from "./config";

/** SecretStorage-backed CFactory bearer token. */
export class Auth {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  getToken(): Promise<string | undefined> {
    return Promise.resolve(this.secrets.get(TOKEN_SECRET_KEY));
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_SECRET_KEY, token);
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  /** Prompt the user for a token and store it. Returns true if a value was saved. */
  async promptAndStore(): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      prompt: "CFactory bearer token (leave empty to clear)",
      password: true,
      ignoreFocusOut: true,
    });
    if (token === undefined) {
      return false;
    }
    if (token === "") {
      await this.clearToken();
    } else {
      await this.setToken(token);
    }
    return true;
  }
}
