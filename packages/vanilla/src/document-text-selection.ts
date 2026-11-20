import { displayDocumentParagraph } from '../../../js/document-text-coordinates.mjs';
import type { DocumentTextSelectionObservation, EditorState, StateToken } from '@hwpjs/core';

export type DocumentSearchRange = Readonly<{
  section: number;
  paragraph?: number;
  createdCell?: Readonly<{ identity: string; row: number; column: number }>;
  startUnit: number;
  endUnit: number;
  expectedText: string;
}>;
const tokenKeys = [
  'editorId',
  'documentId',
  'generation',
  'operationRevision',
  'viewRevision',
] as const;
const sameToken = (left: StateToken, right: StateToken) =>
  Boolean(left && right && tokenKeys.every((key) => left[key] === right[key]));
const samePoint = (range: DocumentSearchRange, point: any, unit: number) =>
  point?.section === range.section &&
  point.unit === unit &&
  (range.createdCell
    ? point.paragraph === undefined &&
      point.createdCell?.identity === range.createdCell.identity &&
      point.createdCell.row === range.createdCell.row &&
      point.createdCell.column === range.createdCell.column
    : !point.createdCell && point.paragraph === range.paragraph);

/** Current visible projection only. No guessed position, window mutation,
 * geometry issuance or write permission belongs in this admission helper. */
export async function selectDocumentTextObservation(
  observation: DocumentTextSelectionObservation,
  current: () => boolean,
  port: {
    state(): EditorState;
    ready(state: EditorState): boolean;
    admit(range: DocumentSearchRange, state: EditorState): boolean;
    select(range: DocumentSearchRange): boolean;
    published(range: DocumentSearchRange, state: EditorState): boolean;
    selection(): { anchor: unknown; focus: unknown } | null;
    flush(): Promise<void>;
  },
): Promise<{ readonly state: EditorState } | null> {
  if (!current()) return null;
  const before = port.state(),
    value = observation?.native;
  if (
    before.status !== 'ready' ||
    !port.ready(before) ||
    observation?.stateVersion !== before.stateVersion ||
    !sameToken(observation.token, before.token) ||
    value?.schemaVersion !== 1 ||
    value.scope !== 'native-document-text-selection' ||
    value.coordinateSpace !== 'native-current-text-observation' ||
    value.executionAuthority !== false ||
    value.binding?.revision !== (before.nativeHistoryRevision ?? null) ||
    value.format !== (before.content as { format?: unknown })?.format
  )
    return null;
  const target = value.target;
  if (
    !target ||
    !['paragraph', 'created-cell'].includes(target.kind) ||
    !Number.isSafeInteger(target.startUnit) ||
    !Number.isSafeInteger(target.endUnit) ||
    target.startUnit < 0 ||
    target.startUnit >= target.endUnit ||
    typeof value.beforeText !== 'string' ||
    target.endUnit > value.beforeText.length ||
    typeof value.expectedOriginal !== 'string' ||
    !value.expectedOriginal ||
    value.beforeText.slice(target.startUnit, target.endUnit) !== value.expectedOriginal
  )
    return null;
  const paragraph =
    target.kind === 'paragraph'
      ? displayDocumentParagraph(value.format, target.paragraph)
      : undefined;
  if (target.kind === 'paragraph' && paragraph === undefined) return null;
  const range: DocumentSearchRange = {
    section: target.section,
    startUnit: target.startUnit,
    endUnit: target.endUnit,
    expectedText: value.beforeText,
    ...(target.kind === 'paragraph'
      ? { paragraph }
      : {
          createdCell: { identity: target.identity, row: target.row, column: target.column },
        }),
  };
  if (!port.admit(range, before) || !current() || port.state() !== before || !port.ready(before))
    return null;
  if (!port.select(range)) return null;
  // The existing onCommittedSelection callback owns Core publication. Await its
  // queue barrier and confirm the actual direct selection instead of publishing
  // a second target or interpreting a successful call as completed selection.
  await port.flush();
  if (!current()) return null;
  const after = port.state();
  if (
    !sameToken(after.token, before.token) ||
    after.nativeHistoryRevision !== before.nativeHistoryRevision ||
    !port.ready(after) ||
    !port.admit(range, after) ||
    !port.published(range, after)
  )
    return null;
  const selected = port.selection();
  if (
    !selected ||
    !samePoint(range, selected.anchor, range.startUnit) ||
    !samePoint(range, selected.focus, range.endUnit)
  )
    return null;
  return Object.freeze({ state: after });
}
