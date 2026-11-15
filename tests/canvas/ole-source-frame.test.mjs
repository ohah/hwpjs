import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedOleAxisFrame, hasOleSourceFrame } from '../../js/ole-source-frame.mjs';
import { placeFloatingOleSource } from '../../web/preview/ole-placement.mjs';
const source = () => ({
  transform_identity: false,
  geometry: { width: 20000, height: 12000, width_relative: 4, height_relative: 2 },
  axis_frame: {
    original: [10000, 4000],
    current: [20000, 12000],
    matrix: [2, 0, 0, 0, 3, 0],
    angle: 0,
    flip: [false, false],
    reverse: null,
    offset: [0, 0],
  },
});
test('Native positive axis frame matches raw original/current/display dimensions without assuming transform identity', () => {
  const s = source();
  assert(hasOleSourceFrame(s));
  assert.equal(s.transform_identity, false);
});
test('missing Native frame, stale geometry, unknown rotation, shear, flip and local offsets cannot certify placement', () => {
  for (const change of [
    (s) => delete s.axis_frame,
    (s) => s.axis_frame.original[0]++,
    (s) => s.axis_frame.current[1]++,
    (s) => s.geometry.width++,
    (s) => delete s.axis_frame.angle,
    (s) => (s.axis_frame.angle = 1),
    (s) => (s.axis_frame.flip[0] = true),
    (s) => (s.axis_frame.matrix[1] = 1),
    (s) => (s.axis_frame.matrix[2] = 10),
    (s) => (s.axis_frame.matrix[0] = -2),
    (s) => (s.axis_frame.offset[0] = 1),
    (s) => (s.axis_frame.reverse = false),
    (s) => (s.geometry.width_relative = 0),
  ]) {
    const s = source();
    change(s);
    assert.equal(hasOleSourceFrame(s), false);
    assert.equal(placeFloatingOleSource(s, {}, {}).state, 'unavailable');
  }
});
test('optional proof arrays and records reject accessors and sparse data without invoking callbacks', () => {
  let called = 0;
  const s = source();
  Object.defineProperty(s.axis_frame.matrix, '0', {
    get() {
      called++;
      return 2;
    },
  });
  assert.equal(checkedOleAxisFrame(s.axis_frame), null);
  assert.equal(called, 0);
  s.axis_frame.matrix = Array(6);
  assert.equal(checkedOleAxisFrame(s.axis_frame), null);
});
test('legacy explicit identity remains unchanged; unknown or false identity without current source witness is unavailable', () => {
  assert(hasOleSourceFrame({ transform_identity: true }));
  assert.equal(hasOleSourceFrame({ transform_identity: null }), false);
  assert.equal(hasOleSourceFrame({ transform_identity: false }), false);
});

test('scaled current Native frame permits painter preview only while authoritative value stays null', async () => {
  const { createChartPreviewResourceReader, compatibleChartPreviewKeys } =
    await import('../../web/preview/chart-preview-resource-reader.mjs');
  const native = source();
  native.binary_item_id = 'ole1';
  native.position = { flags: [true, false, false, false], relations: [2, 2, 0, 0] };
  const target = { section: 0, wrapper: 3, paragraph: 0, anchorUnit: 0, error_name: null };
  const content = {
    chartTargets: [target],
    paragraphs: [{ section: 0, paragraph: 0, text: '\ufffc' }],
    oles: [
      {
        section: 0,
        oleNode: 7,
        chartWrapper: 3,
        paragraph: 0,
        anchorUnit: 0,
        state: 'located',
        representation: 'chart-alternative',
        source: native,
      },
    ],
  };
  const display = {
    pair: { section_ordinal: 0, wrapper_node: 3 },
    host: { wrapper_node: 3, geometry: { ...native.geometry }, position: native.position },
  };
  const entry = { value: null, error: null, previewValue: display };
  const read = createChartPreviewResourceReader(content, { status: () => entry });
  assert.equal(read(0, 3).provisional, true);
  assert.equal(entry.value, null);
  assert.equal(compatibleChartPreviewKeys(content, structuredClone(content)).size, 1);
  const changed = structuredClone(content);
  changed.oles[0].source.geometry.width++;
  assert.equal(compatibleChartPreviewKeys(content, changed).size, 0);
  assert.equal(createChartPreviewResourceReader(changed, { status: () => entry })(0, 3), entry);
});
