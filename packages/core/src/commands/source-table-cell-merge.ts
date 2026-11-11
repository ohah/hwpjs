import type { EditorState } from '../state/editor-state.ts';
// @ts-ignore This existing display owner resolver is shared with Canvas and the Worker.
import { paragraphSelectionOwner } from '../../../../web/preview/paragraph-selection.mjs';

declare const mergeTarget: unique symbol;
/** Opaque target issued by the editor's active input surface. */
export interface SourceTableCellMergeTarget {
  readonly [mergeTarget]: true;
}

export interface SourceTableCellBlockWitness {
  readonly section: number;
  readonly tableNode: number;
  readonly rows: number;
  readonly columns: number;
  readonly cells: readonly {
    readonly listNode: number;
    readonly row: number;
    readonly column: number;
    readonly paragraphs: readonly number[];
  }[];
}

type Cell = SourceTableCellBlockWitness['cells'][number] & {
  rowSpan: number;
  columnSpan: number;
};
type Table = Omit<SourceTableCellBlockWitness, 'cells'> & {
  partial?: boolean;
  parentListNode?: number;
  createdTable?: boolean;
  cells: Cell[];
};
type Paragraph = {
  section: number;
  paragraph: number;
  editable: boolean;
  clipped?: boolean;
  sourceOffsets?: unknown;
  createdCell?: unknown;
  tableCell?: { tableNode: number; listNode: number };
};
const uint = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);

function sourceTableCellPlan(
  state: EditorState,
  witness: SourceTableCellBlockWitness,
  split: boolean,
) {
  const content = state.content as
    | {
        format?: string;
        sourceTableCellMergeAvailable?: boolean;
        sourceTableCellSplitAvailable?: boolean;
        sourceTableCellSplitProfile?: string;
        limited?: boolean;
        readOnly?: boolean;
        viewKind?: unknown;
        window?: unknown;
        createdTableHostPending?: boolean;
        tables?: Table[];
        paragraphs?: Paragraph[];
      }
    | undefined;
  if (
    !content ||
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    (split ? !['hwp5', 'hwpx'].includes(content?.format ?? '') : content?.format !== 'hwpx') ||
    (split
      ? content.sourceTableCellSplitAvailable !== true
      : content.sourceTableCellMergeAvailable !== true) ||
    content.limited !== false ||
    content.readOnly ||
    content.viewKind ||
    content.window ||
    content.createdTableHostPending
  )
    throw Error(split ? 'SourceTableCellSplitUnavailable' : 'SourceTableCellMergeUnavailable');
  const plan = sourceTableCellBlockPlan(state, witness, split);
  if (split && content?.format === 'hwp5') {
    const table = content.tables?.find(
      (value) => value.section === witness.section && value.tableNode === witness.tableNode,
    );
    if (
      !['single-unmerged-source-cell', 'single-source-cell-with-spans'].includes(
        content.sourceTableCellSplitProfile ?? '',
      ) ||
      plan.selectedCells !== 1 ||
      (content.sourceTableCellSplitProfile === 'single-unmerged-source-cell' &&
        table?.cells.some((cell) => cell.rowSpan !== 1 || cell.columnSpan !== 1))
    )
      throw Error('UnsupportedSourceTableSplitSelection');
  }
  return plan;
}

