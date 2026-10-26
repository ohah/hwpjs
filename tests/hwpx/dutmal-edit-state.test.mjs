import test from 'node:test';
import assert from 'node:assert/strict';
import { createDutmalEditState } from '../../web/preview/dutmal-edit-state.mjs';

test('dutmal draft ignores stale queries and never submits source snapshots', () => {
  const requests = [];
  const state = createDutmalEditState({
    request: (row) => {
      requests.push(row);
      return true;
    },
  });
  state.select({ section: 0, node: 7, textKind: 'mainText' });
  const first = requests[0];
  assert.equal(state.submit(), false);
  state.select({ section: 0, node: 8, textKind: 'subText' });
  const second = requests[1];
  const reply = (query, value) => ({
    kind: query.kind,
    requestId: query.requestId,
    dutmal: { section: query.section, node: query.node, textKind: query.textKind, value },
  });
  assert.equal(state.message(reply(first, 'stale')), false);
  assert.equal(state.message(reply(second, 'current')), true);
  assert.equal(state.submit(), true);
  assert.equal(requests.length, 2, 'no-op does not write or consume redo');
  assert.equal(state.edit('new😀'), true);
  assert.equal(state.submit(), true);
  assert.equal(state.submit(), false);
  assert.deepEqual(requests[2], {
    kind: 'dutmal-text',
    section: 0,
    node: 8,
    textKind: 'subText',
    value: 'new😀',
    requestId: 3,
  });
  assert.equal(state.message({ kind: 'dutmal-text', requestId: 2, error: 'stale' }), false);
  assert.equal(
    state.message({ kind: 'dutmal-text', requestId: 3, error: 'ProtectedFieldRange' }),
    true,
  );
  assert.equal(state.snapshot().draft, 'new😀');
  assert.equal(state.snapshot().baseline, 'current');
  state.submit();
  assert.equal(
    state.message({
      kind: 'dutmal-text',
      requestId: requests.at(-1).requestId,
      dutmal: { section: 0, node: 8, textKind: 'subText', value: 'new😀' },
    }),
    true,
  );
  assert.equal(state.snapshot().baseline, 'new😀');
  state.message({ kind: 'undo' });
  assert.equal(state.snapshot().canSubmit, false);
  state.reset();
  assert.equal(state.message(reply(requests.at(-1), 'late')), false);
  state.close();
  state.close();
  assert.equal(state.select({ section: 0, node: 1, textKind: 'mainText' }), false);
});

test('dutmal query failures remain uneditable and rejected requests can retry', () => {
  let accepted = false;
  const requests = [];
  const state = createDutmalEditState({
    request: (value) => {
      requests.push(value);
      return accepted;
    },
  });
  const selection = { section: 0, node: 9, textKind: 'mainText' };
  state.select(selection);
  assert.equal(state.snapshot().error, 'DutmalQueryUnavailable');
  assert.equal(state.edit('unsafe'), false);
  accepted = true;
  state.select(selection);
  assert.equal(
    state.message({
      kind: 'dutmal-text-query',
      ...selection,
      requestId: requests.at(-1).requestId,
      error: 'UnsupportedDutmalFieldEdit',
    }),
    true,
  );
  assert.equal(state.snapshot().canSubmit, false);
  assert.equal(state.submit(), false);
  assert.throws(() => state.select({ ...selection, node: -1 }), /InvalidDutmalSelection/);
  assert.throws(
    () => state.select({ ...selection, textKind: 'main_text' }),
    /InvalidDutmalTextKind/,
  );
});
