import type { EditorState } from '../state/editor-state.ts';
import { getSelectionFormatting } from '../state/formatting-state.ts';
import {
  sourceTableCellBlockPlan,
  type SourceTableCellBlockWitness,
} from './source-table-cell-merge.ts';
/** Canonical Native DTO admission, not a surface/pixel permission or a stored target lease. */
export function planCellAppearanceSelection(
  state: EditorState,
  witness: SourceTableCellBlockWitness,
) {
  const content = state.content as any,
    caps = state.capabilities as any;
  if (
    state.status !== 'ready' ||
    state.historyRecoveryRequired ||
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    caps?.readOnly === true ||
    caps?.cellStyleBatchAvailable !== true ||
    content?.readOnly === true ||
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content.limited !== false ||
    content.window ||
    content.viewKind ||
    content.createdTableHostPending
  )
    throw Error('CellAppearanceUnavailable');
  const plan = sourceTableCellBlockPlan(state, witness, true);
  const tables = content.tables.filter(
    (t: any) => t.section === witness.section && t.tableNode === witness.tableNode,
  );
  const selected = new Set(witness.cells.map((c) => c.listNode));
  const cells = tables[0].cells.filter((c: any) => selected.has(c.listNode));
  if (cells.some((c: any) => c.protected === true)) throw Error('ProtectedCell');
  const target = getSelectionFormatting(state).target;
  const rows = content.paragraphs.filter(
    (p: any) => p.section === target?.section && p.paragraph === target?.paragraph,
  );
  if (
    rows.length !== 1 ||
    rows[0].tableCell?.tableNode !== witness.tableNode ||
    target?.section !== witness.section ||
    !selected.has(rows[0].tableCell?.listNode)
  )
    throw Error('CellAppearanceSelectionMismatch');
  return Object.freeze({
    ...plan,
    cells: Object.freeze(
      cells.map((c: any) =>
        Object.freeze({
          section: witness.section,
          tableNode: witness.tableNode,
          listNode: c.listNode,
        }),
      ),
    ),
  });
}
