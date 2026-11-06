// Main-granted fresh artifact only. Source/Core, independent save and UI evidence differ.
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
import { verifyAppearanceSaved } from '../tools/tests/table-appearance-save-oracle.mjs';
import {
  inspectCellBorderOriginal,
  verifyCellBorderSaved,
} from '../tools/tests/cell-border-save-oracle.mjs';
import { createMemory } from '../js/wasm-memory.mjs';
import { createEditor } from '../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../packages/core/src/runtime/reader-runtime.ts';
import { UNDO_COMMAND, REDO_COMMAND } from '../packages/core/src/commands/commands.ts';
const bgColor = 0x2468ac;
const borders = (format) =>
  targets[format].map((t, i) => ({
    ...owner(t),
    edges: i ? 10 : 5,
    style: i ? 'DOUBLE_SLIM' : 'SOLID',
    width: i ? 150 : 70,
    color: i ? 0 : 0x123456,
  }));
const background = (format) => ({ ...owner(targets[format][0]), color: bgColor });
function edits(format, cells, includeBg) {
  return cells.map((cell, i) => ({
    target: targets[format][i],
    operations: [
      ...(includeBg && i === 0 ? [{ kind: 'cell-background', color: bgColor }] : []),
      { kind: 'cell-border', ...cell },
    ],
  }));
}
const options = { maxEntries: 12, maxCheckpointBytes: 8 * 1024 * 1024 };
for (const format of ['hwp5', 'hwpx']) {
  for (const combined of [false, true]) {
    const name = `${format}-${combined ? 'appearance-atomic' : 'border-batch'}-sdk`;
    test(
      name,
      receipt(name, async () => {
        const input = fixture(format),
          cells = borders(format),
          sdk = await openSDK(format, input);
        try {
          // Existing one-cell independent oracle remains a separate control cohort.
          sdk.setCellBackground(background(format));
          const bgSaved = saveSDK(format, sdk);
          verifyCellBorderSaved({
            format,
            before: input,
            after: bgSaved,
            target: targets[format][0],
            operations: [{ kind: 'cell-background', color: bgColor }],
          });
          const baseline = combined ? input : bgSaved;
          if (combined) {
            sdk.close();
          }
          const active = combined ? await openSDK(format, input) : sdk;
          try {
            active.enableHistory(options);
            const initial = active.historyRevision();
            const call = () =>
              combined
                ? active.setCellAppearance({ cells, background: background(format) })
                : active.setCellBorders(cells);
            call();
            assert.notEqual(active.historyRevision(), initial);
            assert.equal(
              active.historyRevisions().length,
              2,
              'both dirty fields own exactly one new event',
            );
            const saved = saveSDK(format, active),
              revision = active.historyRevision(),
              revisions = active.historyRevisions();
            const expected = edits(format, cells, true);
            const independent = verifyAppearanceSaved({
              format,
              before: input,
              after: saved,
              edits: expected,
            });
            if (format === 'hwpx')
              assert.deepEqual(
                verifyAppearanceSaved(
                  { format, before: input, after: saved, edits: expected },
                  true,
                ),
                independent,
              );
            const wrong = structuredClone(expected);
            wrong[0].operations.at(-1).color ^= 1;
            assert.throws(
              () => verifyAppearanceSaved({ format, before: input, after: saved, edits: wrong }),
              'oracle must reject wrong expectation',
            );
            call();
            assert.equal(active.historyRevision(), revision);
            assert.deepEqual(active.historyRevisions(), revisions);
            assert.deepEqual(saveSDK(format, active), saved);
            assert.equal(active.undo(), true);
            assert.deepEqual(saveSDK(format, active), baseline);
            assert.equal(active.undo(), false);
            assert.equal(active.redo(), true);
            assert.deepEqual(saveSDK(format, active), saved);
            assert.equal(active.redo(), false);
            const reopened = await openSDK(format, saved);
            try {
              assert.deepEqual(saveSDK(format, reopened), saved);
            } finally {
              reopened.close();
            }
            return {
              independent,
              oneHistoryEvent: true,
              originals: targets[format].map((target) =>
                inspectCellBorderOriginal({ format, before: input, target }),
              ),
              output: artifact(`${name}.${format === 'hwp5' ? 'hwp' : 'hwpx'}`, saved),
            };
          } finally {
            if (combined) active.close();
          }
        } finally {
          sdk.close();
        }
      }),
    );
  }
  test(
    `${format}-sdk-invalid-background-after-valid-border`,
    receipt(`${format}-sdk-rollback`, async () => {
      const input = fixture(format),
        sdk = await openSDK(format, input);
      try {
        sdk.enableHistory(options);
        const cells = borders(format),
          before = saveSDK(format, sdk),
          rev = sdk.historyRevision(),
          history = sdk.historyRevisions();
        for (const invalid of [
          () =>
            sdk.setCellAppearance({
              cells,
              background: { ...background(format), listNode: 0xfffffffe },
            }),
          () => sdk.setCellBorders([cells[0], cells[0]]),
          () => sdk.setCellBorders(Array.from({ length: 4097 }, () => cells[0])),
          () => sdk.setCellBorders([cells[0], { ...cells[1], tableNode: 0xfffffffe }]),
        ]) {
          assert.throws(invalid);
          assert.deepEqual(saveSDK(format, sdk), before);
          assert.equal(sdk.historyRevision(), rev);
          assert.deepEqual(sdk.historyRevisions(), history);
        }
        sdk.setCellBorders([]);
        sdk.setCellAppearance({ cells: [], background: null });
        assert.equal(sdk.historyRevision(), rev);
        assert.deepEqual(saveSDK(format, sdk), before);
        return { invalidCases: 4, emptyCases: 2, noPublication: true };
      } finally {
        sdk.close();
      }
    }),
  );
  test(
    `${format}-raw-abi-native-membership-and-duplicate`,
    receipt(`${format}-raw-native-refusals`, async () => {
      const { exports: w } = await WebAssembly.instantiate(module, {}),
        m = createMemory(w),
        prefix = `${format}_edit_`,
        input = fixture(format),
        cells = borders(format);
      const ok = (status) => assert.equal(status, 1, m.error().message);
      const save = () => {
        ok(format === 'hwp5' ? w[`${prefix}save`](1) : w[`${prefix}save`]());
        try {
          return Buffer.from(m.copy(w[`${prefix}output_ptr`](), w[`${prefix}output_len`]()));
        } finally {
          w[`${prefix}output_free`]();
        }
      };
      const encoded = (requests) => {
        const bytes = Buffer.alloc(requests.length * 28);
        requests.forEach((r, i) =>
          [
            r.section,
            r.tableNode,
            r.listNode,
            r.edges,
            { NONE: 0, SOLID: 1, DOUBLE_SLIM: 2 }[r.style],
            r.width,
            r.color,
          ].forEach((v, j) => bytes.writeUInt32LE(v, i * 28 + j * 4)),
        );
        return bytes;
      };
      try {
        ok(m.withBytes(input, (p, n) => w[`${prefix}open`](p, n)));
        ok(w[`${prefix}history_enable`](12, 8 * 1024 * 1024));
        const before = save(),
          rev = w[`${prefix}history_revision`]();
        for (const request of [
          [cells[0], cells[0]],
          Array.from({ length: 4097 }, () => cells[0]),
          [cells[0], { ...cells[1], tableNode: 0xfffffffe }],
        ]) {
          const status = m.withBytes(encoded(request), (p, n) =>
            w[`${prefix}set_cell_borders`](p, n),
          );
          assert.equal(status, 0, 'Native must independently refuse');
          assert.deepEqual(save(), before);
          assert.equal(w[`${prefix}history_revision`](), rev);
        }
        const invalidBg = { ...background(format), listNode: 0xfffffffe };
        const status = m.withBytes(encoded(cells), (p, n) =>
          w[`${prefix}set_cell_appearance`](
            p,
            n,
            1,
            invalidBg.section,
            invalidBg.tableNode,
            invalidBg.listNode,
            invalidBg.color,
          ),
        );
        assert.equal(status, 0);
        assert.deepEqual(save(), before);
        assert.equal(w[`${prefix}history_revision`](), rev);
        return { nativeRefusals: 4, jsValidatorBypassed: true, historyUnchanged: true };
      } finally {
        w[`${prefix}close`]();
      }
    }),
  );
  test(
    `${format}-ReaderCore-appearance-one-event-and-late-rollback`,
    receipt(`${format}-core-appearance`, async () => {
      const factory = createReaderRuntimeFactory({ wasmModule: module }),
        e = createEditor({ runtimeFactory: factory }),
        input = fixture(format),
        cells = borders(format);
      try {
        await e.load(input, { format, history: { mode: 'legacy-v1', ...options } });
        const baseline = Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
        const apply = (message) =>
          e.requestExperimental(message, { mutation: true, token: e.getEditorState().token });
        const message = { kind: 'cell-appearance', cells, background: background(format) };
        const result = await apply(message);
        assert.equal(result.status, 'committed-with-snapshot', result.error);
        assert.equal(result.changed, true);
        const state = e.getEditorState(),
          rev = state.nativeHistoryRevision;
        assert.equal(state.nativeHistoryRevisions.length, 2, 'ReaderCore combined event');
        const saved = Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
        const independent = verifyAppearanceSaved({
          format,
          before: input,
          after: saved,
          edits: edits(format, cells, true),
        });
        const noop = await apply(message);
        assert.equal(noop.status, 'known-no-op');
        assert.equal(e.getEditorState().nativeHistoryRevision, rev);
        const invalid = await apply({
          ...message,
          cells: cells.map((c) => ({ ...c, color: 0xfedcba })),
          background: { ...background(format), listNode: 0xfffffffe },
        });
        assert.equal(invalid.status, 'rejected-unapplied');
        assert.equal(e.getEditorState().nativeHistoryRevision, rev);
        assert.deepEqual(Buffer.from((await e.save({ allowStaleLayout: true })).bytes), saved);
        const undo = await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
        assert.equal(undo.changed, true);
        assert.deepEqual(Buffer.from((await e.save({ allowStaleLayout: true })).bytes), baseline);
        const redo = await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
        assert.equal(redo.changed, true);
        assert.deepEqual(Buffer.from((await e.save({ allowStaleLayout: true })).bytes), saved);
        const reopened = createEditor({ runtimeFactory: factory });
        try {
          await reopened.load(saved, { format });
          assert.deepEqual(
            Buffer.from((await reopened.save({ allowStaleLayout: true })).bytes),
            saved,
          );
        } finally {
          await reopened.dispose();
        }
        return {
          independent,
          oneHistoryEvent: true,
          noop: true,
          invalidBackgroundRollback: true,
          output: artifact(`${format}-core-combined.${format === 'hwp5' ? 'hwp' : 'hwpx'}`, saved),
        };
      } finally {
        await e.dispose();
      }
    }),
  );
}

