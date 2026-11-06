import { paintTableBorder } from '../../web/preview/table-border-paint.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hwp5TableBorderPaintPlan,
  hwp5TableBorderPaintIndex,
} from '../../web/preview/hwp5-table-border-plan.mjs';
const source = (attributes = 0) => ({
  id: 1,
  attributes,
  fill_known: true,
  fill_flags: 1,
  unknown_fill_bytes: null,
  extra_bytes: 0,
  additional_bytes: 0,
  pattern: { background: 0x563412, foreground: 0, kind: -1 },
  image: null,
  gradient: null,
  alpha: null,
  borders: Array.from({ length: 5 }, (_, edge) => ({
    kind: 1,
    width: edge === 4 ? 7 : 0,
    color: edge === 4 ? 0xa17329 : 0x563412,
  })),
});
test('official literal HWP5 attributes select independent diagonal geometry and COLORREF stroke', () => {
  for (const [attrs, expected] of [
    [0, []],
    [0x08, ['rising']],
    [0x40, ['falling']],
    [0x48, ['rising', 'falling']],
  ]) {
    const raw = source(attrs),
      before = structuredClone(raw),
      plan = hwp5TableBorderPaintPlan(raw);
    assert.equal(plan.state, 'strokes');
    assert.deepEqual(
      (plan.diagonals ?? []).map((s) => s.direction),
      expected,
    );
    for (const line of plan.diagonals ?? []) {
      assert.equal(line.color, '#2973a1');
      assert.equal(line.width, (0.5 * 96) / 25.4);
      assert.equal(line.edge, undefined);
    }
    assert.deepEqual(
      plan.strokes.map((s) => s.edge),
      [0, 1, 2, 3],
    );
    assert.deepEqual(plan.fill, { state: 'solid', color: '#123456' });
    assert.deepEqual(raw, before);
  }
});
test('unsupported HWP5 diagonal shape or stroke preserves known edges and fill', () => {
  for (const attrs of [0x04, 0x10, 0x80, 0x100, 0x8000]) {
    const plan = hwp5TableBorderPaintPlan(source(attrs));
    assert.equal(plan.diagonalDiagnostic.state, 'unsupported');
    assert.equal(plan.diagonals, undefined);
    assert.equal(plan.strokes.length, 4);
    assert.equal(plan.fill.color, '#123456');
  }
  for (const patch of [
    { kind: 8 },
    { kind: 99 },
    { width: 16 },
    { width: -1 },
    { width: NaN },
    { color: 0xffffffff },
  ]) {
    const s = source(0x48);
    Object.assign(s.borders[4], patch);
    const plan = hwp5TableBorderPaintPlan(s);
    assert.equal(plan.diagonalDiagnostic.reason, 'UnsupportedTableDiagonalStroke');
    assert.equal(plan.strokes.length, 4);
    assert.equal(plan.fill.color, '#123456');
  }
});
test('HWP5 none, effect diagnostics, missing attributes and legacy inactive fifth edge', () => {
  const s = source(0x48);
  s.borders[4].kind = 0;
  assert.equal(hwp5TableBorderPaintPlan(s).diagonals, undefined);
  for (const attributes of [undefined, NaN, -1, 65536, 1, 2, 3, 0x49]) {
    const p = hwp5TableBorderPaintPlan({ ...source(), attributes });
    assert.equal(p.state, 'unavailable');
    assert.equal(p.fill.color, '#123456');
  }
  const legacy = source();
  legacy.borders[4] = { kind: 99 };
  const plan = hwp5TableBorderPaintPlan(legacy);
  assert.equal(plan.state, 'strokes');
  assert.equal(plan.diagonalDiagnostic, undefined);
});
test('HWP5 diagonal only plan remains none for orthogonal contract and index ownership stays checked', () => {
  const s = source(0x08);
  s.borders.slice(0, 4).forEach((b) => {
    b.kind = 0;
  });
  const p = hwp5TableBorderPaintPlan(s);
  assert.equal(p.state, 'none');
  assert.equal(p.strokes, undefined);
  assert.equal(p.diagonals.length, 1);
  const cell = {
    listNode: 3,
    layoutSource: { table_record_node: 2, list_node: 3, border_fill_id: 1 },
  };
  const content = {
    hwp5BorderFillSources: [s],
    tables: [{ section: 0, tableNode: 2, cells: [cell] }],
  };
  assert.deepEqual(hwp5TableBorderPaintIndex(content).cells.get('0:2:3'), p);
  content.hwp5BorderFillSources.push(s);
  assert.equal(hwp5TableBorderPaintIndex(content).cells.get('0:2:3').state, 'unavailable');
});

