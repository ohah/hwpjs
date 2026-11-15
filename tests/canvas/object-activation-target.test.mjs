import test from 'node:test';
import assert from 'node:assert/strict';
import { objectActivationTarget as hit } from '../../web/preview/object-activation-target.mjs';
const box = { x: 10, y: 20, width: 100, height: 60 };
const drawing = {
  section: 0,
  drawingNode: 9,
  hostParagraph: 2,
  anchorUnit: 0,
  source: {
    drawing_node: 9,
    paragraph: 3,
    anchor_unit: 0,
    rendering: { angle: 0 },
    transform_identity: true,
    group_context: null,
  },
};
const scene = () => ({
  content: { format: 'hwpx', drawings: [drawing] },
  layout: { placedDrawings: [{ ...drawing, rectangle: box }] },
  charts: [],
  picture: null,
  outlines: { front: [], behind: [] },
});
test('only a painted chart can activate; source target alone and rectangle edges cannot', () => {
  const s = scene();
  s.layout.placedDrawings = [];
  s.content.chartTargets = [{ section: 0, wrapper: 3 }];
  assert.equal(hit(s, 30, 30), null);
  s.charts = [{ ...box, target: { section: 0, wrapper: 3 } }];
  assert.deepEqual(hit(s, 30, 30), { kind: 'chart', section: 0, wrapper: 3 });
  assert.equal(hit(s, 110, 30), null);
  assert.equal(hit(s, NaN, 30), null);
});
test('the actual selected picture wins inside an enclosing text box', () => {
  const s = scene();
  s.picture = { picture: { section: 0, pictureNode: 7 } };
  assert.deepEqual(hit(s, 30, 30), { kind: 'picture', section: 0, pictureNode: 7 });
  assert.ok(Object.isFrozen(hit(s, 30, 30)));
});
test('drawing placement must join the current source owner and anchor', () => {
  const s = scene();
  assert.deepEqual(hit(s, 11, 30), { kind: 'drawing', section: 0, drawingNode: 9 });
  s.layout.placedDrawings[0].anchorUnit = 1;
  assert.equal(hit(s, 11, 30), null);
  s.layout.placedDrawings[0].anchorUnit = 0;
  s.content.drawings.push({ ...drawing });
  assert.equal(hit(s, 11, 30), null);
});
test('a painted outline can select a text box but unknown rotations and groups are not guessed', () => {
  const s = scene();
  s.layout.placedDrawings = [];
  s.outlines.front = [{ drawing, origin: box }];
  assert.equal(hit(s, 11, 30).drawingNode, 9);
  s.content.drawings = [{ ...drawing, source: { ...drawing.source, rendering: { angle: 15 } } }];
  assert.equal(hit(s, 11, 30), null);
  s.content.drawings = [
    {
      ...drawing,
      source: { ...drawing.source, rendering: { angle: 0 }, group_context: { node: 1 } },
    },
  ];
  assert.equal(hit(s, 11, 30), null);
});
test('conflicting painted charts or drawing owners do not choose an arbitrary dialog', () => {
  const s = scene();
  s.charts = [3, 4].map((wrapper) => ({ ...box, target: { section: 0, wrapper } }));
  assert.equal(hit(s, 30, 30), null);
  s.charts = [];
  const d = { ...drawing, drawingNode: 10, source: { ...drawing.source, drawing_node: 10 } };
  s.content.drawings.push(d);
  s.layout.placedDrawings.push({ ...d, rectangle: box });
  assert.equal(hit(s, 11, 30), null);
});

test('text box interior keeps text editing; only its visible frame border activates properties', () => {
  const s = scene();
  assert.equal(hit(s, 40, 40), null);
  assert.equal(hit(s, 11, 40).kind, 'drawing');
  s.content.drawings = [{ ...drawing, source: { ...drawing.source, transform_identity: false } }];
  assert.equal(hit(s, 11, 40), null);
});
