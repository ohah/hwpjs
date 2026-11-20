import { readNativeReadSourceEvidence } from '../internal/native-read-source-evidence.ts';
import { validDocumentTextReadStamp } from '../../../../js/document-text-read-stamp.mjs';
import type { EditorState, StateToken } from './editor-state.ts';
import { copyOwned, freezeDTO } from './owned.ts';
import { validateToken } from '../commands/selection.ts';
import { createLiteralMatcher } from './literal-matches.ts';
import { isWellFormedText } from './text-scalar.ts';

/** A Native read inventory, independent of the currently painted/windowed rows.
 * Refs identify observations; they never establish permission to write. */
export interface DocumentTextRow {
  readonly ordinal: number;
  readonly section: number;
  /** Native read-inventory coordinate; never passed to a legacy text setter. */
  readonly paragraph: number;
  readonly ref: string;
  readonly text: string;
}
export interface DocumentTextSnapshot {
  readonly schemaVersion: 1;
  readonly scope: 'native-document-text';
  readonly complete: true;
  readonly format: 'hwp5' | 'hwpx';
  readonly binding: Readonly<{ session: string; revision: number | null }>;
  readonly readBinding?: Readonly<{ epoch: string; serial: string }>;
  readonly coverage: Readonly<{
    totalParagraphs: number;
    sections: readonly Readonly<{ section: number; paragraphCount: number }>[];
  }>;
  readonly rows: readonly DocumentTextRow[];
}
export interface DocumentTextIndex {
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly native: DocumentTextSnapshot;
}
export interface DocumentTextMatch {
  readonly executionAuthority: false;
  readonly token: StateToken;
  readonly stateVersion: number;
  readonly binding: DocumentTextSnapshot['binding'];
  readonly ref: string;
  readonly ordinal: number;
  readonly section: number;
  readonly paragraph: number;
  readonly startUnit: number;
  readonly endUnit: number;
  readonly expectedOriginal: string;
}
const indices = new WeakMap<DocumentTextIndex, ReadonlyMap<string, DocumentTextRow>>();
const uint = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffffff;

/** Validate and own one complete read. Native coverage is checked again by the
 * mutation adapter; this DTO is not a replacement for its transaction admission.
 * Work is linear in sections + rows + owned text; no dense-u32 range scans. */
export function createDocumentTextIndex(state: EditorState, input: unknown): DocumentTextIndex {
  if (state.status !== 'ready') throw Error('EditorNotReady');
  const value = copyOwned(input) as DocumentTextSnapshot;
  if (
    value?.schemaVersion !== 1 ||
    value.scope !== 'native-document-text' ||
    value.complete !== true ||
    value.format !== (state.content as { format?: unknown })?.format ||
    !['hwp5', 'hwpx'].includes(value.format) ||
    typeof value.binding?.session !== 'string' ||
    !value.binding.session ||
    (value.binding.revision !== null && !uint(value.binding.revision)) ||
    value.binding.revision === 0xffffffff ||
    (Object.hasOwn(value, 'readBinding') && !validDocumentTextReadStamp(value.readBinding)) ||
    value.binding.revision !== (state.nativeHistoryRevision ?? null) ||
    !uint(value.coverage?.totalParagraphs) ||
    !Array.isArray(value.coverage.sections) ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.coverage.totalParagraphs
  )
    throw Error('IncompleteDocumentTextSnapshot');
  const published = readNativeReadSourceEvidence(state);
  if (
    published &&
    (published.session !== value.binding.session ||
      published.epoch !== value.readBinding?.epoch ||
      published.serial !== value.readBinding.serial)
  )
    throw Error('StaleDocumentTextReadBinding');
  const counts = new Map<number, number>();
  let total = 0;
  for (const row of value.coverage.sections) {
    if (!uint(row?.section) || !uint(row.paragraphCount) || counts.has(row.section))
      throw Error('InvalidDocumentTextCoverage');
    counts.set(row.section, row.paragraphCount);
    total += row.paragraphCount;
    if (!Number.isSafeInteger(total) || total > value.rows.length)
      throw Error('InvalidDocumentTextCoverage');
  }
  if (total !== value.rows.length) throw Error('IncompleteDocumentTextSnapshot');
  const byRef = new Map<string, DocumentTextRow>();
  const coordinates = new Set<string>();
  for (let ordinal = 0; ordinal < value.rows.length; ordinal++) {
    const row = value.rows[ordinal];
    if (
      row?.ordinal !== ordinal ||
      !uint(row.section) ||
      !uint(row.paragraph) ||
      typeof row.ref !== 'string' ||
      !row.ref ||
      row.ref.length > 256 ||
      byRef.has(row.ref) ||
      typeof row.text !== 'string' ||
      !isWellFormedText(row.text)
    )
      throw Error('InvalidDocumentTextRow');
    const key = `${row.section}:${row.paragraph}`;
    if (coordinates.has(key)) throw Error('AmbiguousDocumentText');
    coordinates.add(key);
    const remaining = counts.get(row.section);
    if (remaining === undefined || remaining === 0) throw Error('InvalidDocumentTextCoverage');
    counts.set(row.section, remaining - 1);
    byRef.set(row.ref, row);
  }
  for (const remaining of counts.values())
    if (remaining !== 0) throw Error('IncompleteDocumentTextSnapshot');
  const index = freezeDTO({
    token: copyOwned(state.token),
    stateVersion: state.stateVersion,
    native: value,
  });
  indices.set(index, byRef);
  return index;
}

