// Fresh main-granted WASM only; saved bytes and actual DTO paint plans, no browser claim.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  module,
  fixture,
  targets,
  owner,
  openSDK,
  saveSDK,
  receipt,
  artifact,
} from '../tools/tests/table-appearance-native-context.mjs';
import { verifyCellDiagonalSaved } from '../tools/tests/cell-diagonal-save-oracle.mjs';
import { hwp5TableBorderPaintPlan } from '../web/preview/hwp5-table-border-plan.mjs';
import { tableBorderPaintPlan } from '../web/preview/table-border-plan.mjs';
import { paintTableDiagonals } from '../web/preview/table-diagonal-paint.mjs';
const history = { maxEntries: 16, maxCheckpointBytes: 8 * 1024 * 1024 };
const geometryBits = { none: 0, rising: 8, falling: 64, cross: 72 };
const diagonal = (target, directions) => ({
  ...owner(target),
  directions,
  style: 'SOLID',
  width: 50,
  color: 0x123456,
});
function assertV2Export(format) {
  assert.ok(
    WebAssembly.Module.exports(module).some(
      (item) => item.name === `${format}_edit_set_cell_styles_v2` && item.kind === 'function',
    ),
    'fresh six-argument v2 ABI export',
  );
}
function actualPaint(format, sdk, rows) {
  const evidence = [];
  for (const row of rows) {
    let style, plan;
    if (format === 'hwp5') {
      const cells = sdk
        .cellLayoutSources(row.section)
        .filter(
          (cell) => cell.table_record_node === row.tableNode && cell.list_node === row.listNode,
        );
      assert.equal(cells.length, 1);
      const styles = sdk
        .borderFillSources()
        .filter((source) => source.id === cells[0].border_fill_id);
      assert.equal(styles.length, 1);
      style = styles[0];
      assert.equal(style.attributes & 0xfc, geometryBits[row.directions]);
      assert.equal(style.borders[4].kind, 1);
      assert.equal(style.borders[4].width, 7, '0.50mm H5 width code');
      assert.equal(style.borders[4].color, 0x563412, 'H5 COLORREF independent expected order');
      plan = hwp5TableBorderPaintPlan(style);
    } else {
      const report = sdk.tableBorderSources(row.section);
      const cells = report.cells.filter(
        (cell) => cell.table_node === row.tableNode && cell.list_node === row.listNode,
      );
      assert.equal(cells.length, 1);
      style = report.styles[cells[0].style_index];
      assert.equal(style.id, cells[0].border_fill_id);
      assert.equal(style.slash, ['rising', 'cross'].includes(row.directions) ? 'CENTER' : 'NONE');
      assert.equal(
        style.back_slash,
        ['falling', 'cross'].includes(row.directions) ? 'CENTER' : 'NONE',
      );
      assert.equal(style.center_line, 'NONE');
      for (const field of [
        'slash_crooked',
        'slash_is_counter',
        'back_slash_crooked',
        'back_slash_is_counter',
      ])
        assert.equal(style[field], '0');
      assert.equal(style.diagonal.style, 'SOLID');
      assert.equal(Number(style.diagonal.width.slice(0, -3)), 0.5);
      assert.equal(style.diagonal.color.toLowerCase(), '#123456');
      plan = tableBorderPaintPlan(style);
    }
    assert.notEqual(plan.state, 'unavailable', JSON.stringify({ style, plan }));
    assert.equal(plan.diagonalDiagnostic, undefined);
    const lines = plan.diagonals ?? [];
    const expectedDirections =
      row.directions === 'none'
        ? []
        : row.directions === 'cross'
          ? ['rising', 'falling']
          : [row.directions];
    assert.deepEqual(
      lines.map((line) => line.direction),
      expectedDirections,
    );
    for (const line of lines) {
      assert.equal(line.color, '#123456');
      assert.ok(Math.abs(line.width - (0.5 * 96) / 25.4) < 1e-12);
    }
    const points = [],
      ctx = {
        save() {},
        restore() {},
        beginPath() {},
        rect() {},
        clip() {},
        setLineDash() {},
        moveTo: (...p) => points.push(['move', ...p]),
        lineTo: (...p) => points.push(['line', ...p]),
        stroke() {},
      };
    assert.equal(
      paintTableDiagonals(ctx, { x: 10, y: 20, width: 100, height: 40 }, lines, 5),
      true,
    );
    assert.deepEqual(
      points,
      expectedDirections.flatMap((direction) =>
        direction === 'rising'
          ? [
              ['move', 10, 55],
              ['line', 110, 15],
            ]
          : [
              ['move', 10, 15],
              ['line', 110, 55],
            ],
      ),
    );
    evidence.push({ sourceId: style.id, directions: row.directions, lines });
  }
  return evidence;
}
async function verifyTransaction(format, sdk, input, request, edits, name) {
  sdk.enableHistory(history);
  const original = saveSDK(format, sdk),
    initial = sdk.historyRevision();
  sdk.setCellStyles(request);
  assert.notEqual(sdk.historyRevision(), initial);
  assert.equal(sdk.historyRevisions().length, 2, 'all owners and three components share one event');
  const saved = saveSDK(format, sdk),
    revision = sdk.historyRevision();
  const independent = verifyCellDiagonalSaved({ format, before: input, after: saved, edits });
  const painter = actualPaint(format, sdk, request.diagonals);
  const wrong = structuredClone(edits);
  wrong[0].diagonal.color ^= 1;
  assert.throws(
    () => verifyCellDiagonalSaved({ format, before: input, after: saved, edits: wrong }),
    'independent oracle must reject wrong fifth stroke color',
  );
  sdk.setCellStyles(request);
  assert.equal(sdk.historyRevision(), revision);
  assert.equal(sdk.historyRevisions().length, 2);
  assert.deepEqual(saveSDK(format, sdk), saved);
  assert.equal(sdk.undo(), true);
  assert.deepEqual(saveSDK(format, sdk), original);
  assert.equal(sdk.undo(), false);
  sdk.setCellStyles({ borders: [], fills: [], diagonals: [] });
  sdk.setCellStyles({ borders: [], fills: [] });
  assert.equal(sdk.historyRevision(), initial, 'empty v1/v2 requests preserve undone revision');
  assert.equal(sdk.redo(), true, 'empty requests retain redo');
  assert.deepEqual(saveSDK(format, sdk), saved);
  assert.equal(sdk.redo(), false);
  const reopened = await openSDK(format, saved);
  try {
    assert.deepEqual(saveSDK(format, reopened), saved);
    actualPaint(format, reopened, request.diagonals);
  } finally {
    reopened.close();
  }
  return {
    independent,
    painter,
    atomicHistory: true,
    noopRedo: true,
    saveReopen: true,
    output: artifact(name, saved),
  };
}
for (const format of ['hwp5', 'hwpx']) {
  const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
  for (const directions of ['none', 'rising', 'falling', 'cross']) {
    test(
      `${format} diagonal v2 ${directions} two owners exact saved bytes DTO paint and single history`,
      receipt(`${format}-diagonal-${directions}`, async () => {
        assertV2Export(format);
        const input = fixture(format),
          sdk = await openSDK(format, input);
        try {
          const diagonals = targets[format].map((target) => diagonal(target, directions));
          return await verifyTransaction(
            format,
            sdk,
            input,
            { borders: [], fills: [], diagonals },
            diagonals.map((row, i) => ({ target: targets[format][i], diagonal: row })),
            `${format}-diagonal-${directions}.${ext}`,
          );
        } finally {
          sdk.close();
        }
      }),
    );
  }
  test(
    `${format} diagonal v2 border fill and diagonal same owner commit one event`,
    receipt(`${format}-diagonal-combined`, async () => {
      assertV2Export(format);
      const input = fixture(format),
        sdk = await openSDK(format, input);
      try {
        const diagonals = targets[format].map((target, i) =>
          diagonal(target, i ? 'rising' : 'cross'),
        );
        const border = { ...owner(targets[format][0]), edges: 5, color: 0x765432 };
        const fill = { kind: 'solid', color: 0x2468ac };
        const request = {
          borders: [border],
          fills: [{ ...owner(targets[format][0]), fill }],
          diagonals,
        };
        const edits = diagonals.map((row, i) => ({
          target: targets[format][i],
          diagonal: row,
          ...(i ? {} : { border, fill }),
        }));
        return await verifyTransaction(
          format,
          sdk,
          input,
          request,
          edits,
          `${format}-diagonal-combined.${ext}`,
        );
      } finally {
        sdk.close();
      }
    }),
  );
  test(
    `${format} diagonal v2 invalid last owner rollback keeps redo and legacy four argument route keeps diagonal`,
    receipt(`${format}-diagonal-rollback-legacy`, async () => {
      assertV2Export(format);
      const input = fixture(format),
        sdk = await openSDK(format, input);
      try {
        sdk.enableHistory(history);
        const diagonals = targets[format].map((target) => diagonal(target, 'rising'));
        const request = { borders: [], fills: [], diagonals };
        sdk.setCellStyles(request);
        const changed = saveSDK(format, sdk);
        assert.equal(sdk.undo(), true);
        const before = saveSDK(format, sdk),
          revision = sdk.historyRevision(),
          revisions = sdk.historyRevisions();
        const border = { ...owner(targets[format][0]), edges: 15, color: 0x765432 };
        const fill = { ...owner(targets[format][0]), fill: { kind: 'solid', color: 0x2468ac } };
        const bad = { ...diagonals[1], tableNode: 0xfffffffe };
        for (const apply of [
          () => sdk.setCellStyles({ borders: [], fills: [], diagonals: [diagonals[0], bad] }),
          () =>
            sdk.setCellStyles({ borders: [border], fills: [fill], diagonals: [diagonals[0], bad] }),
          () =>
            sdk.setCellStyles({ borders: [], fills: [], diagonals: [diagonals[0], diagonals[0]] }),
        ]) {
          assert.throws(apply);
          assert.deepEqual(saveSDK(format, sdk), before);
          assert.equal(sdk.historyRevision(), revision);
          assert.deepEqual(sdk.historyRevisions(), revisions);
        }
        sdk.setCellStyles({ borders: [], fills: [], diagonals: [] });
        assert.equal(sdk.redo(), true);
        assert.deepEqual(saveSDK(format, sdk), changed);
        sdk.setCellStyles({ borders: [border], fills: [] });
        assert.equal(
          sdk.historyRevisions().length,
          3,
          'legacy four-arg setter adds just one event',
        );
        const legacySaved = saveSDK(format, sdk);
        const edits = diagonals.map((row, i) => ({
          target: targets[format][i],
          diagonal: row,
          ...(i ? {} : { border }),
        }));
        const independent = verifyCellDiagonalSaved({
          format,
          before: input,
          after: legacySaved,
          edits,
        });
        actualPaint(format, sdk, diagonals);
        assert.equal(sdk.undo(), true);
        assert.deepEqual(saveSDK(format, sdk), changed);
        assert.equal(sdk.redo(), true);
        assert.deepEqual(saveSDK(format, sdk), legacySaved);
        return {
          independent,
          invalidLastAndDuplicateCases: 3,
          redoPreserved: true,
          oldFourArgumentCompatible: true,
        };
      } finally {
        sdk.close();
      }
    }),
  );
}
