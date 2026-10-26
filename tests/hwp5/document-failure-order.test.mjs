import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync('web/preview/app.mjs', 'utf8');
const handler = app.match(/const fail = (message => \{.*\});/)?.[1];
assert(handler, 'actual app failure callback must be selected');

function harness(source = handler, generation = 2) {
  const calls = [],
    content = { invalid: true };
  const context = {
    epoch: 2,
    generation,
    worker: {},
    accessible: { value: 'old' },
    status: { textContent: '읽는 중' },
    renderer: {
      clear() {
        calls.push('clear');
        content.invalid = false;
      },
    },
    direct: {
      reset() {
        calls.push('direct');
        if (content.invalid) throw new Error('InvalidNestedTableFlow');
      },
    },
    job: {
      terminate() {
        calls.push('terminate');
      },
    },
    updateSave() {
      calls.push('save-state');
    },
  };
  for (const name of [
    'pictureRequests',
    'controls',
    'formulaControls',
    'cellSizeControls',
    'cellResizeControls',
    'paragraphFormatControls',
    'paragraphMarginControls',
    'paragraphSpacingControls',
    'characterPropertyControls',
    'underlineColorControls',
  ])
    context[name] = {
      reset() {
        calls.push(name);
      },
    };
  return { context, calls, fail: runInNewContext(`(${source})`, context) };
}

test('actual app failure clears rejected content before Canvas reset can reflow it', () => {
  const h = harness();
  h.fail('InvalidNestedTableFlow');
  assert.equal(h.calls[0], 'clear');
  assert.equal(h.context.status.textContent, '오류: InvalidNestedTableFlow');
  assert.equal(h.context.accessible.value, '');
  assert.equal(h.context.worker, null);
  assert.equal(h.context.generation, 3);
  assert.deepEqual(h.calls.slice(-2), ['terminate', 'save-state']);
  const count = h.calls.length;
  h.fail('late error');
  assert.equal(h.calls.length, count);
});

test('obsolete document failure is inert and reverted cleanup order reproduces masked error', () => {
  const stale = harness(handler, 3);
  stale.fail('old');
  assert.deepEqual(stale.calls, []);
  assert.equal(stale.context.status.textContent, '읽는 중');
  const reversed = handler
    .replace('renderer.clear(); ', '')
    .replace('accessible.value = "";', 'renderer.clear(); accessible.value = "";');
  assert.notEqual(reversed, handler);
  const invalid = harness(reversed);
  assert.throws(() => invalid.fail('original failure'), /InvalidNestedTableFlow/);
  assert.equal(invalid.context.status.textContent, '읽는 중');
  assert(!invalid.calls.includes('terminate'));
});
