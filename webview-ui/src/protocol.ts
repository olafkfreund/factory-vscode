// Mirror of the host's webview protocol (kept in sync with src/webview/protocol.ts).

export interface TokenUsage {
  total_tokens: number;
  cost_usd: number;
}

export interface ServiceState {
  task_id: string | null;
  status: string | null;
  phase: string | null;
  usage?: TokenUsage | null;
}

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

export interface CockpitState {
  items: WorkItem[];
  progress: Record<string, number | null>;
  anomalies: Anomaly[];
  /** Animation intensity from factory.cockpit.animations. */
  animations: "full" | "subtle" | "off";
}

export type ConsoleStatus = "open" | "closed";

export type HostToWebview =
  | { type: "state"; state: CockpitState }
  | { type: "consoleOpen"; key: string }
  | { type: "console"; key: string; data: string }
  | { type: "consoleStatus"; key: string; status: ConsoleStatus };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "openConsole"; key: string }
  | { type: "closeConsole" }
  | { type: "openOnGitHub"; key: string };

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cached: VsCodeApi | undefined;
export function vscodeApi(): VsCodeApi {
  if (!cached) {
    cached = acquireVsCodeApi();
  }
  return cached;
}
