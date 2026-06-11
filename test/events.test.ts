import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotOf, diffWorkItems, diffAnomalies } from "../src/notify/events";
import type { Anomaly, WorkItem } from "../src/cfactory/types";

function wi(key: string, p: string | null, a: string | null, t: string | null, title = "t"): WorkItem {
  return {
    correlation_key: key,
    title,
    pfactory: { task_id: null, status: p, phase: null },
    aifactory: { task_id: null, status: a, phase: null },
    tfactory: { task_id: null, status: t, phase: null },
    timeline: [],
  };
}

test("new work item emits a 'new' event", () => {
  const events = diffWorkItems(new Map(), [wi("1", "emitted", null, null)]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "new");
});

test("stage transitions emit failed/review/complete", () => {
  const prev = snapshotOf([wi("1", "emitted", "in_progress", null)]);
  // Code -> failed, Test -> review
  const events = diffWorkItems(prev, [wi("1", "emitted", "qa_failed", "human_review")]);
  const kinds = events.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["failed", "review"]);
});

test("unchanged state emits nothing (dedup)", () => {
  const items = [wi("1", "emitted", "merged", "triaged")];
  const prev = snapshotOf(items);
  assert.equal(diffWorkItems(prev, items).length, 0);
});

test("complete only fires when leaving a non-done state", () => {
  const prev = snapshotOf([wi("1", "emitted", "in_progress", null)]);
  const events = diffWorkItems(prev, [wi("1", "emitted", "merged", null)]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "complete");
  assert.equal(events[0].stage, "Code");
});

test("diffAnomalies fires once per signature", () => {
  const fired = new Set<string>();
  const anomalies: Anomaly[] = [{ kind: "stuck", severity: "high", correlation_key: "1", title: "t", detail: "no progress" }];
  assert.equal(diffAnomalies(fired, anomalies).length, 1);
  assert.equal(diffAnomalies(fired, anomalies).length, 0); // already fired
});
