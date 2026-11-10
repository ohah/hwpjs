import type { EditorState } from '../state/editor-state.ts';
// @ts-ignore Canonical SDK capture is shared with the Worker and bundled by the package build.
import { captureSourceTableGridRequest } from '../../../../js/source-table-grid.mjs';

export type SourceTableGridAction = 'insert-row' | 'delete-row' | 'insert-column' | 'delete-column';
export interface EditSourceTableGridPayload {
  readonly section: number;
  readonly tableNode: number;
  readonly expectedRows: number;
  readonly expectedColumns: number;
  readonly action: SourceTableGridAction;
  readonly index: number;
  readonly layout?: 'spec6' | 'observed8';
}

/** Source node addresses are fenced by the dispatch snapshot; Native validates ownership. */
export function sourceTableGridMessage(payload: EditSourceTableGridPayload, state: EditorState) {
  const content = state.content as
    | { format?: unknown; sourceTableGridAvailable?: unknown }
    | undefined;
  const request = captureSourceTableGridRequest(
    payload,
    content?.format,
  ) as EditSourceTableGridPayload;
  if (content?.sourceTableGridAvailable !== true) throw Error('SourceTableGridUnavailable');
  return { kind: 'source-table-grid', ...request };
}
