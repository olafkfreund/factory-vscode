// Mirror of the host's webview protocol (kept in sync with src/webview/protocol.ts).

export interface ServiceState {
  task_id: string | null;
  status: string | null;
  phase: string | null;
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
}

export type HostToWebview = { type: "state"; state: CockpitState };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "openConsole"; key: string }
  | { type: "openOnGitHub"; key: string };

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cached: VsCodeApi | undefined;
export function vscodeApi(): VsCodeApi {
  if (!cached) {
    cached = acquireVsCodeApi();
  }
  return cached;
}
