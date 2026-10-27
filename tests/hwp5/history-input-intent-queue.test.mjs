import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryInputIntentQueue } from '../../web/preview/history-input-intent-queue.mjs';
const tick = () => new Promise((resolve) => queueMicrotask(resolve));

test('보류 FIFO와 composition 객체 identity 및 clear 세대를 유지한다', async () => {
  let ready = false;
  const seen = [];
  const queue = createHistoryInputIntentQueue({
    ready: () => ready,
    history: (operation) => {
      seen.push(operation);
      return true;
    },
    input: (entry) => {
      seen.push(entry.data);
      return true;
    },
    error: (e) => {
      throw e;
    },
  });
  queue.history('undo');
  const token = queue.composition();
  queue.history('redo');
  assert.equal(queue.completeComposition({ ...token }, '가'), false);
  assert.equal(queue.completeComposition(token, '가'), true);
  ready = true;
  queue.wake();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(seen, ['undo', '가', 'redo']);
  assert.equal(queue.completeComposition(token, '나'), false);
  ready = false;
  const stale = queue.composition();
  queue.clear();
  assert.equal(queue.completeComposition(stale, '다'), false);
  assert.equal(queue.size, 0);
});

test('active는 size에만 포함하고 capacity 및 단위 예산은 기존 규칙을 유지한다', () => {
  let ready = true;
  const queue = createHistoryInputIntentQueue({
    maxOperations: 1,
    maxUnits: 2,
    ready: () => ready,
    history: () => {
      ready = false;
      return true;
    },
    input: () => true,
    error: (e) => {
      throw e;
    },
  });
  assert.equal(queue.history('undo'), true);
  assert.equal(queue.size, 1);
  assert.equal(queue.hasCapacity, true);
  assert.equal(queue.input('insertText', 'ab'), true);
  assert.equal(queue.size, 2);
  assert.equal(queue.input('insertText', 'c'), false);
  queue.clear();
  assert.equal(queue.size, 0);
});

test('callback 안 clear와 새 입력은 이전 세대의 후처리로 지우지 않는다', async () => {
  let ready = false;
  const seen = [];
  const queue = createHistoryInputIntentQueue({
    ready: () => ready,
    history: () => {
      queue.clear();
      queue.input('insertText', 'new');
      return true;
    },
    input: (entry) => {
      seen.push(entry.data);
      return true;
    },
    error: (e) => {
      throw e;
    },
  });
  queue.history('undo');
  ready = true;
  queue.wake();
  await tick();
  queue.wake();
  await tick();
  assert.deepEqual(seen, ['new']);
});

test('미완료 composition이 head이면 뒤 history는 완료 전 실행하지 않는다', async () => {
  const seen = [];
  const queue = createHistoryInputIntentQueue({
    ready: () => true,
    history: (op) => {
      seen.push(op);
      return true;
    },
    input: (entry) => {
      seen.push(entry.data);
      return true;
    },
    error: (e) => {
      throw e;
    },
  });
  const token = queue.composition();
  queue.history('undo');
  await tick();
  assert.deepEqual(seen, []);
  assert.equal(queue.size, 2);
  assert.equal(queue.completeComposition(token, '가'), true);
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(seen, ['가', 'undo']);
});

test('clear 전 microtask는 새 세대 예약을 해제하지 않는다', async () => {
  let ready = false;
  const seen = [];
  const queue = createHistoryInputIntentQueue({
    ready: () => ready,
    history: (op) => {
      seen.push(op);
      return true;
    },
    input: () => true,
    error: (e) => {
      throw e;
    },
  });
  queue.history('undo');
  queue.wake();
  queue.clear();
  queue.history('redo');
  queue.wake();
  ready = true;
  await tick();
  await tick();
  assert.deepEqual(seen, ['redo']);
  assert.equal(queue.size, 0);
});

test('모든 소모 및 clear token은 재완료할 수 없으며 잘못된 token은 false다', async () => {
  let ready = false;
  const queue = createHistoryInputIntentQueue({
    ready: () => ready,
    history: () => true,
    input: () => true,
    error: (e) => {
      throw e;
    },
  });
  queue.history('undo');
  assert.equal(queue.completeComposition(undefined, 'x'), false);
  assert.equal(queue.completeComposition(null, 'x'), false);
  queue.clear();
  const tokens = Array.from({ length: 16 }, () => queue.composition());
  for (const token of tokens) assert.equal(queue.completeComposition(token, 'x'), true);
  ready = true;
  queue.wake();
  for (let i = 0; i < 20; i++) await tick();
  for (const token of tokens) assert.equal(queue.completeComposition(token, 'x'), false);
  ready = false;
  const cleared = Array.from({ length: 16 }, () => queue.composition());
  queue.clear();
  for (const token of cleared) assert.equal(queue.completeComposition(token, 'x'), false);
});

test('반복 complete의 기존 누적 예산은 관측만 하고 변경하지 않는다', () => {
  const queue = createHistoryInputIntentQueue({
    ready: () => false,
    maxUnits: 3,
    history: () => true,
    input: () => true,
    error: (e) => {
      throw e;
    },
  });
  const token = queue.composition();
  assert.equal(queue.completeComposition(token, 'ab'), true);
  assert.equal(queue.completeComposition(token, 'x'), true);
  assert.equal(queue.completeComposition(token, 'y'), false);
  queue.clear();
});
