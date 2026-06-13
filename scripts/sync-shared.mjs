#!/usr/bin/env node
// Copies canonical host source files into webview-ui/src so the separate Vite
// project can consume the same single source of truth without importing across
// project roots. The generated copies are committed (so typecheck works without
// a build) and verified by test/drift.test.ts. Run via `npm run sync:shared`
// (wired as a prebuild/pretest hook).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** canonical source -> generated webview copy */
export const SYNCED = [
  ["src/shared/statusVocab.ts", "webview-ui/src/statusVocab.ts"],
  ["src/webview/protocol.ts", "webview-ui/src/protocol.gen.ts"],
];

export function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function main() {
  for (const [from, to] of SYNCED) {
    const src = read(from);
    const dest = resolve(root, to);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, src);
    console.log(`synced ${from} -> ${to}`);
  }
}

// Only run the copy when executed directly, not when imported by the drift test.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
