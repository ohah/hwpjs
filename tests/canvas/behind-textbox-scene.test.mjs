import test from 'node:test';
import assert from 'node:assert/strict';
import {
  behindTextboxScene,
  paintBehindTextboxScene,
  behindTextboxScopeError,
} from '../../web/preview/behind-textbox-scene.mjs';
import {
  tablePaintScene,
  topTablePaintRowIndex,
} from '../../web/preview/table-text-paint-order.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { objectActivationTarget } from '../../web/preview/object-activation-target.mjs';
import { drawingPagePolicyError } from '../../web/preview/drawing-page-policy.mjs';
function source() {
  return {
    drawing_node: 9,
    paragraph: 3,
    anchor_unit: 0,
    transform_identity: true,
    group_context: null,
    caption: null,
    geometry: { width: 100, height: 60, treat_as_character: false },
    flow: { text_wrap: 2, z_order: 0 },
    position: { relations: [0, 0, 0], flags: [false, false, true, false] },
    rendering: { matrix: [1, 0, 0, 0, 1, 0], angle: 0, flip: [false, false], reverse: null },
    rendering_corners: [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ],
    paint: { shadow_type: 0, fill_node: null },
  };
}
const row = (text) => ({
  section: 0,
  paragraph: text === 'BODY' ? 0 : 1,
  kind: 'text',
  text,
  x: 10,
  y: 20,
  width: 100,
  height: 20,
  textHeight: 20,
  textTop: 0,
  startUnit: 0,
  endUnit: 4,
  editable: true,
  selectable: true,
  boundaries: [
    { x: 0, unit: 0 },
    { x: 100, unit: 4 },
  ],
});
function fixture() {
  const drawing = { section: 0, drawingNode: 9, hostParagraph: 2, anchorUnit: 0, source: source() };
  const body = row('BODY'),
    inner = { ...row('BOX'), drawingNode: 9, drawingPaintLayer: 'behind', drawingPaintZOrder: 0 };
  const placed = {
    ...drawing,
    behindTextbox: true,
    layer: 'behind',
    zOrder: 0,
    rectangle: { x: 10, y: 20, width: 100, height: 60 },
  };
  return {
    drawing,
    body,
    inner,
    layout: { spatialRows: true, rows: [body, inner], placedDrawings: [placed] },
    outlines: { behind: [{ drawing, origin: placed.rectangle }], front: [] },
  };
}
test('atomic behind fill/outline/inner glyphs precede body glyphs even though source rows append inner text', () => {
  const f = fixture(),
    plan = behindTextboxScene(f.layout, f.outlines),
    calls = [];
  paintBehindTextboxScene(plan, {
    fill: () => calls.push('fill'),
    outline: () => calls.push('outline'),
    row: (r) => calls.push(r.text),
  });
  for (const c of tablePaintScene([], f.layout.rows))
    if (!plan.owners.has(c.item.section + ':' + c.item.drawingNode)) calls.push(c.item.text);
  assert.deepEqual(calls, ['fill', 'outline', 'BOX', 'BODY']);
  // Independent one-pixel painter witness: last overlapping ink belongs to body.
  let pixel;
  for (const x of calls) pixel = x;
  assert.equal(pixel, 'BODY');
});
test('overlap caret chooses body and exposed drawing text remains selectable', () => {
  const f = fixture();
  assert.equal(rowAtPoint(f.layout, 20, 25), 0);
  f.body.y = 90;
  assert.equal(rowAtPoint(f.layout, 20, 25), 1);
  assert.equal(
    topTablePaintRowIndex([f.inner, f.body], () => true),
    1,
  );
});
test('behind object boundary cannot steal an overlapping body click; exposed border can activate', () => {
  const f = fixture(),
    scene = {
      content: { format: 'hwpx', drawings: [f.drawing] },
      layout: f.layout,
      charts: [],
      picture: null,
      outlines: f.outlines,
    };
  assert.equal(objectActivationTarget(scene, 11, 25), null);
  f.body.y = 100;
  assert.deepEqual(objectActivationTarget(scene, 11, 25), {
    kind: 'drawing',
    section: 0,
    drawingNode: 9,
  });
});
test('two behind textboxes retain atomic ascending z order and stable source rows', () => {
  const f = fixture(),
    d = { ...f.layout.placedDrawings[0], drawingNode: 10, zOrder: -1 };
  f.layout.placedDrawings.unshift(d);
  f.layout.rows.push({ ...f.inner, drawingNode: 10, drawingPaintZOrder: -1, text: 'LOW' });
  const before = structuredClone(f.layout),
    p = behindTextboxScene(f.layout, f.outlines),
    calls = [];
  paintBehindTextboxScene(p, {
    fill: (d) => calls.push('fill' + d.drawingNode),
    outline: () => calls.push('outline9'),
    row: (r) => calls.push(r.text),
  });
  assert.deepEqual(calls, ['fill10', 'LOW', 'fill9', 'outline9', 'BOX']);
  assert.deepEqual(f.layout, before);
});
test('mismatched drawing row layer and duplicate paint owner reject rather than guessing', () => {
  const f = fixture();
  f.inner.drawingPaintZOrder = 1;
  assert.throws(() => behindTextboxScene(f.layout, f.outlines), /RowLayer/);
  f.inner.drawingPaintZOrder = 0;
  f.layout.placedDrawings.push(f.layout.placedDrawings[0]);
  assert.throws(() => behindTextboxScene(f.layout, f.outlines), /PaintOwner/);
  assert.throws(
    () => tablePaintScene([], [{ ...f.inner, tablePaintLayer: 'front' }]),
    /DrawingTextPaintLayer/,
  );
});
test('plain direct HWPX scope rejects nested or mixed object compositions', () => {
  const content = { format: 'hwpx', drawings: [{ source: source() }], paragraphs: [] };
  assert.equal(behindTextboxScopeError(content), null);
  for (const name of [
    'pictures',
    'tables',
    'containers',
    'curves',
    'curveTextSources',
    'ellipses',
    'forms',
    'formTexts',
    'checkBoxes',
  ])
    assert.equal(
      behindTextboxScopeError({ ...content, [name]: [{}] }),
      'UnsupportedBehindTextboxBodyObjects',
    );
  assert.equal(
    behindTextboxScopeError({ ...content, format: 'hwp5' }),
    'UnsupportedBehindTextboxFormat',
  );
  assert.equal(
    behindTextboxScopeError({
      ...content,
      drawings: [...content.drawings, { source: { ...source(), flow: { text_wrap: 3 } } }],
    }),
    'UnsupportedBehindTextboxOwnership',
  );
  assert.equal(behindTextboxScopeError({ format: 'hwpx', drawings: [], paragraphs: [] }), null);
});
test('behind admission retains geometry/shadow/caption/group/flow restrictions', () => {
  const s = source();
  assert.equal(drawingPagePolicyError(s, s, false, 'none', false, false, true), null);
  assert.equal(
    drawingPagePolicyError({ ...s, caption: {} }, s, false, 'none', false, false, true),
    'UnsupportedDrawingPageWrap',
  );
  assert.equal(
    drawingPagePolicyError(s, s, true, 'none', false, false, true),
    'UnsupportedDrawingPageWrap',
  );
  assert.equal(
    drawingPagePolicyError(
      s,
      { ...s, position: { flags: [false, true, true] } },
      false,
      'none',
      false,
      false,
      true,
    ),
    'UnsupportedDrawingFlowWithText',
  );
  const bad = structuredClone(s);
  bad.rendering.matrix[1] = 1;
  assert.equal(
    drawingPagePolicyError(bad, bad, false, 'none', false, false, true),
    'UnsupportedDrawingPageGeometry',
  );
});

test('existing null/invalid table order and incomplete drawing order stay rejected', () => {
  for (const item of [
    { tablePaintZOrder: null },
    { tablePaintZOrder: NaN },
    { drawingPaintLayer: 'behind' },
    { drawingPaintLayer: 'behind', drawingPaintZOrder: null },
    { drawingPaintZOrder: 1 },
    { drawingPaintLayer: 'behind', drawingPaintZOrder: 0, tablePaintZOrder: null },
  ])
    assert.throws(() => tablePaintScene([], [item]));
});

test('existing unrelated behind drawing placements are not taken over by textbox compositor', () => {
  const f = fixture();
  delete f.layout.placedDrawings[0].behindTextbox;
  const scene = behindTextboxScene(f.layout, f.outlines);
  assert.equal(scene.owners.size, 0);
  assert.deepEqual(scene.commands, []);
});

test('old page-policy callers do not implicitly admit behind', () => {
  const s = source();
  assert.equal(drawingPagePolicyError(s, s, false, 'none'), 'UnsupportedDrawingPageWrap');
});
