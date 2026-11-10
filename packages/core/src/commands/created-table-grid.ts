import type { EditorState } from '../state/editor-state.ts';
// @ts-ignore Canonical SDK request capture is shared with the Worker and bundled by the package build.
import { captureCreatedTableGridRequest } from '../../../../js/created-table-grid.mjs';

export type CreatedTableGridAction =
  | 'insert-row'
  | 'delete-row'
  | 'insert-column'
  | 'delete-column';
export interface EditCreatedTableGridPayload {
  readonly section: number;
  readonly identity: string;
  readonly action: CreatedTableGridAction;
  readonly index: number;
}

/** Identity addresses are session local; the dispatch snapshot supplies the token fence. */
export function createdTableGridMessage(payload: EditCreatedTableGridPayload, state: EditorState) {
  const request = captureCreatedTableGridRequest(payload) as EditCreatedTableGridPayload;
  const content = state.content as
    | {
        createdTableGridAvailable?: unknown;
        createdTables?: Array<{ section: number; identity: string }>;
      }
    | undefined;
  if (content?.createdTableGridAvailable !== true) throw Error('CreatedTableGridUnavailable');
  if (
    !Array.isArray(content.createdTables) ||
    content.createdTables.filter(
      (table) => table.section === request.section && table.identity === request.identity,
    ).length !== 1
  )
    throw Error('InvalidCreatedTableGridTarget');
  return { kind: 'created-table-grid', ...request };
}
