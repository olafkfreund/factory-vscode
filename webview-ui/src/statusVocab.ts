// CANONICAL SOURCE — do not edit the synced copy.
// This file is the single source of truth for the status vocabulary shared
// between the host (src/status.ts) and the webview (webview-ui/src). The
// webview is a separate Vite project and cannot import from ../src, so this
// file is copied verbatim to webview-ui/src/statusVocab.ts by `npm run
// sync:shared`. A drift test (test/drift.test.ts) fails CI if they diverge.
// Keep it self-contained (no imports) so the copy type-checks standalone.

/** Normalised status categories used for icons, colours, and counts. */
export type StatusCategory = "running" | "done" | "failed" | "review" | "pending";

/**
 * Map a per-service status string (vocabulary varies per factory) to a
 * category. Substring matching keeps this robust to new status names.
 * Pure (no vscode) so it is unit-testable and webview-portable.
 */
export function classifyStatus(status: string | null | undefined): StatusCategory {
  if (!status) {
    return "pending";
  }
  const s = status.toLowerCase();
  if (/(fail|reject|error|block|stuck|cancel)/.test(s)) {
    return "failed";
  }
  if (/review/.test(s)) {
    return "review";
  }
  if (/(done|complete|merged|emitted|triaged|pass|success|verified)/.test(s)) {
    return "done";
  }
  // A present, non-terminal status means work is in flight.
  return "running";
}
