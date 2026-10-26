import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedNodeWorker } from '../../tools/guarded-node-worker.mjs';

const worker = new URL('./query-parity-worker-fixture.mjs', import.meta.url);
const options = { maxRssBytes: 1024 * 1024 * 1024, maxDurationMs: 5000, pollMs: 25 };
test('worker completion requires one result and successful terminal exit', async () => {
  const sigterm = process.listenerCount('SIGTERM'),
    sigint = process.listenerCount('SIGINT');
  const good = await guardedNodeWorker(worker, ['success'], options);
  assert.equal(good.complete, true);
  assert.deepEqual(good.value, { ok: true });
  for (const [mode, reason] of [
    ['missing', 'MissingWorkerResult'],
    ['nonzero', 'WorkerExitFailed'],
    ['duplicate', 'DuplicateWorkerResult'],
    ['malformed', 'InvalidWorkerMessage'],
    ['output', 'WorkerOutputLimitExceeded'],
  ]) {
    const result = await guardedNodeWorker(worker, [mode], options);
    assert.equal(result.complete, false, mode);
    assert.equal(result.reason, reason, mode);
    assert.equal(result.value, undefined, mode);
    assert(result.stdout.length <= 16384);
    assert(result.stderr.length <= 16384);
  }
  assert.equal(process.listenerCount('SIGTERM'), sigterm);
  assert.equal(process.listenerCount('SIGINT'), sigint);
});
test('worker RSS and time caps stop and reap the owned child without success', async () => {
  const memory = await guardedNodeWorker(worker, ['idle'], { ...options, maxRssBytes: 1 });
  assert.equal(memory.complete, false);
  assert.equal(memory.reason, 'WorkerRssLimitExceeded');
  assert(memory.peakRssBytes > 1);
  assert.notEqual(memory.signal, null);
  const timed = await guardedNodeWorker(worker, ['idle'], { ...options, maxDurationMs: 300 });
  assert.equal(timed.complete, false);
  assert.equal(timed.reason, 'WorkerTimeLimitExceeded');
  assert.notEqual(timed.signal, null);
});
test('worker guard rejects invalid bounds before spawning', async () => {
  await assert.rejects(
    guardedNodeWorker(worker, ['idle'], { ...options, maxRssBytes: 0 }),
    /InvalidWorkerMemoryLimit/,
  );
  await assert.rejects(
    guardedNodeWorker(worker, ['idle'], { ...options, maxDurationMs: 0 }),
    /InvalidWorkerTimeLimit/,
  );
});
