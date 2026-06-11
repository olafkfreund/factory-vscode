import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStatus, activeStage } from "../src/status";
import type { WorkItem } from "../src/cfactory/types";

test("classifyStatus maps known vocabularies", () => {
  assert.equal(classifyStatus(null), "pending");
  assert.equal(classifyStatus("in_progress"), "running");
  assert.equal(classifyStatus("coding"), "running");
  assert.equal(classifyStatus("merged"), "done");
  assert.equal(classifyStatus("emitted"), "done");
  assert.equal(classifyStatus("triaged"), "done");
  assert.equal(classifyStatus("qa_failed"), "failed");
  assert.equal(classifyStatus("rejected"), "failed");
  assert.equal(classifyStatus("stuck"), "failed");
  assert.equal(classifyStatus("human_review"), "review");
});

function item(p: string | null, a: string | null, t: string | null): WorkItem {
  return {
    correlation_key: "1",
    title: "x",
    pfactory: { task_id: null, status: p, phase: null },
    aifactory: { task_id: null, status: a, phase: null },
    tfactory: { task_id: null, status: t, phase: null },
    timeline: [],
  };
}

test("activeStage prefers the running stage, else the furthest reached", () => {
  assert.equal(activeStage(item(null, null, null)), "Pending");
  assert.equal(activeStage(item("emitted", null, null)), "Plan");
  assert.equal(activeStage(item("emitted", "in_progress", null)), "Code");
  assert.equal(activeStage(item("emitted", "merged", "triaged")), "Test");
  // running beats a later terminal stage
  assert.equal(activeStage(item("in_progress", "merged", null)), "Plan");
});
