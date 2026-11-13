import { verifyCellFixtureInputs } from '../../../tools/shape-copy-cell-input-validation.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  createReaderRuntimeFactory,
  wasmModule,
  inputBytes,
} from './shape-copy-native-fixture.mjs';
import { getSelectionFormatting, planCellAppearanceSelection } from '@hwpjs/core';
import { createTableCellAppearanceObserver } from '../../../js/table-cell-appearance-observation.mjs';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
export const saved = async (e) => Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
export const seedDraft = {
  border: {
    mode: 'cell',
    region: 'all',
    startRow: '',
    endRow: '',
    startColumn: '',
    endColumn: '',
    edges: 15,
    style: 'SOLID',
    width: '20',
    color: '#123456',
    dirty: { style: true, width: true, color: true },
  },
  background: {
    kind: 'hatch',
    color: '#abcdef',
    hatchColor: '#112233',
    hatchStyle: 'CROSS',
    dirty: true,
  },
  diagonal: {
    directions: 'rising',
    style: 'SOLID',
    width: '20',
    color: '#445566',
    dirty: { directions: true, style: true, width: true, color: true },
  },
};
export async function fixture(format = 'hwp5', { opaqueTargets = false } = {}) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
  let original;
  if (opaqueTargets) {
    assert.equal(format, 'hwpx');
    assert(process.env.HWPJS_CELL_FIXTURE_INPUTS, 'explicit authored fixture pins required');
    const pins = JSON.parse(await readFile(process.env.HWPJS_CELL_FIXTURE_INPUTS, 'utf8'));
    await verifyCellFixtureInputs(pins);
    const record = pins.hwpxOpaque;
    original = await readFile(record.path);
    assert.equal(createHash('sha256').update(original).digest('hex'), record.sha256);
  } else original = await inputBytes(format);
  await e.load(original, { format, editable: true });
  const select = async (c) => {
    const table = e
      .getEditorState()
      .content.tables.find((t) => t.section === c.section && t.tableNode === c.tableNode);
    const cell = table.cells.find((v) => v.listNode === c.listNode);
    return e.setSelection(
      createParagraphSelection(e.getEditorState(), {
        section: c.section,
        paragraph: cell.paragraphs[0],
        startUnit: 0,
        endUnit: 0,
      }),
    );
  };
  const witness = (cells) => {
    const table = e
      .getEditorState()
      .content.tables.find(
        (t) => t.section === cells[0].section && t.tableNode === cells[0].tableNode,
      );
    const byId = new Map(table.cells.map((c) => [c.listNode, c]));
    return {
      section: table.section,
      tableNode: table.tableNode,
      rows: table.rows,
      columns: table.columns,
      cells: cells.map((v) => {
        const c = byId.get(v.listNode);
        return {
          listNode: c.listNode,
          row: c.row,
          column: c.column,
          paragraphs: [...c.paragraphs],
        };
      }),
    };
  };
  const known = [];
  for (const t of e.getEditorState().content.tables ?? []) {
    if (t.partial || t.parentListNode != null || t.createdTable) continue;
    for (const c of t.cells) {
      if (c.protected || c.rowSpan !== 1 || c.columnSpan !== 1) continue;
      const address = {
        section: t.section,
        tableNode: t.tableNode,
        listNode: c.listNode,
        row: c.row,
        column: c.column,
      };
      try {
        await select(address);
        planCellAppearanceSelection(e.getEditorState(), witness([address]));
        known.push(address);
      } catch {
        /* unsupported actual source cell */
      }
    }
  }
  const observe = createTableCellAppearanceObserver(e.getEditorState().content);
  const targetsKnown = opaqueTargets
    ? known.filter(
        (c) =>
          observe({ section: c.section, tableNode: c.tableNode, listNode: c.listNode }).fill
            .state === 'known',
      )
    : known;
  let targets;
  for (const c of targetsKnown) {
    const other = targetsKnown.find(
      (v) =>
        v.section === c.section &&
        v.tableNode === c.tableNode &&
        v.row === c.row &&
        v.column === c.column + 1,
    );
    if (other) {
      targets = [c, other];
      break;
    }
  }
  assert(targets, 'actual normal Native fixture must contain an eligible adjacent pair');
  const source = known.find(
    (c) => !targets.some((v) => v.section === c.section && v.listNode === c.listNode),
  );
  assert(source);
  const appearance = createTableCellAppearancePort(e, {
    getSelectionFormatting,
    createParagraphSelection,
  });
  const selection = () => ({
    state: e.getEditorState(),
    witness: witness(targets),
    current: () => true,
  });
  return {
    e,
    source,
    targets,
    select,
    witness,
    selection,
    appearance,
    original,
    cohort: opaqueTargets ? 'NEW-authored-explicit-opaque-HWPX' : 'original-Noori',
    close: async () => {
      appearance.dispose();
      await e.dispose();
    },
  };
}
