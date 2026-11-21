import { createCreatedCellPropertiesApi } from '../js/created-cell-properties-api.mjs';
import { layoutCreatedTable } from '../web/preview/created-table-layout.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCreatedCellProjection } from '../js/created-cell-properties-projection.mjs';
import { decodeCreatedTables } from '../js/hwpx-created-tables.mjs';
import { decodeHwp5CreatedTables } from '../js/hwp5-created-tables.mjs';
import { createdCellGrid } from '../web/preview/created-cell-grid.mjs';
import {
  createdCellAppearancePlan,
  addCreatedCellPaintIndex,
  createdCellPlanForBox,
} from '../web/preview/created-cell-appearance-plan.mjs';
import { paintTableBorder } from '../web/preview/table-border-paint.mjs';
const bytes = (v) => new TextEncoder().encode(JSON.stringify(v));
const edge = () => ({ style: 'SOLID', width_hundredth_mm: 10, color: 0x234567 });
function fixture(format) {
  const table = {
    identity: '17',
    instance_id: 19,
    host_paragraph: format === 'hwp5' ? 0 : 1,
    anchor_unit: 0,
    rows: 2,
    columns: 2,
    width: 210,
    height: 55,
    resources: { paragraph: 0, character: 0, style: 0, border_fill: format === 'hwp5' ? 0 : 1 },
    cells: [
      { paragraph_id: 1, row: 0, column: 0, x: 0, y: 0, width: 100, height: 20, text: 'a' },
      { paragraph_id: 2, row: 0, column: 1, x: 100, y: 0, width: 110, height: 30, text: '셀😀' },
      { paragraph_id: 3, row: 1, column: 0, x: 0, y: 30, width: 100, height: 25, text: 'b' },
      { paragraph_id: 4, row: 1, column: 1, x: 100, y: 30, width: 100, height: 20, text: 'c' },
    ],
  };
  const options = {
    common: {
      flags: 0x6a2211,
      offset_y: 0,
      offset_x: 0,
      z_order: 0,
      margins: [0, 0, 0, 0],
      prevent_page_break: false,
      description: '',
    },
    table: { page_break: 1, repeat_header: false, cell_spacing: 0, margins: [0, 0, 0, 0] },
    cell: { layout: 'observed8', unknown: 0, attributes: 0, margins: [0, 0, 0, 0] },
  };
  const result = {
    schemaVersion: 1,
    format,
    tables: format === 'hwp5' ? [{ table, options }] : [table],
    styles: table.cells.map((c) => ({
      identity: '17',
      row: c.row,
      column: c.column,
      resource_id: 1,
      raw_sha256: '01'.repeat(32),
      effects_supported: true,
      raw_origin: 'save_materialized_resource',
      value: {
        edges: Array.from({ length: 4 }, edge),
        background:
          c.column === 1 && c.row === 0
            ? { solid: { color: 0x123456, hatch_color: 0 } }
            : { none: {} },
        diagonal: { directions: 'none', stroke: edge() },
      },
    })),
  };
  result.sections = [{ section: 0, tables: result.tables }];
  delete result.tables;
  for (const style of result.styles) style.section = 0;
  return result;
}
for (const format of ['hwp5', 'hwpx']) {
  test(
    format +
      ' explicit v1 admits per-cell height/width while old decoder rejects identical raw values',
    () => {
      const f = fixture(format);
      assert.throws(() =>
        format === 'hwp5'
          ? decodeHwp5CreatedTables(bytes(f.sections[0].tables))
          : decodeCreatedTables(bytes(f.sections[0].tables)),
      );
      const rows = decodeCreatedCellProjection(bytes(f), format),
        t = format === 'hwp5' ? rows[0].table : rows[0];
      assert.equal(t.createdCellPropertiesVersion, 1);
      assert.equal(t.cells[1].height, 30);
      assert.equal(t.cells[2].y, 30);
      assert.equal(t.cells[2].height, 25);
      assert.equal(t.cells[3].width, 100);
      assert.equal(t.cells[1].createdCellAppearance.resourceId, 1);
      assert.deepEqual(t.cells[1].createdCellAppearance.rawSHA256, '01'.repeat(32));
      const layout = createdCellGrid(t, { x: 10, y: 20 });
      assert.equal(layout.cells[1].x, 10 + (100 * 96) / 7200);
      assert.equal(layout.cells[2].y, 20 + (30 * 96) / 7200);
      assert.equal(layout.cells[1].width, (110 * 96) / 7200);
      assert.equal(layout.cells[2].height, (25 * 96) / 7200);
    },
  );
  test(format + ' full created layout preserves row specific physical widths', () => {
    const rows = decodeCreatedCellProjection(bytes(fixture(format)), format),
      t = format === 'hwp5' ? rows[0].table : rows[0];
    t.section = 0;
    const layout = layoutCreatedTable(t, (text) => text.length * 5, { minimumRowHeight: 0 });
    assert.equal(layout.boxes.length, 4);
    assert.equal(layout.boxes[1].width, (110 * 96) / 7200);
    assert.equal(layout.boxes[3].width, (100 * 96) / 7200);
    assert.equal(layout.boxes[1].createdCell.column, 1);
    assert.equal(layout.boxes[3].createdCell.row, 1);
  });
  test(
    format +
      ' source geometry, owner duplication, missing style, unknown enums and raw digest refuse',
    () => {
      for (const mutate of [
        (f) => {
          (format === 'hwp5' ? f.sections[0].tables[0].table : f.sections[0].tables[0]).cells[2].y =
            20;
        },
        (f) => {
          f.styles[1] = structuredClone(f.styles[0]);
        },
        (f) => f.styles.pop(),
        (f) => {
          f.styles[0].value.edges[0].style = 'FAKE';
        },
        (f) => {
          f.styles[0].raw_sha256 = f.styles[0].raw_sha256.slice(1);
        },
        (f) => {
          f.styles[0].value.background = {
            solid: { color: 0x123456, hatch_color: 0, unknown: true },
          };
        },
      ]) {
        const f = fixture(format);
        mutate(f);
        assert.throws(() => decodeCreatedCellProjection(bytes(f), format));
      }
    },
  );
  test(
    format + ' actual common painter receives resolved fill/stroke for same generated owner',
    () => {
      const rows = decodeCreatedCellProjection(bytes(fixture(format)), format),
        t = format === 'hwp5' ? rows[0].table : rows[0];
      t.section = 0;
      const index = addCreatedCellPaintIndex(
          { available: false, cells: new Map() },
          { createdTables: [t] },
        ),
        box = {
          x: 10,
          y: 20,
          width: 40,
          height: 30,
          section: 0,
          createdCell: { identity: '17', row: 0, column: 1 },
        },
        plan = createdCellPlanForBox(index, box);
      assert.equal(plan.fill.color, '#123456');
      assert.equal(plan.strokes[0].color, '#234567');
      const calls = [];
      const ctx = new Proxy(
        {},
        {
          get(_t, key) {
            return (...args) => calls.push([key, ...args]);
          },
          set(_t, key, v) {
            calls.push([key, v]);
            return true;
          },
        },
      );
      assert.equal(paintTableBorder(ctx, box, plan, 0), true);
      assert.ok(calls.some(([k, v]) => k === 'fillStyle' && v === '#123456'));
      assert.ok(calls.some(([k, v]) => k === 'strokeStyle' && v === '#234567'));
      assert.deepEqual(
        createdCellPlanForBox(index, {
          ...box,
          createdCell: { identity: '999', row: 0, column: 1 },
        }),
        { state: 'proxy' },
      );
    },
  );
}
test('known unsupported edge/effects retain confirmed fill and report unavailable', () => {
  const f = fixture('hwpx');
  f.styles[1].value.edges[0].style = 'WAVE';
  const t = decodeCreatedCellProjection(bytes(f), 'hwpx')[0];
  const p = createdCellAppearancePlan(t.cells[1].createdCellAppearance);
  assert.equal(p.state, 'unavailable');
  assert.equal(p.fill.color, '#123456');
  const source = t.cells[1].createdCellAppearance;
  source.effectsSupported = false;
  assert.equal(createdCellAppearancePlan(source).error, 'UnsupportedCreatedCellEffects');
});

