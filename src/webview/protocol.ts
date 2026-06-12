import type { Anomaly, WorkItem } from "../cfactory/types";

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
