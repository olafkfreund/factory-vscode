import * as http from "http";
import * as crypto from "crypto";
import * as vscode from "vscode";

export interface OidcTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
}

const TOKENS_KEY = "factory.oidcTokens";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}



/** Full PKCE login flow — opens a browser, waits for callback, exchanges code for tokens. */
export async function login(
  issuerUrl: string,
  clientId: string,
  secrets: vscode.SecretStorage
): Promise<OidcTokens> {
  const state = base64url(crypto.randomBytes(16));
  const { verifier, challenge } = pkce();

  // Start callback server first to get the port.
  const port = await new Promise<number>((res, rej) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      res((s.address() as any).port);
      s.close();
    });
    s.on("error", rej);
  });
  const redirectUri = `http://localhost:${port}/callback`;

  // Start the real callback server.
  const codePromise = new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/callback") { res.writeHead(404); res.end(); return; }

      const error = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const html = (msg: string) =>
        `<html><body style="font-family:sans-serif;padding:2rem"><h2>${msg}</h2><p>You can close this tab.</p></body></html>`;

      if (error || returnedState !== state || !code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(html(`Login failed: ${error ?? "invalid state"}`));
        server.close();
        reject(new Error(error ?? "state mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html("Logged in to Factory — you can close this tab."));
      server.close();
      resolve(code);
    });

    server.listen(port, "127.0.0.1");
    server.on("error", reject);
    setTimeout(() => { server.close(); reject(new Error("Login timed out after 2 minutes")); }, 120_000);
  });

  // Open browser to Keycloak.
  const authUrl = new URL(`${issuerUrl}/protocol/openid-connect/auth`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

  const code = await codePromise;

  // Exchange code for tokens.
  const tokenUrl = `${issuerUrl}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Token exchange failed: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens: OidcTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 30_000, // 30s buffer
  };

  await secrets.store(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/** Refresh an expired access token using the stored refresh token. */
export async function refresh(
  issuerUrl: string,
  clientId: string,
  tokens: OidcTokens,
  secrets: vscode.SecretStorage
): Promise<OidcTokens> {
  const tokenUrl = `${issuerUrl}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: tokens.refreshToken,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Token refresh failed: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const updated: OidcTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 30_000,
  };

  await secrets.store(TOKENS_KEY, JSON.stringify(updated));
  return updated;
}

/** Load stored OIDC tokens (if any). */
export async function loadTokens(secrets: vscode.SecretStorage): Promise<OidcTokens | undefined> {
  const raw = await secrets.get(TOKENS_KEY);
  if (!raw) { return undefined; }
  try { return JSON.parse(raw) as OidcTokens; } catch { return undefined; }
}

/** Clear stored OIDC tokens (logout). */
export async function clearTokens(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(TOKENS_KEY);
}
