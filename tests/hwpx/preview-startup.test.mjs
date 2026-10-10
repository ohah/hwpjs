import test from "node:test";
import assert from "node:assert/strict";
import { startPreview } from "../../web/preview/preview-startup.mjs";

test("startup reports slow loading but allows late readiness without loading twice", async () => {
  const states = []; let resolve, timeout, loads = 0, cleared = 0;
  const pending = startPreview({ load: () => { loads++; return new Promise(done => { resolve = done; }); },
    notify: state => states.push(state.kind),
    setTimer(fn, delay) { assert.equal(delay, 15000); timeout = fn; return 7; },
    clearTimer(id) { assert.equal(id, 7); cleared++; } });
  assert.deepEqual(states, ["loading"]); timeout(); assert.deepEqual(states, ["loading", "slow"]);
  resolve(); assert.equal(await pending, true);
  assert.deepEqual(states, ["loading", "slow", "ready"]); assert.equal(loads, 1); assert.equal(cleared, 1);
  timeout(); assert.deepEqual(states, ["loading", "slow", "ready"]);
});

test("startup reports both thrown and rejected module failures and clears the timer", async () => {
  for (const load of [() => { throw new Error("LinkFailure"); }, () => Promise.reject(null)]) {
    const states = []; let cleared = 0;
    assert.equal(await startPreview({ load, notify: state => states.push(state), setTimer: () => 3, clearTimer: id => { assert.equal(id, 3); cleared++; } }), false);
    assert.deepEqual(states.map(state => state.kind), ["loading", "failed"]);
    assert.equal(cleared, 1);
  }
});
