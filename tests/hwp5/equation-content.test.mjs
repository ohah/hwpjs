import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHwp5EquationRendering } from '../../web/preview/hwp5-equation-content.mjs';
import { sourceDisplayPosition, sourceDisplayPositions } from '../../web/preview/text-offsets.mjs';
const paragraph = () => ({
  section: 0,
  paragraph: 0,
  text: 'a\ufffc',
  sourceOffsets: [
    { at: 0, source: 0 },
    { at: 2, source: 9 },
  ],
});
const source = (unit = 1) => ({
  site: { paragraph: 0, equationNode: 3, currentUnit: unit },
  script: 'x',
  decoding: { script: 'exact' },
  fontSize: 1000,
  color: 0x112233,
});
const context = () => ({ save() {}, restore() {} });
test('HWP5 source anchors use shared equation layout and COLORREF without per-equation queries', () => {
  let snapshots = 0,
    measures = 0,
    layouts = 0;
  const editor = {
    supportsEquationSources: () => true,
    equationSnapshot(section, layout) {
      snapshots++;
      assert.equal(section, 0);
      assert.equal(layout, 'version-only');
      return [source()];
    },
    measureEquation(script, settings) {
      measures++;
      assert.equal(script, 'x');
      assert.ok(settings.size > 0);
      return { ready: true, requests: [] };
    },
    layoutEquation() {
      layouts++;
      return { box: { width: 12, ascent: 10, descent: 2 } };
    },
  };
  const content = { paragraphs: [paragraph()] };
  attachHwp5EquationRendering(editor, content, context);
  assert.deepEqual([snapshots, measures, layouts], [1, 1, 1]);
  assert.deepEqual(content.equationErrors, []);
  assert.deepEqual(content.equationPaintErrors, []);
  assert.deepEqual(content.paragraphs[0].equations, [{ node: 3, unit: 1 }]);
  assert.equal(content.paragraphs[0].equationPaint[0].color, '#332211');
  assert.equal(content.paragraphs[0].equationPaint[0].unit, 1);
  assert.equal(content.paragraphs[0].editable, undefined);
});
test('HWP5 equation binding failure is diagnostic and never publishes partial section anchors', () => {
  for (const kind of ['inside-anchor', 'duplicate-node', 'duplicate-paragraph']) {
    let measured = 0;
    const content = { paragraphs: [paragraph()] };
    if (kind === 'duplicate-paragraph') content.paragraphs.push(paragraph());
    const editor = {
      supportsEquationSources: () => true,
      equationSnapshot: () => (kind === 'duplicate-node' ? [source(), source()] : [source(2)]),
      measureEquation() {
        measured++;
        throw Error('must not measure');
      },
    };
    attachHwp5EquationRendering(editor, content, context);
    assert.equal(measured, 0);
    assert.equal(content.equationErrors.length, 1);
    assert.ok(
      content.paragraphs.every((p) => p.equations.length === 0 && p.equationPaint.length === 0),
    );
  }
});
test('old HWP5 engines remain readable without inventing equation capabilities', () => {
  const content = { paragraphs: [paragraph()] };
  attachHwp5EquationRendering({}, content, context);
  assert.equal(content.equationAvailable, false);
  assert.equal(content.equationPaintAvailable, false);
  assert.deepEqual(content.paragraphs[0].equationPaint, []);
  assert.equal(content.paragraphs[0].text, 'a\ufffc');
});
test('batched source boundaries preserve exact extended-control edges and reject their interior', () => {
  const offsets = [
    { at: 0, source: 0 },
    { at: 2, source: 9 },
  ];
  assert.deepEqual(sourceDisplayPositions([0, 1, 9], offsets, 2), [0, 1, 2]);
  assert.equal(sourceDisplayPosition(9, offsets, 2), 2);
  for (let unit = 2; unit < 9; unit++)
    assert.throws(() => sourceDisplayPosition(unit, offsets, 2), RangeError);
  assert.throws(() => sourceDisplayPositions([9, 1], offsets, 2), RangeError);
  assert.throws(() => sourceDisplayPositions([10], offsets, 2), RangeError);
});

test('bulk source boundaries advance linearly across many adjacent protected controls', () => {
  const count = 10000;
  let reads = 0;
  const offsets = Array.from({ length: count + 1 }, (_, index) => ({
    get at() {
      reads++;
      return index;
    },
    get source() {
      reads++;
      return index * 8;
    },
  }));
  const boundaries = Array.from({ length: count + 1 }, (_, index) => index * 8);
  assert.deepEqual(
    sourceDisplayPositions(boundaries, offsets, count),
    Array.from({ length: count + 1 }, (_, index) => index),
  );
  assert.ok(reads < 20 * (count + 1), `UnexpectedRepeatedOffsetScan:${reads}`);
  const mixed = [
    { at: 0, source: 0 },
    { at: 1, source: 8 },
    { at: 5, source: 19 },
  ];
  for (const [raw, visible] of [
    [0, 0],
    [8, 1],
    [9, 2],
    [10, 3],
    [11, 4],
    [19, 5],
    [20, 6],
  ])
    assert.equal(sourceDisplayPosition(raw, mixed, 6), visible);
  for (const raw of [1, 7, 12, 18, 21, -1, 0.5])
    assert.throws(() => sourceDisplayPosition(raw, mixed, 6), /InvalidSourceDisplayPosition/);
});
