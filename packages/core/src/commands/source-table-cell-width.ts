import type { EditorState } from '../state/editor-state.ts';
import {
  sourceTableCellBlockPlan,
  type SourceTableCellBlockWitness,
} from './source-table-cell-merge.ts';
// @ts-ignore Pure source geometry is shared with the Worker.
import { sourceTableCellWidthPlanForFormat } from '../../../../web/preview/source-table-cell-width-format.mjs';

declare const widthTarget: unique symbol;
/** A current F5 rectangle issued by the editor's owning surface. */
export interface SourceTableCellWidthTarget {
  readonly [widthTarget]: true;
}
export function sourceTableCellWidthRequest(
  state: EditorState,
  witness: SourceTableCellBlockWitness,
) {
  const content = state.content as {
    format?: string;
    sourceTableCellWidthAvailable?: boolean;
    limited?: boolean;
    readOnly?: boolean;
    viewKind?: unknown;
    window?: unknown;
    createdTableHostPending?: boolean;
    tables?: { section: number; tableNode: number }[];
  };
  if (
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    !['hwp5', 'hwpx'].includes(content?.format ?? '') ||
    content.sourceTableCellWidthAvailable !== true ||
    content.limited !== false ||
    content.readOnly ||
    content.viewKind ||
    content.window ||
    content.createdTableHostPending
  )
    throw Error('SourceTableCellWidthUnavailable');
  const request = sourceTableCellBlockPlan(state, witness);
  const table = content.tables?.find(
    (t) => t.section === request.section && t.tableNode === request.tableNode,
  );
  sourceTableCellWidthPlanForFormat(content.format, table, request);
  return request;
}
