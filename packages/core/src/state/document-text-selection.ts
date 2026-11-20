import { sameDocumentTextReadStamp } from '../../../../js/document-text-read-stamp.mjs';
import type { EditorState, StateToken } from './editor-state.ts';
import type { DocumentTextIndex, DocumentTextMatch } from './document-text-search.ts';
import { assertDocumentTextIndexCurrent } from './document-text-search.ts';
import { copyOwned, freezeDTO } from './owned.ts';
import { validateToken } from '../commands/selection.ts';
import { isWellFormedText } from './text-scalar.ts';

type Binding = DocumentTextIndex['native']['binding'];
export interface DocumentTextSelectionRequest {
  readonly schemaVersion: 1;
  readonly scope: 'native-document-text-selection';
  readonly readBinding?: DocumentTextIndex['native']['readBinding'];
  readonly binding: Binding;
  readonly ref: string;
  readonly startUnit: number;
  readonly endUnit: number;
  readonly expectedOriginal: string;
}
export type DocumentTextReadTarget = Readonly<
  { section: number; startUnit: number; endUnit: number } & (
    | { kind: 'paragraph'; paragraph: number }
    | { kind: 'created-cell'; identity: string; row: number; column: number }
  )
>;
export interface DocumentTextSelectionObservation {
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly native: Readonly<
    Omit<DocumentTextSelectionRequest, 'startUnit' | 'endUnit'> & {
      coordinateSpace: 'native-current-text-observation';
      executionAuthority: false;
      format: 'hwp5' | 'hwpx';
      beforeText: string;
      target: DocumentTextReadTarget;
    }
  >;
}
const observations = new WeakMap<
  DocumentTextSelectionObservation,
  { content: unknown; token: StateToken; revision: number | undefined }
>();
/** Reader-only private admission. A copied/JSON observation is data, not an issued query result. */
export function isCurrentDocumentTextSelectionObservation(
  value: unknown,
  state: EditorState,
): value is DocumentTextSelectionObservation {
  if (!value || typeof value !== 'object') return false;
  const issued = observations.get(value as DocumentTextSelectionObservation);
  if (
    !issued ||
    issued.content !== state.content ||
    issued.revision !== state.nativeHistoryRevision ||
    state.status !== 'ready'
  )
    return false;
  try {
    validateToken(issued.token, state, true);
    return true;
  } catch {
    return false;
  }
}
const uint = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;

/** Derive a read-only Native request from an issued current index. Neither the
 * logical inventory paragraph nor a client-provided target is sent to Native. */
export function documentTextSelectionRequest(
  index: DocumentTextIndex,
  input: DocumentTextMatch,
  state: EditorState,
): DocumentTextSelectionRequest {
  assertDocumentTextIndexCurrent(index, state);
  const match = copyOwned(input);
  validateToken(match.token, state, true);
  const row = index.native.rows[match.ordinal];
  if (
    match.executionAuthority !== false ||
    !uint(match.ordinal) ||
    match.stateVersion !== state.stateVersion ||
    match.binding?.session !== index.native.binding.session ||
    match.binding.revision !== index.native.binding.revision ||
    !row ||
    row.ref !== match.ref ||
    row.section !== match.section ||
    row.paragraph !== match.paragraph ||
    !uint(match.startUnit) ||
    !uint(match.endUnit) ||
    match.startUnit >= match.endUnit ||
    match.endUnit > row.text.length ||
    typeof match.expectedOriginal !== 'string' ||
    !isWellFormedText(match.expectedOriginal) ||
    row.text.slice(match.startUnit, match.endUnit) !== match.expectedOriginal
  )
    throw Error('InvalidDocumentTextMatch');
  return freezeDTO({
    schemaVersion: 1,
    scope: 'native-document-text-selection',
    binding: index.native.binding,
    ...(index.native.readBinding ? { readBinding: index.native.readBinding } : {}),
    ref: row.ref,
    startUnit: match.startUnit,
    endUnit: match.endUnit,
    expectedOriginal: match.expectedOriginal,
  });
}

/** Own the Runtime read reply. This is not a SelectionTarget or a geometry grant;
 * Surface must resolve the currently painted owner before changing selection. */
export function documentTextSelectionObservation(
  state: EditorState,
  request: DocumentTextSelectionRequest,
  input: unknown,
  section: number,
): DocumentTextSelectionObservation {
  const value = copyOwned(input) as DocumentTextSelectionObservation['native'];
  const target = value?.target;
  const validIdentity =
    target?.kind === 'created-cell' &&
    typeof target.identity === 'string' &&
    target.identity.length <= 20 &&
    /^[1-9][0-9]*$/.test(target.identity) &&
    (target.identity.length < 20 || target.identity <= '18446744073709551615');
  if (
    value?.schemaVersion !== 1 ||
    value.scope !== request.scope ||
    value.coordinateSpace !== 'native-current-text-observation' ||
    value.executionAuthority !== false ||
    value.format !== (state.content as { format?: unknown })?.format ||
    value.binding?.session !== request.binding.session ||
    value.binding.revision !== request.binding.revision ||
    !sameDocumentTextReadStamp(value.readBinding, request.readBinding) ||
    value.ref !== request.ref ||
    value.expectedOriginal !== request.expectedOriginal ||
    typeof value.beforeText !== 'string' ||
    !isWellFormedText(value.beforeText) ||
    value.beforeText.length > 4 * 1024 * 1024 ||
    !target ||
    !uint(target.section) ||
    target.section !== section ||
    !uint(target.startUnit) ||
    !uint(target.endUnit) ||
    target.startUnit >= target.endUnit ||
    target.endUnit > value.beforeText.length ||
    value.beforeText.slice(target.startUnit, target.endUnit) !== request.expectedOriginal ||
    !(target.kind === 'paragraph'
      ? uint(target.paragraph)
      : target.kind === 'created-cell' && validIdentity && uint(target.row) && uint(target.column))
  )
    throw Error('InvalidDocumentTextSelectionObservation');
  const locator: DocumentTextReadTarget =
    target.kind === 'paragraph'
      ? {
          kind: target.kind,
          section: target.section,
          paragraph: target.paragraph,
          startUnit: target.startUnit,
          endUnit: target.endUnit,
        }
      : {
          kind: target.kind,
          section: target.section,
          identity: target.identity,
          row: target.row,
          column: target.column,
          startUnit: target.startUnit,
          endUnit: target.endUnit,
        };
  const result: DocumentTextSelectionObservation = freezeDTO({
    token: state.token,
    stateVersion: state.stateVersion,
    native: {
      schemaVersion: 1,
      scope: request.scope,
      coordinateSpace: 'native-current-text-observation',
      executionAuthority: false,
      format: value.format,
      binding: request.binding,
      ...(value.readBinding ? { readBinding: value.readBinding } : {}),
      ref: request.ref,
      expectedOriginal: request.expectedOriginal,
      beforeText: value.beforeText,
      target: locator,
    },
  });
  observations.set(result, {
    content: state.content,
    token: state.token,
    revision: state.nativeHistoryRevision,
  });
  return result;
}
