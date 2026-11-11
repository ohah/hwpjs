import type { EditorState } from '../state/editor-state.ts';
import {
  sourceTableCellBlockPlan,
  type SourceTableCellBlockWitness,
} from './source-table-cell-merge.ts';
// @ts-ignore Pure source geometry is shared with the Worker.
import { sourceTableCellHeightPlan } from '../../../../web/preview/source-table-cell-height.mjs';

export interface SourceTableCellHeightMinimum {
  readonly listNode: number;
  readonly height: number;
}
declare const heightTarget: unique symbol;
/** A current F5 rectangle issued by the editor's owning surface. */
export interface SourceTableCellHeightTarget {
  readonly [heightTarget]: true;
}
export function sourceTableCellHeightRequest(
  state: EditorState,
  witness: SourceTableCellBlockWitness,
  minimums: readonly SourceTableCellHeightMinimum[],
) {
  const content = state.content as {
    format?: string;
    sourceTableCellHeightAvailable?: boolean;
    limited?: boolean;
    readOnly?: boolean;
    viewKind?: unknown;
    window?: unknown;
    createdTableHostPending?: boolean;
    tables?: { section: number; tableNode: number }[];
  };
  if (
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    content?.format !== 'hwpx' ||
    content.sourceTableCellHeightAvailable !== true ||
    content.limited !== false ||
    content.readOnly ||
    content.viewKind ||
    content.window ||
    content.createdTableHostPending
  )
    throw Error('SourceTableCellHeightUnavailable');
  const request = { ...sourceTableCellBlockPlan(state, witness), minimums };
  const table = content.tables?.find(
    (t) => t.section === request.section && t.tableNode === request.tableNode,
  );
  sourceTableCellHeightPlan(table, request);
  return request;
}
