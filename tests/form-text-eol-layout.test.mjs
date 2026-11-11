import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormTextDraft, formTextProjection } from '../web/preview/form-text-eol.mjs';
import { formTextLayout } from '../web/preview/form-text-layout.mjs';
test('CRLF/CR/mixed Native semantic ends survive untouched projection and localized edits', () => {
  for (const raw of ['A\r\nB\r\nC', 'A\rB\rC', 'A\r\nB\rC\nD']) {
    const d = createFormTextDraft(raw);
    assert.equal(d.update(d.projection), raw);
    const out = d.update(d.projection.replace('B', 'β😀'));
    assert.equal(out, raw.replace('B', 'β😀'));
    assert.equal(formTextProjection(out), d.projection);
  }
});
test('new ends use uniform source style, mixed defaults explicitly LF and DOM undo restores removed original ends', () => {
  const d = createFormTextDraft('A\r\nB');
  assert.equal(d.update('A\nB\nC'), 'A\r\nB\r\nC');
  const m = createFormTextDraft('A\r\nB\rC');
  assert.equal(m.update('AB\nC'), 'AB\rC');
  assert.equal(m.update('A\nB\nC', 'historyUndo'), 'A\r\nB\rC');
  assert.equal(m.update('AB\nC', 'historyRedo'), 'AB\rC');
  assert.equal(m.update('AB\nC\nD'), 'AB\rC\nD');
});
test('raw CRLF budget rejection and invalid projection cannot mutate the prepared Native value', () => {
  const d = createFormTextDraft('a\r\nb');
  assert.throws(() => d.update('x'.repeat(65536)));
  assert.throws(() => d.update('a\rb'));
  assert.equal(d.raw, 'a\r\nb');
  assert.equal(d.projection, 'a\nb');
});
test('measured wrapping preserves graphemes, spaces, offsets and raw hard line data', () => {
  const text = 'ab👩‍👩‍👧‍👦 cd  한글\r\nZ';
  const measure = (s) =>
    [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length * 10;
  const a = formTextLayout(text, { width: 30, wrap: true, measure });
  assert.equal(a.value, formTextProjection(text));
  assert.equal(a.rows.map((x) => x.text).join(''), formTextProjection(text).replaceAll('\n', ''));
  assert(a.rows.some((x) => x.text.includes('👩‍👩‍👧‍👦')));
  assert(a.rows.every((x) => x.width <= 30));
  for (const row of a.rows) assert.equal(a.value.slice(row.start, row.end), row.text);
  const b = formTextLayout(text, { width: 1, wrap: false, measure });
  assert.equal(b.rows.length, 2);
  assert.equal(b.rows[0].text, 'ab👩‍👩‍👧‍👦 cd  한글');
  const clipped = formTextLayout(text, { width: 20, wrap: true, measure, maxLines: 1 });
  assert.equal(clipped.rows.length, 1);
  assert.equal(clipped.clipped, true);
});
test('invalid Canvas measurements fail closed and clipped long input has bounded measure calls', () => {
  assert.throws(() => formTextLayout('a', { width: 20, wrap: true, measure: () => NaN }));
  let calls = 0;
  const plan = formTextLayout('x'.repeat(65535), {
    width: 5,
    wrap: true,
    maxLines: 3,
    measure: (s) => {
      calls++;
      return s.length;
    },
  });
  assert.equal(plan.rows.length, 3);
  assert(calls < 100);
  assert.equal(plan.clipped, true);
});
test('observed beforeinput distinguishes adjacent CRLF/CR ends instead of choosing a projected duplicate', () => {
  const original = 'A\r\n\rB',
    before = 'A\n\nB',
    next = 'A\nB';
  for (const [start, end, expected] of [
    [1, 2, 'A\rB'],
    [2, 3, 'A\r\nB'],
  ]) {
    const d = createFormTextDraft(original);
    assert.equal(
      d.update(next, 'deleteContentForward', {
        projection: before,
        start,
        end,
        inputType: 'deleteContentForward',
      }),
      expected,
    );
  }
  const back = createFormTextDraft(original);
  assert.equal(
    back.update(next, 'deleteContentBackward', {
      projection: before,
      start: 2,
      end: 2,
      inputType: 'deleteContentBackward',
    }),
    'A\rB',
  );
  const forward = createFormTextDraft(original);
  assert.equal(
    forward.update(next, 'deleteContentForward', {
      projection: before,
      start: 2,
      end: 2,
      inputType: 'deleteContentForward',
    }),
    'A\r\nB',
  );
});
test('ambiguous mixed-EOL input without an exact current selection fails atomically', () => {
  const d = createFormTextDraft('A\r\n\rB');
  assert.throws(() => d.update('A\nB'), /AmbiguousFormTextEdit/);
  assert.equal(d.raw, 'A\r\n\rB');
  assert.equal(d.projection, 'A\n\nB');
  assert.throws(
    () =>
      d.update('A\nB', 'deleteContentForward', {
        projection: 'stale',
        start: 1,
        end: 2,
        inputType: 'deleteContentForward',
      }),
    /Ambiguous/,
  );
  assert.equal(
    d.update('A\nB', 'deleteContentForward', {
      projection: d.projection,
      start: 1,
      end: 2,
      inputType: 'deleteContentForward',
    }),
    'A\rB',
  );
  assert.equal(d.update('A\n\nB', 'historyUndo'), 'A\r\n\rB');
  assert.equal(d.update('A\nB', 'historyRedo'), 'A\rB');
});
test('new LF policy in a mixed value preserves the exact original neighboring ends at the observed insertion point', () => {
  for (const [at, expected] of [
    [1, 'A\n\r\n\rB'],
    [2, 'A\r\n\n\rB'],
    [3, 'A\r\n\r\nB'],
  ]) {
    const d = createFormTextDraft('A\r\n\rB');
    assert.equal(
      d.update('A\n\n\nB', 'insertLineBreak', {
        projection: d.projection,
        start: at,
        end: at,
        inputType: 'insertLineBreak',
      }),
      expected,
    );
  }
});

test('unobserved mixed multiline replacement cannot silently normalize unchanged interior ends', () => {
  const d = createFormTextDraft('A\r\nB\rC');
  assert.throws(() => d.update('a\nB\nc'), /UnobservedFormTextReplacement/);
  assert.equal(d.raw, 'A\r\nB\rC');
  assert.equal(
    d.update('a\nB\nc', 'insertFromPaste', {
      projection: d.projection,
      start: 0,
      end: d.projection.length,
      inputType: 'insertFromPaste',
    }),
    'a\nB\nc',
  );
});
