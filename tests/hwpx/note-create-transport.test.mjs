import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedNoteInsertRequest,
  checkedNoteInsertOptions,
  createHwpxNoteCreateApi,
} from '../../js/hwpx-note-create.mjs';
const body = '\ufffc새😀\r\n\t뒤\ufffc';
const format = () => ({
  number_type: 'DIGIT',
  user_char: '',
  prefix_char: '',
  suffix_char: ')',
  superscript: false,
});
const target = () => ({
  section: 0,
  paragraph: 1,
  owner: { kind: 'body', binding: { session: 's1', revision: 0, serial: '0' } },
  unit: 1,
  expected_text: 'a😀b',
  affinity: 'forward',
});
const options = () => ({
  resources: { paragraph: 0, character: 0, style: 0 },
  format: format(),
  body,
  initial_policies: [],
});
const request = () => ({ target: target(), kind: 'foot', ...options() });
function harness({
  code = 1,
  version = 1,
  invalidOutput = false,
  cleanup = false,
  invokeThrow = false,
} = {}) {
  let calls = 0,
    allocations = 0,
    frees = 0,
    last;
  const out = new TextEncoder().encode(
    JSON.stringify(
      invalidOutput
        ? {
            schemaVersion: 1,
            caret: { section: 0, paragraph: 0, unit: 0, coordinateSpace: 'plain' },
          }
        : {
            schemaVersion: 1,
            caret: { section: 0, paragraph: 2, unit: body.length, coordinateSpace: 'plain' },
          },
    ),
  );
  const wasm = {
    hwpx_edit_inline_object_placement_version: () => 1,
    hwpx_edit_inline_object_owner: () => 1,
    hwpx_edit_note_create_version: () => version,
    hwpx_edit_insert_note() {
      calls++;
      if (invokeThrow) throw Error('lost');
      return code;
    },
    hwpx_edit_output_ptr: () => 0,
    hwpx_edit_output_len: () => out.length,
    hwpx_edit_output_free() {
      frees++;
      if (cleanup) throw Error('cleanup');
    },
  };
  const memory = {
    withBytes(bytes, run) {
      allocations++;
      last = JSON.parse(new TextDecoder().decode(bytes));
      return run(0, bytes.length);
    },
    copy: () => out,
    error: () => Error('NativeRejected'),
  };
  return {
    api: createHwpxNoteCreateApi({ wasm, memory, check() {} }),
    stats: () => ({ calls, allocations, frees, last }),
  };
}
test('note transport preserves empty and exact CRLF emoji tabs literal UFFFC, owns nested options', () => {
  for (const value of ['', body]) {
    const input = request();
    input.body = value;
    const copy = checkedNoteInsertRequest(input);
    input.resources.style = 9;
    input.format.suffix_char = 'x';
    assert.equal(copy.body, value);
    assert.equal(copy.resources.style, 0);
    assert.equal(copy.format.suffix_char, ')');
  }
});
test('note transport rejects forged physical target missing owner unknown fields and accessors before invoke', () => {
  for (const mutate of [
    (p) => (p.target.physical_paragraph = 3),
    (p) => delete p.target.owner,
    (p) => (p.extra = 1),
    (p) => (p.resources.extra = 1),
    (p) => (p.initial_policies = null),
  ]) {
    const p = request();
    mutate(p);
    const h = harness();
    assert.throws(() => h.api.insertNote(p));
    assert.equal(h.stats().calls, 0);
  }
  let hits = 0;
  const p = request();
  Object.defineProperty(p, 'body', {
    get() {
      hits++;
      return 'x';
    },
    enumerable: true,
  });
  assert.throws(() => checkedNoteInsertRequest(p));
  assert.equal(hits, 0);
});
test('note facade optional old ABI refuses before allocation and never retries', () => {
  const h = harness({ version: 0 });
  assert.throws(() => h.api.insertNote(request()), /NoteCreationUnavailable/);
  assert.equal(h.stats().allocations, 0);
  assert.equal(h.stats().calls, 0);
});
test('note facade footnote and endnote each invoke once and preserve returned plain UTF16 caret', () => {
  for (const [name, kind] of [
    ['insertFootnote', 'foot'],
    ['insertEndnote', 'end'],
  ]) {
    const h = harness();
    const outcome = h.api[name]({ target: target(), ...options() });
    assert.equal(outcome.application, 'applied');
    assert.equal(outcome.noteCaret.unit, body.length);
    assert.equal(outcome.noteCaret.paragraph, 2);
    assert.equal(h.stats().last.kind, kind);
    assert.equal(h.stats().last.body, body);
    assert.equal(h.stats().calls, 1);
  }
});
test('note facade known refusal and uncertain completion retain classification without retry', () => {
  for (const [settings, expected] of [
    [{ code: 0 }, 'unapplied'],
    [{ code: 3 }, 'unknown'],
    [{ invokeThrow: true }, 'unknown'],
  ]) {
    const h = harness(settings);
    const result = h.api.insertNote(request());
    assert.equal(result.application, expected);
    assert.ok(result.error);
    assert.equal(h.stats().calls, 1);
  }
});
test('note facade response and cleanup failure retain observed application', () => {
  const invalid = harness({ invalidOutput: true });
  const outcome = invalid.api.insertNote(request());
  assert.equal(outcome.application, 'applied');
  assert.equal(outcome.refreshRequired, true);
  assert.ok(outcome.error);
  const cleanup = harness({ cleanup: true });
  const completed = cleanup.api.insertNote(request());
  assert.equal(completed.application, 'applied');
  assert.equal(completed.cleanupError, 'cleanup');
  assert.equal(completed.refreshRequired, true);
  assert.equal(cleanup.stats().calls, 1);
});
test('note policy arrays reject duplicate sections sparse entries and invalid XML text', () => {
  const shape = {
    format: format(),
    line_length: -1,
    line_type: 'SOLID',
    line_width: '0.12 mm',
    line_color: '#000000',
    between_notes: 283,
    below_line: 567,
    above_line: 850,
    start: 1,
    place: 'EACH_COLUMN',
    beneath_text: false,
  };
  const sparse = [undefined];
  Reflect.deleteProperty(sparse, '0');
  for (const initial_policies of [
    [
      { section: 0, shape },
      { section: 0, shape },
    ],
    sparse,
  ])
    assert.throws(() => checkedNoteInsertOptions({ ...options(), initial_policies }));
  for (const value of ['\u0000', '\ud800', '\ufffe'])
    assert.throws(() => checkedNoteInsertOptions({ ...options(), body: value }));
});