for (const format of ['hwp5', 'hwpx'])
  test(
    format + ' document cache one preparation across sections and full ticket invalidation',
    () => {
      const prefix = format + '_edit';
      let current,
        reads = 0;
      let binding = { document: '1', generation: '1', owner: '2', epoch: '0' };
      const first = fixture(format),
        second = fixture(format);
      const secondTable =
        format === 'hwp5' ? second.sections[0].tables[0].table : second.sections[0].tables[0];
      secondTable.identity = '18';
      secondTable.instance_id = 20;
      for (const c of secondTable.cells) c.paragraph_id += 10;
      first.sections.push({ section: 1, tables: second.sections[0].tables });
      first.styles.push(
        ...second.styles.map((entry) => ({ ...entry, section: 1, identity: '18' })),
      );
      const wasm = {
        [prefix + '_created_cell_properties_version']: () => 1,
        [prefix + '_created_cell_properties_ticket']: () => {
          current = binding;
          return 1;
        },
        [prefix + '_created_cell_properties_projection']: () => {
          reads++;
          current = first;
          return 1;
        },
        [prefix + '_set_created_cell_properties']: () => 1,
        [prefix + '_output_ptr']: () => 1,
        [prefix + '_output_len']: () => 1,
        [prefix + '_output_free']: () => {},
      };
      const api = createCreatedCellPropertiesApi({
        wasm,
        prefix,
        check() {},
        memory: { copy: () => bytes(current), error: () => Error('NativeRefusal') },
      });
      assert.equal(api.supportsCreatedCellPropertiesProjection(), true);
      const a = api.createdCellPropertiesProjection(0),
        b = api.createdCellPropertiesProjection(1);
      assert.equal(reads, 1);
      const t = format === 'hwp5' ? b[0].table : b[0];
      assert.equal(t.identity, '18');
      assert.equal(t.cells[1].createdCellAppearance.value.background.solid.color, 0x123456);
      // Cursor/selection never changes the Native ticket; repeated section reads hit the private cache.
      api.createdCellPropertiesProjection(0);
      api.createdCellPropertiesProjection(1);
      assert.equal(reads, 1);
      const firstTable = format === 'hwp5' ? a[0].table : a[0];
      firstTable.cells[1].width = 999;
      assert.notEqual(
        (format === 'hwp5'
          ? api.createdCellPropertiesProjection(0)[0].table
          : api.createdCellPropertiesProjection(0)[0]
        ).cells[1].width,
        999,
      );
      // Actual producer changes in any section invalidate the complete cached document.
      for (const [label, change] of [
        ['content', () => (binding.epoch = '1')],
        ['style', () => (binding.epoch = '2')],
        ['resize', () => (binding.epoch = '3')],
        ['undo', () => (binding.epoch = '4')],
        ['redo', () => (binding.epoch = '5')],
        ['reopen', () => (binding = { document: '9', generation: '2', owner: '8', epoch: '0' })],
      ]) {
        change();
        api.createdCellPropertiesProjection(0);
        api.createdCellPropertiesProjection(1);
        assert.equal(
          reads,
          ['content', 'style', 'resize', 'undo', 'redo', 'reopen'].indexOf(label) + 2,
        );
      }
      assert.throws(() => api.createdCellPropertiesProjection(2), /Section/);
    },
  );