export function assertDocumentTextIndexCurrent(index: DocumentTextIndex, state: EditorState) {
  if (!indices.has(index)) throw Error('InvalidDocumentTextIndex');
  validateToken(index.token, state, true);
  if (
    state.status !== 'ready' ||
    index.stateVersion !== state.stateVersion ||
    index.native.binding.revision !== (state.nativeHistoryRevision ?? null)
  )
    throw Error('StaleDocumentTextSnapshot');
}

/** Internal read lookup from an issued current index; it does not issue a write target. */
export function documentTextRowForRef(
  index: DocumentTextIndex,
  ref: string,
  state: EditorState,
): DocumentTextRow {
  assertDocumentTextIndexCurrent(index, state);
  const row = indices.get(index)!.get(ref);
  if (!row) throw Error('InvalidDocumentTextReference');
  return row;
}

/** Scan every Native-owned row, including non-writable owners. Eligibility for
 * replacement is decided for the complete batch afterwards, never by filtering. */
export function* documentTextMatches(
  index: DocumentTextIndex,
  query: string,
  overlapping = false,
): Generator<DocumentTextMatch> {
  if (!indices.has(index)) throw Error('InvalidDocumentTextIndex');
  const matches = createLiteralMatcher(query, undefined, overlapping);
  for (const row of index.native.rows)
    for (const at of matches(row.text))
      yield freezeDTO({
        executionAuthority: false,
        token: index.token,
        stateVersion: index.stateVersion,
        binding: index.native.binding,
        ref: row.ref,
        ordinal: row.ordinal,
        section: row.section,
        paragraph: row.paragraph,
        startUnit: at,
        endUnit: at + query.length,
        expectedOriginal: row.text.slice(at, at + query.length),
      });
}

export function findDocumentTextMatch(
  index: DocumentTextIndex,
  query: string,
  options: {
    direction?: 'forward' | 'backward';
    wrap?: boolean;
    anchor?: Readonly<{ ref: string; startUnit: number; endUnit: number }>;
  } = {},
): DocumentTextMatch | null {
  const byRef = indices.get(index);
  if (!byRef) throw Error('InvalidDocumentTextIndex');
  const settings = copyOwned(options);
  if (
    !settings ||
    Array.isArray(settings) ||
    Object.keys(settings).some((key) => !['direction', 'wrap', 'anchor'].includes(key)) ||
    (settings.direction !== undefined && !['forward', 'backward'].includes(settings.direction)) ||
    (settings.wrap !== undefined && typeof settings.wrap !== 'boolean')
  )
    throw Error('InvalidFindTextOptions');
  const backward = settings.direction === 'backward';
  const anchor = settings.anchor;
  if (
    anchor !== undefined &&
    (!anchor ||
      typeof anchor !== 'object' ||
      Array.isArray(anchor) ||
      Object.keys(anchor).some((key) => !['ref', 'startUnit', 'endUnit'].includes(key)) ||
      typeof anchor.ref !== 'string')
  )
    throw Error('StaleSearchSelection');
  const row = anchor === undefined ? undefined : byRef.get(anchor.ref);
  if (
    anchor !== undefined &&
    (!row ||
      !uint(anchor.startUnit) ||
      !uint(anchor.endUnit) ||
      anchor.endUnit < anchor.startUnit ||
      anchor.endUnit > row.text.length)
  )
    throw Error('StaleSearchSelection');
  const boundary = (at: number) =>
    !row ||
    at === 0 ||
    at === row.text.length ||
    !(
      row.text.charCodeAt(at - 1) >= 0xd800 &&
      row.text.charCodeAt(at - 1) <= 0xdbff &&
      row.text.charCodeAt(at) >= 0xdc00 &&
      row.text.charCodeAt(at) <= 0xdfff
    );
  if (anchor && (!boundary(anchor.startUnit) || !boundary(anchor.endUnit)))
    throw Error('InvalidScalarBoundary');
  let edge: DocumentTextMatch | null = null;
  let selected: DocumentTextMatch | null = null;
  for (const match of documentTextMatches(index, query, true)) {
    if (!edge || backward) edge = match;
    const eligible =
      !row ||
      (backward
        ? match.ordinal < row.ordinal ||
          (match.ordinal === row.ordinal && match.endUnit <= anchor!.startUnit)
        : match.ordinal > row.ordinal ||
          (match.ordinal === row.ordinal && match.startUnit >= anchor!.endUnit));
    if (eligible && (!selected || backward)) selected = match;
    if (selected && !backward) return selected;
  }
  return selected ?? (settings.wrap === false ? null : edge);
}
