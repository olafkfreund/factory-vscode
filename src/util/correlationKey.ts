/**
 * Parse a Factory RFC-0001 correlation key into its human-readable parts.
 *
 * Supported formats:
 *   "96b8b14b-...:015-eks-tic-tac-toe"  →  { seq: 15, label: "#015" }
 *   "009-eks-tic-tac-toe"               →  { seq: 9,  label: "#009" }
 *   "142"                               →  { seq: 142, label: "#142" }
 *   "abc123" (no leading digits)        →  { seq: undefined, label: "#abc123" }
 */
export function parseCorrelationKey(key: string): { seq: number | undefined; label: string } {
  const afterColon = key.includes(":") ? key.split(":").pop()! : key;
  const m = afterColon.match(/^#?(\d+)/);
  if (m) {
    return { seq: parseInt(m[1], 10), label: `#${m[1]}` };
  }
  return { seq: undefined, label: `#${key.slice(0, 8)}` };
}

/** Convenience wrapper returning just the short display label. */
export function shortLabel(key: string): string {
  return parseCorrelationKey(key).label;
}
