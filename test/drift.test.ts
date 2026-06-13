import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error — plain .mjs helper, no type declarations needed for the test.
import { SYNCED, read } from "../scripts/sync-shared.mjs";

// Gap B / Gap A guard: the shared host source files (status vocab + webview
// protocol) are copied into webview-ui/src by `npm run sync:shared`. The copies
// are committed so the webview type-checks without a build step. If a developer
// edits the canonical file but forgets to re-sync, the committed copy diverges
// and the host/webview contracts silently drift apart. Fail CI when they do.
test("synced webview copies are identical to their canonical sources", () => {
  for (const [from, to] of SYNCED as Array<[string, string]>) {
    const canonical = read(from);
    const copy = read(to);
    assert.equal(
      copy,
      canonical,
      `${to} has drifted from canonical ${from}. Run \`npm run sync:shared\` and commit the result.`,
    );
  }
});
