import { test } from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "../src/state/store";
import type { WorkItem } from "../src/cfactory/types";

function wi(key: string, title = "t"): WorkItem {
  return {
    correlation_key: key,
    title,
    pfactory: { task_id: null, status: "emitted", phase: "emit" },
    aifactory: { task_id: null, status: null, phase: null },
    tfactory: { task_id: null, status: null, phase: null },
    timeline: [],
  };
}

test("hydrate replaces items and sorts numeric keys", () => {
  const s = new StateStore();
  s.hydrate([wi("12"), wi("2"), wi("142")]);
  assert.deepEqual(s.getItems().map((i) => i.correlation_key), ["2", "12", "142"]);
  assert.equal(s.size, 3);
});

test("upsert adds and updates", () => {
  const s = new StateStore();
  s.upsert(wi("5", "first"));
  s.upsert(wi("5", "second"));
  assert.equal(s.size, 1);
  assert.equal(s.get("5")?.title, "second");
});

test("applyProgress drives runningCount and getProgress", () => {
  const s = new StateStore();
  s.hydrate([wi("7")]);
  assert.equal(s.runningCount, 0);
  s.applyProgress({ correlation_key: "7", service: "aifactory", phase: "act", percent: 40, updated_at: "" });
  assert.equal(s.runningCount, 1);
  assert.equal(s.getProgress("7")?.percent, 40);
});

test("hydrate prunes progress for vanished keys", () => {
  const s = new StateStore();
  s.hydrate([wi("7")]);
  s.applyProgress({ correlation_key: "7", service: "aifactory", phase: "act", percent: 40, updated_at: "" });
  s.hydrate([wi("8")]);
  assert.equal(s.runningCount, 0);
});

test("applyFeed handles snapshot, workitem, progress", () => {
  const s = new StateStore();
  s.applyFeed({ type: "snapshot", items: [wi("1"), wi("2")] });
  assert.equal(s.size, 2);
  s.applyFeed({ type: "workitem", item: wi("3") });
  assert.equal(s.size, 3);
  s.applyFeed({ type: "progress", item: { correlation_key: "3", service: "aifactory", phase: "act", percent: 10, updated_at: "" } });
  assert.equal(s.runningCount, 1);
});

test("change event fires on mutation", () => {
  const s = new StateStore();
  let count = 0;
  s.on("change", () => count++);
  s.hydrate([wi("1")]);
  s.upsert(wi("2"));
  assert.ok(count >= 2);
});

test("setAnomalies updates count", () => {
  const s = new StateStore();
  s.setAnomalies([{ kind: "stuck", severity: "high", correlation_key: "1", title: null, detail: "x" }]);
  assert.equal(s.anomalyCount, 1);
});
