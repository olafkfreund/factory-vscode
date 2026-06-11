import type { Anomaly, WorkItem } from "../cfactory/types";

/** View model the host pushes to the cockpit webview. */
export interface CockpitState {
  items: WorkItem[];
  progress: Record<string, number | null>;
  anomalies: Anomaly[];
}

/** Host -> webview messages. */
export type HostToWebview = { type: "state"; state: CockpitState };

/** Webview -> host messages. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "openConsole"; key: string }
  | { type: "openOnGitHub"; key: string };
