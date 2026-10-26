import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { verifyCharacterProperties } from './style-preservation/character-property-oracle.mjs';
import { inspect, verifyRaw } from './style-preservation/text-record-oracle.mjs';
import { independentFieldSpans } from './field-span-oracle.mjs';

test('Canvas text and formatting preserve unselected table-number fields while protected-section rejection keeps redo', async (t) => {
  const path = 'reference/rhwp/samples/hwpspec.hwp';
  if (!existsSync(path)) {
    t.skip('RHWP reference fixture is unavailable');
    return;
  }
  const input = readFileSync(path),
    h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: 'load', format: 'hwp5', bytes: input })).error, undefined);
  const enabled = await h.send({ kind: 'enable', distribution: true, normalizeObservedCfb: true });
  assert.equal(enabled.error, undefined);
  assert.equal(enabled.content.textSourcePolicyAvailable, true);
  const row = enabled.content.paragraphs.find(
    (row) => row.section === 0 && row.text === '(Hwp Document File Formats)',
  );
  assert(row?.editable && !row.clipped);
  const baseline = Buffer.from((await h.send({ kind: 'save' })).bytes);
  assert.equal(row.text, '(Hwp Document File Formats)');
  const range = { section: row.section, paragraph: row.paragraph, startUnit: 1, endUnit: 13 };
  assert.equal(h.controller.selectTextRange(range), true);
  assert.equal(h.input.readOnly, false);
  const text = h.input.value;
  assert.equal(h.controller.selectTextRange(range), true);
  const oldBold = h.controller.selectedCharacterPropertyState('bold');
  assert.equal(typeof oldBold, 'boolean');
  assert.equal(h.controller.setCharacterProperties({ bold: !oldBold }), true);
  assert.equal(h.controller.settled(), false);
  assert.equal(
    h.controller.selectedCharacterPropertyState('bold'),
    null,
    'pending display state must not be used as completion evidence',
  );
  const request = h.requests.at(-1);
  assert.equal(request.kind, 'character-properties');
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(h.controller.settled(), true);
  const current = changed.content.paragraphs.find(
    (row) => row.section === range.section && row.paragraph === range.paragraph,
  );
  assert.equal(current.text, text);
  assert.equal(current.editable, true);
  const saved = await h.send({ kind: 'save', allowStaleLayout: true });
  assert.equal(saved.error, undefined);
  assert.equal(verifyCharacterProperties(input, Buffer.from(saved.bytes), request), true);
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(
    h.controller.selectedCharacterPropertyState('bold'),
    oldBold,
    'undo restores selected display state, not only saved bytes',
  );
  assert.equal(h.input.readOnly, false);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), baseline);
  const protectedSpan = independentFieldSpans(inspect(baseline).sections[2].bytes).find(
    (row) => row.field_id === 0x25787266,
  );
  assert(protectedSpan);
  const rejected = await h.send({
    kind: 'splice',
    section: 2,
    paragraph: protectedSpan.begin.paragraph,
    startUnit: protectedSpan.begin.unit,
    endUnit: protectedSpan.begin.unit,
    text: '거부',
  });
  assert.equal(rejected.error, 'ReadOnlyCrossReferenceResult');
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), baseline);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(
    h.controller.selectedCharacterPropertyState('bold'),
    !oldBold,
    'redo restores selected display state',
  );
  assert.equal(h.input.readOnly, false);
  assert.deepEqual(
    Buffer.from((await h.send({ kind: 'save', allowStaleLayout: true })).bytes),
    Buffer.from(saved.bytes),
  );
  const at = 3,
    inserted = '참조😀';
  assert.equal(h.controller.selectTextRange({ ...range, startUnit: at, endUnit: at }), true);
  assert.equal(
    dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: inserted })
      .defaultPrevented,
    false,
  );
  h.input.value = text.slice(0, at) + inserted + text.slice(at);
  h.input.setSelectionRange(at + inserted.length, at + inserted.length);
  dispatchCanvasEvent(h.input, 'input');
  assert.equal((await h.flush()).error, undefined);
  const textSaved = await h.send({ kind: 'save', allowStaleLayout: true });
  assert.equal(textSaved.error, undefined);
  verifyRaw(saved.bytes, textSaved.bytes, row.section, row.paragraph, at, at, inserted);
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved.bytes);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, textSaved.bytes);
  assert.deepEqual(readFileSync(path), input);
});
