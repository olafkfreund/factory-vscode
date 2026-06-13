import * as vscode from "vscode";

/**
 * Derive the three factory base URLs from the CFactory URL.
 * The convention is that all factory services follow the same subdomain pattern:
 *   cfactory-mcp.freundcloud.org.uk  →  pfactory.freundcloud.org.uk
 *                                    →  aifactory.freundcloud.org.uk
 *                                    →  tfactory.freundcloud.org.uk
 *
 * Optional per-factory overrides in settings take precedence.
 */
export interface FactoryUrls {
  pfactory: string;
  aifactory: string;
  tfactory: string;
}

export function resolveFactoryUrls(cfactoryUrl: string): FactoryUrls {
  const cfg = vscode.workspace.getConfiguration("factory");

  function override(key: string, derived: string): string {
    const v = cfg.get<string>(key)?.trim();
    return v ? v.replace(/\/+$/, "") : derived;
  }

  const base = deriveBase(cfactoryUrl);
  return {
    pfactory:  override("pfactoryUrl",  base("pfactory")),
    aifactory: override("aifactoryUrl", base("aifactory")),
    tfactory:  override("tfactoryUrl",  base("tfactory")),
  };
}

function deriveBase(cfactoryUrl: string): (service: string) => string {
  try {
    const u      = new URL(cfactoryUrl);
    const labels = u.hostname.split(".");
    const domain = labels.slice(1).join(".");   // drop first label, keep rest
    return (svc) => `${u.protocol}//${svc}.${domain}`;
  } catch {
    // Fallback: substitute the word before the first dot
    return (svc) => cfactoryUrl.replace(/^(https?:\/\/)[^./]+/, `$1${svc}`);
  }
}
