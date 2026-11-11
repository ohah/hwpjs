import test from 'node:test';
import assert from 'node:assert/strict';
import { pageReferenceBoxes } from '../../web/preview/page-reference-boxes.mjs';

const setting = {
  width: 72000,
  height: 144000,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 7200, right: 14400, top: 7200, bottom: 7200, gutter: 3600, header: 0, footer: 0 },
};
test('zero symmetric mirrored binding is parity invariant without inventing binding ownership', () => {
  const mirrored = {
    ...setting,
    gutter_type: 'left_right',
    margin: { ...setting.margin, right: 7200, gutter: 0 },
  };
  const before = structuredClone(mirrored);
  const single = { ...mirrored, gutter_type: 'left_only' };
  for (const ordinal of [0, 1, 2, 100])
    assert.deepEqual(
      pageReferenceBoxes(mirrored, { x: 10, y: 20 }, ordinal),
      pageReferenceBoxes(single, { x: 10, y: 20 }, ordinal),
    );
  assert.deepEqual(mirrored, before);
});
test('page boxes use physical units, margins and orientation', () => {
  const original = structuredClone(setting);
  assert.deepEqual(pageReferenceBoxes(setting, { x: 10, y: 20 }).boxes, {
    paper: { x: 10, y: 20, width: 960, height: 1920 },
    page: { x: 154, y: 116, width: 624, height: 1728 },
  });
  const landscape = pageReferenceBoxes({ ...setting, orientation: 'narrowly' }, { x: 0, y: 0 });
  assert.equal(landscape.boxes.paper.width, 1920);
  assert.equal(landscape.boxes.paper.height, 960);
  assert.deepEqual(setting, original);
  const withAreas = pageReferenceBoxes(
    { ...setting, margin: { ...setting.margin, header: 3600, footer: 7200 } },
    { x: 10, y: 20 },
  );
  assert.equal(withAreas.boxes.page.y, 164);
  assert.equal(withAreas.boxes.page.height, 1584);
});
test('missing ambiguous overflowing or invalid geometry never invents a page', () => {
  for (const source of [
    null,
    { ...setting, width: null },
    { ...setting, orientation: null },
    { ...setting, duplicate_margins: 1 },
    { ...setting, gutter_type: 'unknown' },
    { ...setting, margin: { ...setting.margin, left: 72000 } },
  ]) {
    assert.equal(pageReferenceBoxes(source, { x: 0, y: 0 }).state, 'unsupported_page_geometry');
  }
  assert.equal(
    pageReferenceBoxes(setting, { x: Infinity, y: 0 }).state,
    'unsupported_page_geometry',
  );
  assert.equal(pageReferenceBoxes(setting, { x: 0, y: 0 }, -1).state, 'unsupported_page_geometry');
});

test('binding uses physical parity and top gutter without transposing stored axes', () => {
  const mirror = { ...setting, gutter_type: 'left_right' };
  const odd = pageReferenceBoxes(mirror, { x: 0, y: 0 }, 0),
    even = pageReferenceBoxes(mirror, { x: 0, y: 0 }, 1);
  assert.equal(odd.boxes.page.x, 144);
  assert.equal(even.boxes.page.x, 192);
  assert.equal(odd.boxes.page.width, even.boxes.page.width);
  assert.deepEqual(
    pageReferenceBoxes({ ...mirror, physicalPageOffset: 1 }, { x: 0, y: 0 }, 0),
    even,
  );
  const top = pageReferenceBoxes({ ...setting, gutter_type: 'top_bottom' }, { x: 0, y: 0 });
  assert.equal(top.boxes.page.x, 96);
  assert.equal(top.boxes.page.y, 144);
  assert.equal(top.boxes.page.height, 1680);
  assert.equal(
    pageReferenceBoxes({ ...setting, physicalPageOffset: -1 }, { x: 0, y: 0 }).state,
    'unsupported_page_geometry',
  );
});
