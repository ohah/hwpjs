import { sameDocumentTextReadStamp } from '../../../../js/document-text-read-stamp.mjs';
import type { EditorState, StateToken } from './editor-state.ts';
import type { DocumentTextIndex } from './document-text-search.ts';
import { assertDocumentTextIndexCurrent, documentTextRowForRef } from './document-text-search.ts';
import { copyOwned, freezeDTO } from './owned.ts';
import { isWellFormedText } from './text-scalar.ts';
export type DocumentTextCaretPoint = Readonly<
  {
    section: number;
    unit: number;
    beforeText: string;
  } & (
    | { kind: 'paragraph'; paragraph: number }
    | { kind: 'created-cell'; identity: string; row: number; column: number }
  )
>;
export interface DocumentTextAnchorRequest {
  readonly schemaVersion: 1;
  readonly scope: 'native-document-text-anchor';
  readonly readBinding?: DocumentTextIndex['native']['readBinding'];
  readonly binding: DocumentTextIndex['native']['binding'];
  readonly target: DocumentTextCaretPoint;
}
export interface DocumentTextAnchor {
  readonly executionAuthority: false;
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly binding: DocumentTextIndex['native']['binding'];
  readonly ref: string;
  readonly ordinal: number;
  readonly startUnit: number;
  readonly endUnit: number;
}
const uint = (n: unknown): n is number =>
  Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 0xffffffff;
const boundary = (s: string, n: number) =>
  !(
    n > 0 &&
    n < s.length &&
    s.charCodeAt(n - 1) >= 0xd800 &&
    s.charCodeAt(n - 1) <= 0xdbff &&
    s.charCodeAt(n) >= 0xdc00 &&
    s.charCodeAt(n) <= 0xdfff
  );
export function documentTextAnchorRequest(
  index: DocumentTextIndex,
  input: DocumentTextCaretPoint,
  state: EditorState,
): DocumentTextAnchorRequest {
  assertDocumentTextIndexCurrent(index, state);
  const point = copyOwned(input);
  const names =
    point?.kind === 'paragraph'
      ? ['kind', 'section', 'paragraph', 'unit', 'beforeText']
      : ['kind', 'section', 'identity', 'row', 'column', 'unit', 'beforeText'];
  if (
    !point ||
    typeof point !== 'object' ||
    Array.isArray(point) ||
    Reflect.ownKeys(point).length !== names.length ||
    names.some((k) => !Object.hasOwn(point, k)) ||
    !uint(point.section) ||
    !uint(point.unit) ||
    typeof point.beforeText !== 'string' ||
    !isWellFormedText(point.beforeText) ||
    point.beforeText.length > 4 * 1024 * 1024 ||
    point.unit > point.beforeText.length ||
    !boundary(point.beforeText, point.unit) ||
    !(point.kind === 'paragraph'
      ? uint(point.paragraph)
      : point.kind === 'created-cell' &&
        typeof point.identity === 'string' &&
        /^[1-9][0-9]{0,19}$/.test(point.identity) &&
        (point.identity.length < 20 || point.identity <= '18446744073709551615') &&
        uint(point.row) &&
        uint(point.column))
  )
    throw Error('InvalidDocumentTextCaret');
  return freezeDTO({
    schemaVersion: 1 as const,
    scope: 'native-document-text-anchor' as const,
    binding: index.native.binding,
    ...(index.native.readBinding ? { readBinding: index.native.readBinding } : {}),
    target: point,
  });
}
export function documentTextAnchorObservation(
  index: DocumentTextIndex,
  request: DocumentTextAnchorRequest,
  input: unknown,
  state: EditorState,
): DocumentTextAnchor {
  assertDocumentTextIndexCurrent(index, state);
  const value = copyOwned(input) as any;
  if (
    value?.schemaVersion !== 1 ||
    value.scope !== request.scope ||
    value.coordinateSpace !== 'native-read-inventory' ||
    value.executionAuthority !== false ||
    value.format !== index.native.format ||
    value.binding?.session !== request.binding.session ||
    value.binding.revision !== request.binding.revision ||
    !sameDocumentTextReadStamp(value.readBinding, request.readBinding) ||
    typeof value.ref !== 'string' ||
    !uint(value.startUnit) ||
    value.endUnit !== value.startUnit
  )
    throw Error('InvalidDocumentTextAnchorObservation');
  const row = documentTextRowForRef(index, value.ref, state);
  if (
    row.section !== request.target.section ||
    value.startUnit > row.text.length ||
    !boundary(row.text, value.startUnit)
  )
    throw Error('InvalidDocumentTextAnchorObservation');
  return freezeDTO({
    executionAuthority: false as const,
    token: state.token,
    stateVersion: state.stateVersion,
    binding: index.native.binding,
    ref: row.ref,
    ordinal: row.ordinal,
    startUnit: value.startUnit,
    endUnit: value.endUnit,
  });
}
