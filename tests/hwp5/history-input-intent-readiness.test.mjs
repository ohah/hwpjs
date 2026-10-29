import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryInputIntentQueue as createQueue } from '../../web/preview/history-input-intent-queue.mjs';
const microtasks = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const options = (extra = {}) => ({
  ready: () => true,
  history: () => true,
  input: () => true,
  error: () => {},
  ...extra,
});
test('legacy readiness and undefined override retain fallback and exact order', async () => {
  for (const override of [undefined, () => undefined]) {
    let ready = false;
    const log = [];
    const q = createQueue(
      options({
        ready: () => ready,
        readyForKind: override,
        history: (k) => (log.push(k), true),
        input: (e) => (log.push(e.data), true),
      }),
    );
    q.history('undo');
    q.input('insertText', 'R');
    assert.deepEqual(log, []);
    ready = true;
    q.wake();
    await microtasks();
    assert.deepEqual(log, ['undo', 'R']);
    assert.equal(q.size, 0);
  }
});
test('history override cannot bypass Native busy or grant unpainted input', async () => {
  let painted = false,
    modelReady = false;
  const log = [];
  const q = createQueue(
    options({
      ready: () => painted,
      nativeReady: () => modelReady,
      readyForKind: () => true,
      history: (k) => {
        log.push(k);
        modelReady = false;
        return true;
      },
      input: (e) => (log.push(e.data), true),
    }),
  );
  q.history('undo');
  assert.deepEqual(log, []);
  modelReady = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['undo']);
  q.input('insertText', 'R');
  q.history('redo');
  assert.equal(q.size, 3);
  modelReady = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['undo']);
  assert.equal(q.size, 2);
  painted = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['undo', 'R', 'redo']);
  modelReady = true;
  q.wake();
  await microtasks();
  assert.equal(q.size, 0);
});
test('explicit false kind readiness blocks even when legacy readiness is true', async () => {
  let allow = false;
  const log = [];
  const q = createQueue(
    options({ readyForKind: () => allow, history: (k) => (log.push(k), true) }),
  );
  q.history('undo');
  await microtasks();
  assert.deepEqual(log, []);
  allow = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['undo']);
});
test('nonboolean override is failclosed while undefined still falls back', async () => {
  let decision = 'yes';
  const log = [];
  const q = createQueue(
    options({ readyForKind: () => decision, history: (k) => (log.push(k), true) }),
  );
  q.history('undo');
  await microtasks();
  assert.deepEqual(log, []);
  decision = undefined;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['undo']);
});
test('head input is not overtaken by a later model-ready history', async () => {
  let painted = false;
  const log = [];
  const q = createQueue(
    options({
      ready: () => painted,
      nativeReady: () => true,
      readyForKind: (k) => (k === 'history' ? true : undefined),
      history: (k) => (log.push(k), true),
      input: (e) => (log.push(e.data), true),
    }),
  );
  q.history('undo');
  q.input('insertText', 'R');
  q.history('undo');
  await microtasks();
  assert.deepEqual(log, ['undo']);
  painted = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['undo', 'R', 'undo']);
});
test('pending and completed composition remain ahead of later history and require input readiness', async () => {
  let painted = false;
  const log = [];
  const q = createQueue(
    options({
      ready: () => painted,
      nativeReady: () => true,
      readyForKind: () => true,
      history: (k) => (log.push(k), true),
      input: (e) => (log.push(e.data), true),
    }),
  );
  const token = q.composition();
  assert(token);
  q.history('undo');
  await microtasks();
  assert.deepEqual(log, []);
  painted = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, []);
  painted = false;
  assert(q.completeComposition(token, '한'));
  await microtasks();
  assert.deepEqual(log, []);
  painted = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['한', 'undo']);
  assert.equal(q.completeComposition(token, '중복'), false);
});
test('clear isolates old microtasks and old yield tickets from a new generation', async () => {
  const tasks = [],
    log = [];
  const q = createQueue(
    options({
      maxOperationsPerYield: 2,
      yieldTask: (fn) => tasks.push(fn),
      history: (k) => (log.push(k), true),
    }),
  );
  for (let i = 0; i < 5; i++) q.history('undo');
  await microtasks();
  assert.equal(log.length, 2);
  const old = tasks.shift();
  assert(old);
  q.clear();
  for (let i = 0; i < 4; i++) q.history('redo');
  await microtasks();
  assert.equal(log.length, 4);
  const fresh = tasks.shift();
  assert(fresh);
  old();
  await microtasks();
  assert.equal(log.length, 4);
  fresh();
  await microtasks();
  assert.deepEqual(log, ['undo', 'undo', 'redo', 'redo', 'redo', 'redo']);
  assert.equal(q.size, 0);
});
test('operation and UTF16 caps preserve refusal and release consumed units', async () => {
  let ready = false;
  const log = [];
  const q = createQueue(
    options({
      ready: () => ready,
      maxOperations: 2,
      maxUnits: 3,
      history: (k) => (log.push(k), true),
      input: (e) => (log.push(e.data), true),
    }),
  );
  assert(q.input('insertText', 'abc'));
  assert.equal(q.input('insertText', 'd'), false);
  assert(q.history('undo'));
  assert.equal(q.history('redo'), false);
  assert.equal(q.hasCapacity, false);
  ready = true;
  q.wake();
  await microtasks();
  assert(q.input('insertText', 'xyz'));
  await microtasks();
  assert.deepEqual(log, ['abc', 'undo', 'xyz']);
  assert.equal(q.size, 0);
});
test('a rejected operation clears later work and reports the existing error', async () => {
  let ready = false;
  const errors = [],
    log = [];
  const q = createQueue(
    options({
      ready: () => ready,
      history: () => false,
      input: (e) => (log.push(e.data), true),
      error: (e) => errors.push(e),
    }),
  );
  q.history('undo');
  q.input('insertText', 'R');
  ready = true;
  q.wake();
  await microtasks();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'OrderedInputRejected');
  assert.deepEqual(log, []);
  assert.equal(q.size, 0);
});
test('reentrant clear cannot let an old rejection clear new-generation work', async () => {
  let ready = false,
    q;
  const errors = [],
    log = [];
  q = createQueue(
    options({
      ready: () => ready,
      history: () => {
        q.clear();
        q.input('insertText', 'R');
        q.wake();
        return false;
      },
      input: (e) => (log.push(e.data), true),
      error: (e) => errors.push(e),
    }),
  );
  q.history('undo');
  ready = true;
  q.wake();
  await microtasks();
  assert.deepEqual(log, ['R']);
  assert.deepEqual(errors, []);
  assert.equal(q.size, 0);
});
test('synchronous append burst is bounded and every history runs once in order', async () => {
  const tasks = [],
    log = [],
    expected = Array.from({ length: 10 }, (_, i) => (i % 2 ? 'redo' : 'undo'));
  const q = createQueue(
    options({
      maxOperationsPerYield: 3,
      yieldTask: (fn) => tasks.push(fn),
      history: (k) => (log.push(k), true),
    }),
  );
  for (const k of expected) assert(q.history(k));
  await microtasks();
  assert.equal(log.length, 3);
  assert.equal(tasks.length, 1);
  let turns = 0;
  while (tasks.length) {
    const before = log.length;
    tasks.shift()();
    await microtasks();
    assert(log.length - before <= 3);
    assert(++turns < 10);
  }
  assert.deepEqual(log, expected);
  assert.equal(q.size, 0);
});
test('wake storms and appended input cannot bypass one outstanding yield', async () => {
  const tasks = [],
    log = [];
  const q = createQueue(
    options({
      maxOperationsPerYield: 1,
      yieldTask: (fn) => tasks.push(fn),
      history: (k) => (log.push(k), true),
      input: (e) => (log.push(e.data), true),
    }),
  );
  q.history('undo');
  q.history('redo');
  for (let i = 0; i < 100; i++) q.wake();
  q.input('insertText', 'R');
  await microtasks();
  assert.deepEqual(log, ['undo']);
  assert.equal(tasks.length, 1);
  tasks.shift()();
  await microtasks();
  assert.deepEqual(log, ['undo', 'redo']);
  assert.equal(tasks.length, 1);
  tasks.shift()();
  await microtasks();
  assert.deepEqual(log, ['undo', 'redo', 'R']);
});
test('default scheduler yields to a real task and inline schedulers are refused', async () => {
  let ready = false;
  const log = [];
  const q = createQueue(
    options({ ready: () => ready, maxOperationsPerYield: 2, history: (k) => (log.push(k), true) }),
  );
  for (let i = 0; i < 6; i++) q.history('undo');
  const observed = new Promise((resolve) => setTimeout(() => resolve(log.length), 0));
  ready = true;
  q.wake();
  assert.equal(await observed, 2);
  for (let i = 0; i < 50 && q.size; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(log.length, 6);
  assert.equal(q.size, 0);
  const errors = [],
    inlineLog = [];
  const inline = createQueue(
    options({
      maxOperationsPerYield: 1,
      yieldTask: (fn) => fn(),
      history: (k) => (inlineLog.push(k), true),
      error: (e) => errors.push(e),
    }),
  );
  inline.history('undo');
  inline.history('redo');
  await microtasks();
  assert.deepEqual(inlineLog, ['undo']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'InvalidOrderedInputYield');
  assert.equal(inline.size, 0);
});
test('new callback and yield bounds reject invalid contracts without running work', () => {
  for (const n of [0, -1, NaN, Infinity, 1.5])
    assert.throws(
      () => createQueue(options({ maxOperationsPerYield: n })),
      /InvalidOrderedInputLimit/,
    );
  assert.throws(() => createQueue(options({ readyForKind: 1 })), /InvalidOrderedInputReadiness/);
  assert.throws(() => createQueue(options({ nativeReady: 1 })), /InvalidOrderedInputReadiness/);
  assert.throws(() => createQueue(options({ yieldTask: null })), /InvalidOrderedInputYield/);
});

test('legacy default keeps sixty-four ACK microtask histories in exact order without a task', async () => {
  let ready = false,
    q;
  const log = [],
    expected = Array.from({ length: 64 }, (_, i) => (i % 2 ? 'redo' : 'undo'));
  q = createQueue(
    options({
      ready: () => ready,
      history: (k) => {
        log.push(k);
        ready = false;
        queueMicrotask(() => {
          ready = true;
          q.wake();
        });
        return true;
      },
    }),
  );
  for (const k of expected) assert(q.history(k));
  ready = true;
  q.wake();
  for (let i = 0; i < 240; i++) await Promise.resolve();
  assert.deepEqual(log, expected);
  assert.equal(q.size, 0);
});
test('model-ready mode defaults to sixteen operations before each task yield', async () => {
  const tasks = [],
    log = [];
  const q = createQueue(
    options({
      ready: () => false,
      nativeReady: () => true,
      readyForKind: () => true,
      yieldTask: (fn) => tasks.push(fn),
      history: (k) => (log.push(k), true),
    }),
  );
  for (let i = 0; i < 40; i++) assert(q.history('undo'));
  await microtasks();
  assert.equal(log.length, 16);
  assert.equal(tasks.length, 1);
  tasks.shift()();
  await microtasks();
  assert.equal(log.length, 32);
  assert.equal(tasks.length, 1);
  tasks.shift()();
  await microtasks();
  assert.equal(log.length, 40);
  assert.equal(tasks.length, 0);
  assert.equal(q.size, 0);
});
