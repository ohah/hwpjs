import type { EditorState } from '../state/editor-state.ts';
import type { SelectionTarget } from './commands.ts';
import { checkedOriginalCellSelector } from '../../../../js/original-cell-vertical-alignment.mjs';
import type { OriginalCellSelector } from './original-cell-vertical-alignment-dto.ts';
/** Canonical selected original owner only. Display coordinates and caller row/column are not authority. */
export function originalCellPropertiesSelector(
  state: EditorState,
  input: unknown,
): Readonly<OriginalCellSelector> {
  const selector = checkedOriginalCellSelector(input);
  const content = state.content as any,
    capabilities = state.capabilities as any,
    selection = state.selection as Partial<SelectionTarget> | null;
  if (
    state.status !== 'ready' ||
    state.historyRecoveryRequired ||
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    capabilities?.readOnly === true ||
    content?.readOnly === true ||
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content?.limited !== false ||
    content?.window ||
    content?.viewKind ||
    content?.createdTableHostPending
  )
    throw Error('OriginalCellVerticalAlignmentUnavailable');
  if (
    !selection ||
    selection.section !== selector.section ||
    selection.paragraph !== selector.paragraph ||
    !Number.isSafeInteger(selection.startUnit) ||
    (selection.startUnit as number) < 0 ||
    selection.startUnit !== selection.endUnit ||
    selection.owner !==
      `section:${selector.section}:table:${selector.tableNode}:list:${selector.listNode}`
  )
    throw Error('OriginalCellSelectionMismatch');
  const rows = content.paragraphs?.filter(
    (r: any) => r.section === selector.section && r.paragraph === selector.paragraph,
  );
  const tables = content.tables?.filter(
    (t: any) => t.section === selector.section && t.tableNode === selector.tableNode,
  );
  if (
    rows?.length !== 1 ||
    tables?.length !== 1 ||
    rows[0].createdCell ||
    rows[0].editable !== true ||
    rows[0].clipped ||
    rows[0].tableCell?.tableNode !== selector.tableNode ||
    rows[0].tableCell?.listNode !== selector.listNode ||
    tables[0].partial ||
    tables[0].createdTable ||
    tables[0].parentListNode != null
  )
    throw Error('InvalidOriginalCellOwner');
  const cells = tables[0].cells?.filter((c: any) => c.listNode === selector.listNode);
  if (
    cells?.length !== 1 ||
    cells[0].protected === true ||
    !cells[0].paragraphs?.includes(selector.paragraph)
  )
    throw Error('InvalidOriginalCellOwner');
  return selector;
}
