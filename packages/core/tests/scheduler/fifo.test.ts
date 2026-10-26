import test from "node:test";
import assert from "node:assert/strict";
import { FifoScheduler } from "../../src/scheduler/fifo.ts";
test("FIFO owns async work through finally; rejection does not poison the queue", async () => {
  const q = new FifoScheduler();
  const trace: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = q.enqueue(async () => {
    try {
      trace.push("a-start");
      await gate;
      throw Error("a");
    } finally {
      trace.push("a-finally");
    }
  });
  const b = q.enqueue(() => {
    trace.push("b");
    return 2;
  });
  const rejected = assert.rejects(a, /a/);
  await Promise.resolve();
  assert.deepEqual(trace, ["a-start"]);
  release();
  await rejected;
  assert.equal(await b, 2);
  await q.drain();
  assert.deepEqual(trace, ["a-start", "a-finally", "b"]);
});
