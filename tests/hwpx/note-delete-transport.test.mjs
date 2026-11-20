import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedNoteDeleteRequest, createHwpxNoteDeleteApi } from '../../js/hwpx-note-delete.mjs';
const request = () => ({
  target: {
    section: 0,
    paragraph: 1,
    unit: 3,
    expected_text: 'a😀\ufffc\r\n',
    owner: { kind: 'body', binding: { session: 's1', revision: 0, serial: '0' } },
  },
});
function harness({ version = 1, code = 1, cleanup = false, lost = false } = {}) {
  let calls = 0,
    allocations = 0,
    wire;
  const wasm = {
    hwpx_edit_note_delete_version: () => version,
    hwpx_edit_inline_object_placement_version: () => 1,
    hwpx_edit_inline_object_owner: () => 1,
    hwpx_edit_delete_note() {
      calls++;
      if (lost) throw Error('lost');
      return code;
    },
  };
  const memory = {
    withBytes(bytes, run) {
      allocations++;
      wire = JSON.parse(new TextDecoder().decode(bytes));
      const result = run(0, bytes.length);
      if (cleanup) throw Error('cleanup');
      return result;
    },
    error: () => Error('NativeRefusal'),
  };
  return {
    api: createHwpxNoteDeleteApi({ wasm, memory, check() {} }),
    stats: () => ({ calls, allocations, wire }),
  };
}
test('note delete captures exact anchor text and owned binding without host note index', () => {
  const p = request();
  const copy = checkedNoteDeleteRequest(p);
  p.target.owner.binding.serial = '9';
  assert.equal(copy.target.owner.binding.serial, '0');
  assert.equal(copy.target.unit, 3);
  assert.equal(copy.target.expected_text, 'a😀\ufffc\r\n');
});
test('note delete missing optional ABI refuses before allocation', () => {
  const h = harness({ version: 0 });
  assert.equal(h.api.supportsNoteDeletionAbi(), false);
  assert.throws(() => h.api.deleteNote(request()), /NoteDeletionUnavailable/);
  assert.equal(h.stats().allocations, 0);
});
test('note delete rejects physical leases unknown fields malformed owner and nonanchor before invoke', () => {
  for (const mutate of [
    (p) => (p.note_node = 12),
    (p) => (p.target.physical_paragraph = 1),
    (p) => delete p.target.owner,
    (p) => (p.target.unit = 1),
    (p) => (p.target.unit = 2),
    (p) => (p.target.owner.binding.serial = '00'),
    (p) => (p.target.owner.binding.revision = -1),
    (p) => (p.target.expected_text = 'literal'),
    (p) =>
      (p.target.owner = {
        kind: 'createdCell',
        binding: p.target.owner.binding,
        identity: '1',
        row: 0,
        column: 0,
      }),
  ]) {
    const p = request();
    mutate(p);
    const h = harness();
    assert.throws(() => h.api.deleteNote(p));
    assert.equal(h.stats().calls, 0);
    assert.equal(h.stats().allocations, 0);
  }
});
test('note delete rejects accessor without invoking it', () => {
  const p = request();
  let hits = 0;
  Object.defineProperty(p, 'target', {
    get() {
      hits++;
      return request().target;
    },
    enumerable: true,
  });
  assert.throws(() => checkedNoteDeleteRequest(p));
  assert.equal(hits, 0);
});
for (const [code, application] of [
  [0, 'unapplied'],
  [1, 'applied'],
  [2, 'unapplied'],
  [3, 'unknown'],
])
  test(`note delete code ${code} preserves atomic outcome and invokes once`, () => {
    const h = harness({ code });
    assert.equal(h.api.deleteNote(request()).application, application);
    assert.equal(h.stats().calls, 1);
    assert.deepEqual(h.stats().wire, request());
  });
test('note delete completion survives cleanup failure without replay', () => {
  const h = harness({ cleanup: true });
  const r = h.api.deleteNote(request());
  assert.equal(r.application, 'applied');
  assert.equal(r.cleanupError, 'cleanup');
  assert.equal(r.refreshRequired, true);
  assert.equal(h.stats().calls, 1);
});
test('note delete lost return remains unknown without replay', () => {
  const h = harness({ lost: true });
  assert.equal(h.api.deleteNote(request()).application, 'unknown');
  assert.equal(h.stats().calls, 1);
});