test('HWP5 adapter plans reach the shared Canvas painter with literal rising/falling endpoints', () => {
  for (const [attributes, ends] of [
    [0x08, [10, 120, 90, 80]],
    [0x40, [10, 80, 90, 120]],
  ]) {
    const s = source(attributes);
    s.fill_flags = 0;
    s.pattern = null;
    s.borders.slice(0, 4).forEach((b) => {
      b.kind = 0;
    });
    const paths = [],
      stack = [];
    let point;
    const ctx = {
      save() {
        stack.push(1);
      },
      restore() {
        stack.pop();
      },
      beginPath() {},
      rect() {},
      clip() {},
      setLineDash() {},
      moveTo(x, y) {
        point = [x, y];
      },
      lineTo(x, y) {
        point.push(x, y);
      },
      stroke() {
        paths.push([...point, this.strokeStyle]);
      },
    };
    assert.equal(
      paintTableBorder(
        ctx,
        { x: 10, y: 100, width: 80, height: 40 },
        hwp5TableBorderPaintPlan(s),
        20,
      ),
      true,
    );
    assert.deepEqual(paths, [[...ends, '#2973a1']]);
    assert.equal(stack.length, 0);
  }
});

for (const [attributes, directions] of [
  [0x08, ['rising']],
  [0x40, ['falling']],
  [0x48, ['rising', 'falling']],
])
  test('unsupported HWP5 outer stroke preserves independently known diagonal ' + attributes, () => {
    for (const patch of [{ kind: 2 }, { width: 16 }, { color: 0xffffffff }]) {
      const raw = source(attributes),
        before = structuredClone(raw);
      Object.assign(raw.borders[0], patch);
      const plan = hwp5TableBorderPaintPlan(raw);
      assert.equal(plan.state, 'unavailable');
      assert.equal(plan.error, 'UnsupportedHwp5TableBorder');
      assert.equal(plan.strokes, undefined);
      assert.equal(plan.diagonalDiagnostic, undefined);
      assert.deepEqual(
        plan.diagonals.map((s) => s.direction),
        directions,
      );
      for (const stroke of plan.diagonals) {
        assert.equal(stroke.color, '#2973a1');
        assert.equal(stroke.width, (0.5 * 96) / 25.4);
      }
      assert.deepEqual(plan.fill, { state: 'solid', color: '#123456' });
      Object.assign(before.borders[0], patch);
      assert.deepEqual(raw, before);
    }
  });

test('HWP5 partial diagonal preservation does not bypass fill, effect, prefix or raw shape guards', () => {
  for (const patch of [
    { fill_known: false },
    { unknown_fill_bytes: 1 },
    { extra_bytes: 1 },
    { fill_flags: 2 },
    { additional_bytes: 1 },
    { alpha: { pattern: 1, gradient: null, image: null } },
    { attributes: undefined },
    { attributes: 1 },
    { attributes: 2 },
    { attributes: 3 },
    { attributes: -1 },
    { attributes: 0x10000 },
    { borders: null },
    { attributes: 0x148 },
  ]) {
    const raw = source(0x48);
    raw.borders[0].kind = 2;
    Object.assign(raw, patch);
    const plan = hwp5TableBorderPaintPlan(raw);
    assert.equal(plan.state, 'unavailable');
    assert.equal(plan.diagonals, undefined);
    assert.equal(plan.diagonalDiagnostic, undefined);
  }
  for (const patch of [
    { kind: 0 },
    { kind: 8 },
    { kind: 99 },
    { width: 16 },
    { color: 0xffffffff },
  ]) {
    const raw = source(0x48);
    raw.borders[0].kind = 2;
    Object.assign(raw.borders[4], patch);
    assert.equal(hwp5TableBorderPaintPlan(raw).diagonals, undefined);
  }
  const none = source();
  none.borders[0].kind = 2;
  assert.equal(hwp5TableBorderPaintPlan(none).diagonals, undefined);
});
