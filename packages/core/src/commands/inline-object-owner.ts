import type { EditorState, StateToken } from '../state/editor-state.ts';
import { freezeDTO } from '../state/owned.ts';
import { checkedInlineObjectTarget } from '../../../../js/hwpx-inline-object-placement.mjs';
import type { InlineObjectOwnedAddress } from './inline-object-placement-dto.ts';
import { inlineInsertRecord } from '../../../../js/hwpx-inline-object-record.mjs';

/** Native query observation plus an editor lifetime token. A Surface is optional. */
export type InlineObjectCreateTarget = StateToken & {
  readonly coordinateSpace: 'inline-object';
  readonly format: 'hwpx';
  readonly address: InlineObjectOwnedAddress & {
    readonly unit: number;
    readonly expected_text: string;
  };
};
export function captureInlineObjectCreateTarget(input: unknown): InlineObjectCreateTarget {
  const target = inlineInsertRecord(input, [
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
    'coordinateSpace',
    'format',
    'address',
  ]);
  if (target.coordinateSpace !== 'inline-object' || target.format !== 'hwpx')
    throw Error('InvalidInlineObjectOwner');
  if (
    typeof target.editorId !== 'string' ||
    (target.documentId !== null && typeof target.documentId !== 'string') ||
    ![target.generation, target.operationRevision, target.viewRevision].every(
      (value) =>
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        !Object.is(value, -0),
    )
  )
    throw Error('InvalidInlineObjectOwner');
  const address = checkedInlineObjectTarget(target.address);
  if (!address.owner || typeof address.expected_text !== 'string')
    throw Error('InvalidInlineObjectOwner');
  return freezeDTO({
    ...target,
    address,
  }) as InlineObjectCreateTarget;
}
export function admitInlineObjectCreateTarget(
  state: Pick<EditorState, 'stateVersion' | 'token' | 'content' | 'nativeHistoryRevision'>,
  input: InlineObjectCreateTarget,
  version: number,
): InlineObjectOwnedAddress & { readonly unit: number; readonly expected_text: string } {
  const target = captureInlineObjectCreateTarget(input);
  if (
    version !== state.stateVersion ||
    Object.entries(state.token).some(([key, value]) => target[key as keyof StateToken] !== value)
  )
    throw Error('StaleInlineObjectInsertSelection');
  const address = target.address;
  const owner = address.owner;
  if (!owner || (state.content as Record<string, unknown>)?.inlineObjectPlacementVersion !== 1)
    throw Error('InlineObjectPlacementUnavailable');
  if (owner.binding.revision !== state.nativeHistoryRevision) throw Error('StaleInlineObjectOwner');
  const content = state.content as { paragraphs?: any[]; createdTables?: any[] };
  let text: string | undefined;
  if (owner.kind === 'createdCell') {
    const tables = (content.createdTables ?? []).filter(
      (t) => t.section === address.section && t.identity === owner.identity,
    );
    if (tables.length !== 1) throw Error('InvalidInlineObjectOwner');
    const cells = tables[0].cells.filter(
      (c: any) => c.row === owner.row && c.column === owner.column,
    );
    if (cells.length !== 1) throw Error('InvalidInlineObjectOwner');
    text = cells[0].text;
  } else {
    const rows = (content.paragraphs ?? []).filter(
      (p) => p.section === address.section && p.paragraph + 1 === address.paragraph,
    );
    if (
      rows.length !== 1 ||
      rows[0].clipped ||
      !rows[0].editable ||
      rows[0].drawingText ||
      rows[0].drawingCaption
    )
      throw Error('InvalidInlineObjectOwner');
    const row = rows[0];
    if (
      owner.kind === 'body'
        ? row.tableCell ||
          row.createdCell ||
          row.selectionOwner !== `section:${address.section}:body`
        : row.tableCell?.tableNode !== owner.table_node ||
          row.tableCell?.listNode !== owner.list_node
    )
      throw Error('InvalidInlineObjectOwner');
    text = row.text;
  }
  if (typeof text !== 'string' || text !== address.expected_text || address.unit > text.length)
    throw Error('InlineObjectTextMismatch');
  if (
    address.unit > 0 &&
    address.unit < text.length &&
    /[\uD800-\uDBFF]/.test(text[address.unit - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[address.unit])
  )
    throw Error('InvalidScalarBoundary');
  return address;
}
