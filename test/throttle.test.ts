import { test } from "node:test";
import assert from "node:assert/strict";
import { throttle } from "../src/util/throttle";

test("throttle runs leading call immediately and coalesces a burst into a trailing call", async () => {
  let calls = 0;
  const t = throttle(() => { calls++; }, 50);

  t.trigger();                 // leading — runs now
  t.trigger();
  t.trigger();                 // coalesced into one trailing run
  assert.equal(calls, 1, "only the leading call has run so far");

  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, 2, "exactly one trailing call fired after the interval");
});

test("throttle.cancel drops a pending trailing call", async () => {
  let calls = 0;
  const t = throttle(() => { calls++; }, 50);
  t.trigger();                 // leading
  t.trigger();                 // schedules trailing
  t.cancel();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, 1, "cancel prevented the trailing call");
});
