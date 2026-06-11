// Pure helpers for the CFactory MCP registration (no vscode dependency).

/** http(s)://host -> http(s)://host/mcp */
export function cfactoryMcpUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/mcp`;
}

/** Bearer auth headers for the MCP endpoint, or none when no token is set. */
export function mcpHeaders(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
