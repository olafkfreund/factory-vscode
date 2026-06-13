// The host <-> webview message contract is defined ONCE in
// src/webview/protocol.ts and synced into ./protocol.gen.ts by
// `npm run sync:shared` (run automatically via prebuild/pretest). Edit the
// canonical file, not protocol.gen.ts. This module re-exports those types and
// adds the webview-only VS Code API runtime helper.

export type {
  TokenUsage,
  ServiceState,
  WorkItem,
  Anomaly,
  CockpitState,
  ConsoleStatus,
  HostToWebview,
  WebviewToHost,
} from "./protocol.gen";

import type { WebviewToHost } from "./protocol.gen";

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
