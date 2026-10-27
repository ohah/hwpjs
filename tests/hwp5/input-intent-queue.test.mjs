import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputIntentQueue } from '../../web/preview/input-intent-queue.mjs';

test('input intents replay distinct repeated-text positions without a second editable model', () => {
  const queue = createInputIntentQueue(),
    point = { anchor: { unit: 1 }, focus: { unit: 1 } };
  queue.append('aaa', 'aaaa', { startUnit: 1, endUnit: 1 }, point);
  queue.append(
    'aaaa',
    'aaaab',
    { startUnit: 4, endUnit: 4 },
    { anchor: { unit: 4 }, focus: { unit: 4 } },
  );
  point.anchor.unit = 99;
  assert.throws(() => queue.peek('aa'), /InputIntentBaseMismatch/);
  assert.equal(queue.size, 2);
  const first = queue.consume('aaa');
  assert.equal(first.startUnit, 1);
  assert.equal(first.afterText, 'aaaa');
  assert.equal(first.beforeSelection.anchor.unit, 1);
  const second = queue.consume(first.afterText);
  assert.equal(second.startUnit, 4);
  assert.equal(second.afterText, 'aaaab');
  assert.equal(queue.size, 0);
  assert.equal(queue.projected, null);
});

test('input intent failures are atomic and limits clear without retaining text', () => {
  const queue = createInputIntentQueue({ maxOperations: 1, maxUnits: 2 });
  queue.append('a', 'aa', { startUnit: 0, endUnit: 0 }, null);
  assert.throws(() => queue.append('wrong', 'wrong!', null, null), /InputIntentChainMismatch/);
  assert.throws(() => queue.append('aa', 'aaa', null, null), /InputIntentLimit/);
  assert.throws(() => queue.append('aa', '\ud800', null, null), /InvalidInputIntentText/);
  assert.equal(queue.size, 1);
  assert.equal(queue.consume('a').afterText, 'aa');
  assert.equal(queue.append('same', 'same', null, null), false);
  queue.append('a', 'ab', null, null);
  queue.clear();
  assert.equal(queue.size, 0);
  assert.equal(queue.peek('anything'), null);
});

test('입력 FIFO는 반복 소모와 보충 뒤에도 순서와 한도를 유지한다', () => {
  const queue = createInputIntentQueue({ maxOperations: 32, maxUnits: 64 });
  let base = '',
    projected = '';
  for (let i = 0; i < 32; i++) {
    queue.append(projected, projected + 'x', null, null);
    projected += 'x';
  }
  for (let i = 0; i < 256; i++) {
    base = queue.consume(base).afterText;
    queue.append(projected, projected + 'x', null, null);
    projected += 'x';
    assert.equal(queue.size, 32);
  }
  while (queue.size) base = queue.consume(base).afterText;
  assert.equal(base, projected);
  assert.equal(queue.projected, null);
});