// R2 real Core-owned full table DTO admission, before browser workflows.
for (const format of ['hwp5', 'hwpx']) {
  test(
    `${format}-R2-real-Core-full-table-DTO-planner`,
    receipt(`${format}-core-table-dto-planner`, async () => {
      const { tableBorderPlan } = await import('../js/table-border-plan.mjs');
      const e = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
      });
      try {
        await e.load(fixture(format), { format, history: { mode: 'legacy-v1', ...options } });
        const dto = e.getEditorState().read((state) => structuredClone(state.content));
        assert.ok(Array.isArray(dto.tables) && dto.tables.length > 0);
        const observed = [];
        for (const table of dto.tables) {
          if (!table.cells?.length) continue;
          const request = {
            section: table.section,
            tableNode: table.tableNode,
            listNode: table.cells[0].listNode,
            mode: 'table',
            region: 'outer',
            style: 'SOLID',
            width: 70,
            color: 0x123456,
          };
          const plan = tableBorderPlan(table, request);
          observed.push({
            tableNode: table.tableNode,
            partial: table.partial,
            count: table.cells.length,
            state: plan.state,
            error: plan.error,
          });
          if (plan.state !== 'planned') continue;
          assert.equal(table.partial, false);
          assert.ok(plan.cells.length > 0);
          const range = tableBorderPlan(table, {
            ...request,
            mode: 'range',
            region: 'all',
            range: plan.bounds,
          });
          assert.equal(range.state, 'planned');
          assert.ok(range.cells.length > 0);
          assert.ok(
            range.cells.every((cell) =>
              table.cells.some((source) => source.listNode === cell.listNode),
            ),
          );
          return {
            realCoreReadDTO: true,
            fullSourceTable: table.tableNode,
            fullCells: table.cells.length,
            outerCells: plan.cells.length,
            rangeGridCells: range.cells.length,
            bounds: plan.bounds,
            observations: observed,
          };
        }
        assert.fail(`No actual full table admitted by planner: ${JSON.stringify(observed)}`);
      } finally {
        await e.dispose();
      }
    }),
  );
}
