import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDrawingObservationQuery } from '../../web/preview/drawing-observation.mjs';
const original = JSON.parse(
  readFileSync(new URL('./fixtures/textbox-h5-public-observation.json', import.meta.url)),
);
function resized() {
  const c = structuredClone(original),
    raw = c.hwp5Drawings[0].source,
    component = c.hwp5DrawingComponents[0],
    source = c.drawings[0].source;
  const sx = 2,
    sy = 3;
  raw.width *= sx;
  raw.height *= sy;
  raw.current_width = raw.width;
  raw.current_height = raw.height;
  component.current_width = raw.width;
  component.current_height = raw.height;
  c.hwp5DrawingLocalTransforms[0].matrix = [sx, 0, 0, 0, sy, 0];
  source.rendering.matrix = [sx, 0, 0, 0, sy, 0];
  source.geometry.width = raw.width;
  source.geometry.height = raw.height;
  source.rendering_corners = source.rendering_corners.map(([x, y]) => [x * sx, y * sy]);
  return c;
}
function get(c) {
  const row = c.drawings[0];
  return createDrawingObservationQuery(c).get(row.section, row.drawingNode);
}
test('current H5 scaled geometry reopens properties only with exact raw/component/transform/frame witnesses', () => {
  const c = resized(),
    before = structuredClone(c),
    value = get(c);
  assert.equal(value?.activationSafe, true);
  assert.equal(value.geometry.width, c.hwp5Drawings[0].source.width);
  assert.deepEqual(
    value.readText().paragraphs.map((x) => x.text),
    ['글상자'],
  );
  assert.deepEqual(c, before);
});
test('scaled current source never bypasses raw/Native/view mismatches or unknown rotation/group guards', () => {
  for (const change of [
    (c) => c.hwp5DrawingLocalTransforms[0].matrix[0]++,
    (c) => c.hwp5DrawingComponents[0].current_width++,
    (c) => c.hwp5Drawings[0].source.width++,
    (c) => c.drawings[0].source.rendering_corners[1][0]++,
    (c) => delete c.hwp5Drawings[0].source.rotation_angle,
    (c) => (c.hwp5DrawingComponents[0].rotation_angle = 1),
    (c) => (c.drawings[0].source.group_context = {}),
    (c) => (c.hwp5DrawingComponents[0].group_count = 1),
    (c) => (c.drawings[0].source.rendering.matrix[3] = 1),
    (c) => c.hwp5Drawings[0].anchor.current_unit++,
  ]) {
    const c = resized();
    change(c);
    assert.notEqual(get(c)?.activationSafe, true);
  }
});
test('HX resized positive source axes reopen without manufacturing transform identity', () => {
  const h5 = resized(),
    row = h5.drawings[0];
  const c = {
    format: 'hwpx',
    limited: false,
    drawings: [
      {
        ...row,
        source: {
          ...row.source,
          transform_identity: false,
          drawing_node: row.drawingNode,
          paragraph: row.hostParagraph + 1,
          anchor_unit: row.anchorUnit,
        },
      },
    ],
    paragraphs: [],
  };
  assert.equal(get(c)?.activationSafe, true);
  c.drawings[0].source.rendering.angle = 30;
  assert.notEqual(get(c)?.activationSafe, true);
});