/** Common source owner/rectangle validation, without granting a mutation capability. */
export function sourceTableCellBlockPlan(
  state: EditorState,
  witness: SourceTableCellBlockWitness,
  split = false,
) {
  const content = state.content as { tables?: Table[]; paragraphs?: Paragraph[] };
  const { section, tableNode, rows, columns, cells } = witness;
  if (
    ![section, tableNode, rows, columns].every(uint) ||
    rows === 0 ||
    columns === 0 ||
    rows * columns > 4096 ||
    !Array.isArray(cells) ||
    cells.length < (split ? 1 : 2) ||
    cells.length > rows * columns
  )
    throw Error('InvalidSourceTableCellBlock');
  const matches = content.tables?.filter(
    (table) => table.section === section && table.tableNode === tableNode,
  );
  const table = matches?.[0];
  if (
    matches?.length !== 1 ||
    !table ||
    table.partial ||
    table.createdTable ||
    table.parentListNode != null ||
    table.rows !== rows ||
    table.columns !== columns ||
    table.cells.length > rows * columns ||
    (!split && table.cells.length !== rows * columns)
  )
    throw Error('InvalidSourceTableCellBlock');

  const owners = new Map<number, Cell>(),
    slots = new Uint8Array(rows * columns);
  for (const cell of table.cells) {
    if (
      ![cell.listNode, cell.row, cell.column, cell.rowSpan, cell.columnSpan].every(uint) ||
      !cell.rowSpan ||
      !cell.columnSpan ||
      cell.row >= rows ||
      cell.column >= columns ||
      cell.rowSpan > rows - cell.row ||
      cell.columnSpan > columns - cell.column ||
      (!split && (cell.rowSpan !== 1 || cell.columnSpan !== 1)) ||
      owners.has(cell.listNode)
    )
      throw Error('InvalidSourceTableCellBlock');
    for (let row = cell.row; row < cell.row + cell.rowSpan; row++)
      for (let column = cell.column; column < cell.column + cell.columnSpan; column++) {
        const slot = row * columns + column;
        if (slots[slot]) throw Error('InvalidSourceTableCellBlock');
        slots[slot] = 1;
      }
    owners.set(cell.listNode, cell);
  }
  if (slots.some((value) => value === 0)) throw Error('InvalidSourceTableCellBlock');
  const paragraphs = new Map<number, Paragraph | null>();
  const paragraphsByList = new Map<number, number[]>();
  for (const paragraph of content.paragraphs ?? []) {
    if (paragraph.section !== section) continue;
    const id = paragraph.paragraph;
    paragraphs.set(id, paragraphs.has(id) ? null : paragraph);
    const binding = paragraph.tableCell;
    if (binding?.tableNode === tableNode) {
      const owned = paragraphsByList.get(binding.listNode);
      if (owned) owned.push(id);
      else paragraphsByList.set(binding.listNode, [id]);
    }
  }
  let top = rows,
    left = columns,
    bottom = 0,
    right = 0;
  let selectedArea = 0;
  const selected = new Set<number>(),
    selectedParagraphs = new Set<number>();
  for (const selection of cells) {
    const cell = owners.get(selection.listNode);
    const actualParagraphs = paragraphsByList.get(selection.listNode);
    if (
      !cell ||
      selected.has(cell.listNode) ||
      selection.row !== cell.row ||
      selection.column !== cell.column ||
      !Array.isArray(selection.paragraphs) ||
      !cell.paragraphs.length ||
      selection.paragraphs.length !== cell.paragraphs.length ||
      actualParagraphs?.length !== cell.paragraphs.length
    )
      throw Error('InvalidSourceTableCellBlock');
    selected.add(cell.listNode);
    selectedArea += cell.rowSpan * cell.columnSpan;
    for (const [index, paragraph] of cell.paragraphs.entries()) {
      const p = paragraphs.get(paragraph);
      if (
        !uint(paragraph) ||
        selectedParagraphs.has(paragraph) ||
        selection.paragraphs[index] !== paragraph ||
        actualParagraphs[index] !== paragraph ||
        !p ||
        p.editable !== true ||
        p.clipped ||
        p.sourceOffsets ||
        p.createdCell ||
        p.tableCell?.tableNode !== tableNode ||
        p.tableCell.listNode !== cell.listNode ||
        !paragraphSelectionOwner(p)
      )
        throw Error('InvalidSourceTableCellBlock');
      selectedParagraphs.add(paragraph);
    }
    top = Math.min(top, cell.row);
    left = Math.min(left, cell.column);
    bottom = Math.max(bottom, cell.row + cell.rowSpan);
    right = Math.max(right, cell.column + cell.columnSpan);
  }
  if ((bottom - top) * (right - left) !== selectedArea) throw Error('InvalidSourceTableCellBlock');
  return Object.freeze({
    selectedCells: selected.size,
    section,
    tableNode,
    expectedRows: rows,
    expectedColumns: columns,
    top,
    left,
    bottom,
    right,
  });
}

export function sourceTableCellMergePlan(state: EditorState, witness: SourceTableCellBlockWitness) {
  const { selectedCells: _, ...plan } = sourceTableCellPlan(state, witness, false);
  return Object.freeze(plan);
}
export function sourceTableCellSplitPlan(state: EditorState, witness: SourceTableCellBlockWitness) {
  return sourceTableCellPlan(state, witness, true);
}
