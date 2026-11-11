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

export function sourceTableCellMergePlan(state: EditorState, witness: SourceTableCellBlockWitness) {
  const content = state.content as
    | {
        format?: string;
        sourceTableCellMergeAvailable?: boolean;
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
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    content?.format !== 'hwpx' ||
    content.sourceTableCellMergeAvailable !== true ||
    content.limited !== false ||
    content.readOnly ||
    content.viewKind ||
    content.window ||
    content.createdTableHostPending
  )
    throw Error('SourceTableCellMergeUnavailable');
  const { section, tableNode, rows, columns, cells } = witness;
  if (
    ![section, tableNode, rows, columns].every(uint) ||
    rows === 0 ||
    columns === 0 ||
    rows * columns > 4096 ||
    !Array.isArray(cells) ||
    cells.length < 2 ||
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
    table.cells.length !== rows * columns
  )
    throw Error('InvalidSourceTableCellBlock');

  const owners = new Map<number, Cell>(),
    slots = new Set<number>();
  for (const cell of table.cells) {
    const slot = cell.row * columns + cell.column;
    if (
      ![cell.listNode, cell.row, cell.column].every(uint) ||
      cell.row >= rows ||
      cell.column >= columns ||
      cell.rowSpan !== 1 ||
      cell.columnSpan !== 1 ||
      owners.has(cell.listNode) ||
      slots.has(slot)
    )
      throw Error('InvalidSourceTableCellBlock');
    owners.set(cell.listNode, cell);
    slots.add(slot);
  }
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
    bottom = Math.max(bottom, cell.row + 1);
    right = Math.max(right, cell.column + 1);
  }
  if ((bottom - top) * (right - left) !== selected.size) throw Error('InvalidSourceTableCellBlock');
  return Object.freeze({
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
