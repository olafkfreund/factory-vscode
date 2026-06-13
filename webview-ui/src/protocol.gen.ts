// CANONICAL SOURCE — do not edit the synced copy.
// This file is the single source of truth for the host <-> cockpit-webview
// message contract. The webview is a separate Vite project and cannot import
// from ../src, so this file is copied verbatim to webview-ui/src/protocol.gen.ts
// by `npm run sync:shared`. A drift test (test/drift.test.ts) fails CI if they
// diverge. Keep it self-contained (no imports) so the copy type-checks
// standalone — the view-model types below intentionally mirror the relevant
// fields of the CFactory types the host pushes.

export interface TokenUsage {
  total_tokens: number;
  cost_usd: number;
}

/** Per-service slice of a work item (pfactory / aifactory / tfactory). */
export interface ServiceState {
  task_id: string | null;
  status: string | null;
  phase: string | null;
  usage?: TokenUsage | null;
}

/** Work item as rendered by the cockpit (subset of the CFactory WorkItem). */
export interface WorkItem {
  correlation_key: string;
  title: string | null;
  pfactory: ServiceState;
  aifactory: ServiceState;
  tfactory: ServiceState;
}

export interface Anomaly {
  kind: string;
  severity: string;
  correlation_key: string;
  title: string | null;
  detail: string;
}

/** View model the host pushes to the cockpit webview. */
export interface CockpitState {
  items: WorkItem[];
  progress: Record<string, number | null>;
  anomalies: Anomaly[];
  /** Animation intensity from factory.cockpit.animations. */
  animations: "full" | "subtle" | "off";
}

export type ConsoleStatus = "open" | "closed";

/** Host -> webview messages. */
export type HostToWebview =
  | { type: "state"; state: CockpitState }
  | { type: "consoleOpen"; key: string }
  | { type: "console"; key: string; data: string } // base64-encoded ANSI bytes
  | { type: "consoleStatus"; key: string; status: ConsoleStatus };

/** Webview -> host messages. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "openConsole"; key: string }
  | { type: "closeConsole" }
  | { type: "openOnGitHub"; key: string };
