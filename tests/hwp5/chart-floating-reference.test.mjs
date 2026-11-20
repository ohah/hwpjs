import test from 'node:test';
import assert from 'node:assert/strict';
import { previewHwp5ChartLayers } from '../../web/preview/hwp5-chart-layers.mjs';
import { chartData } from './chart-display-wire-fixture.mjs';

// Authored layout and chart data; no Native or browser output is represented here.
function fixture(count = 4) {
  const paragraph = { section: 0, paragraph: 2, text: '\ufffc'.repeat(count) };
  const targets = Array.from({ length: count }, (_, i) => ({
    kind: 'hwp5-chart',
    format: 'hwp5',
    section: 0,
    paragraph: 2,
    controlNode: i + 1,
    anchorUnit: i,
    frame: {
      geometry: {
        width: 750,
        height: 750,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: false,
        horizontal_offset: i * 75,
        vertical_offset: 0,
      },
      position: { relations: [2, 3, 0, 0] },
    },
  }));
  const content = {
    paragraphs: [paragraph],
    pictures: [],
    hwp5ChartDisplayAvailable: true,
    hwp5ChartTargets: targets,
  };
  const layout = {
    height: count * 20,
    rows: targets.map((_, i) => ({
      kind: 'text',
      section: 0,
      paragraph: 2,
      startUnit: i,
      endUnit: i + 1,
      x: 20,
      y: i * 20,
      width: 100,
      height: 20,
    })),
  };
  const data = chartData();
  return { content, layout, read: () => ({ value: { data } }) };
}

test('H5 floating charts share paragraph bounds but retain each target placement and source order', () => {
  const f = fixture();
  f.content.hwp5ChartTargets.reverse();
  const before = structuredClone({ content: f.content, layout: f.layout });
  const value = previewHwp5ChartLayers(f.content, f.layout, 600, f.read);
  assert.equal(value.items.length, 4);
  assert.deepEqual(
    value.items.map((item) => [item.target.controlNode, item.x, item.y, item.width, item.height]),
    [
      [4, 23, 0, 10, 10],
      [3, 22, 0, 10, 10],
      [2, 21, 0, 10, 10],
      [1, 20, 0, 10, 10],
    ],
  );
  assert.equal(value.pending, 0);
  assert.deepEqual(value.unavailable, []);
  assert.deepEqual({ content: f.content, layout: f.layout }, before);
  // A later invocation owns a new layout; boxes must not survive between calls.
  f.layout.rows[0].x = 40;
  assert.equal(previewHwp5ChartLayers(f.content, f.layout, 600, f.read).items[0].x, 43);
});

test('H5 floating shared bounds preserve complete-row and transform refusal for every target', () => {
  for (const mutate of [
    (f) => {
      f.layout.rows[1].startUnit = 0;
    },
    (f) => {
      f.layout.rows[1].transform = [1, 0, 0, 1, 0, 0];
    },
    (f) => {
      f.layout.rows.pop();
    },
  ]) {
    const f = fixture();
    mutate(f);
    const value = previewHwp5ChartLayers(f.content, f.layout, 600, f.read);
    assert.equal(value.items.length, 0);
    assert.equal(value.unavailable.length, 4);
    assert.ok(
      value.unavailable.every((row) => row.reason === 'IncompleteHwp5ChartPreviewParagraph'),
    );
  }
  const f = fixture();
  f.layout.rows[0].width = NaN;
  const value = previewHwp5ChartLayers(f.content, f.layout, 600, f.read);
  assert.equal(value.items.length, 0);
  assert.ok(value.unavailable.every((row) => row.reason === 'missing_reference'));
});

test('H5 floating paragraph membership is read once per layout rather than once per object', () => {
  const count = 192,
    f = fixture(count);
  let starts = 0;
  for (const [i, row] of f.layout.rows.entries())
    Object.defineProperty(row, 'startUnit', {
      enumerable: true,
      get() {
        starts++;
        return i;
      },
    });
  const value = previewHwp5ChartLayers(f.content, f.layout, 600, f.read);
  assert.equal(value.items.length, count);
  assert.equal(starts, count);
});

test('H5 floating references isolate sections and ignore an unavailable non-target with the same ID', () => {
  const f = fixture(3),
    other = fixture(3);
  other.content.paragraphs[0].section = 1;
  for (const target of other.content.hwp5ChartTargets) target.section = 1;
  for (const row of other.layout.rows) {
    row.section = 1;
    row.x = 220;
    row.y += 100;
  }
  f.content.paragraphs.push(...other.content.paragraphs);
  f.layout.rows.push(...other.layout.rows);
  f.content.hwp5ChartTargets.push(
    { ...other.content.hwp5ChartTargets[0], error_name: 'AuthoredNonTarget' },
    ...other.content.hwp5ChartTargets,
  );
  const value = previewHwp5ChartLayers(f.content, f.layout, 600, f.read);
  assert.deepEqual(
    value.items.map((item) => [item.target.section, item.target.controlNode, item.x, item.y]),
    [
      [0, 1, 20, 0],
      [0, 2, 21, 0],
      [0, 3, 22, 0],
      [1, 1, 220, 100],
      [1, 2, 221, 100],
      [1, 3, 222, 100],
    ],
  );
  assert.deepEqual(
    value.unavailable.map((row) => [row.section, row.controlNode, row.reason]),
    [[1, 1, 'AuthoredNonTarget']],
  );
  // One incomplete owner cannot publish its cached refusal into another section.
  f.layout.rows[1].startUnit = 0;
  const refused = previewHwp5ChartLayers(f.content, f.layout, 600, f.read);
  assert.deepEqual(
    refused.items.map((item) => item.target.section),
    [1, 1, 1],
  );
  assert.equal(
    refused.unavailable.filter((row) => row.reason === 'IncompleteHwp5ChartPreviewParagraph')
      .length,
    3,
  );
  // New physical rows with the same numeric IDs must receive new boxes and checks.
  const replacement = structuredClone({ content: f.content, layout: f.layout });
  replacement.layout.rows[1].startUnit = 1;
  replacement.layout.rows[0].x = 70;
  const restored = previewHwp5ChartLayers(replacement.content, replacement.layout, 600, f.read);
  assert.equal(restored.items.length, 6);
  assert.deepEqual(
    restored.items.slice(0, 3).map((item) => item.x),
    [70, 71, 72],
  );
  // Ambiguous physical body rows fail only that owner context.
  replacement.content.paragraphs.push({ ...replacement.content.paragraphs[0] });
  const ambiguous = previewHwp5ChartLayers(replacement.content, replacement.layout, 600, f.read);
  assert.deepEqual(
    ambiguous.items.map((item) => item.target.section),
    [1, 1, 1],
  );
});
