import type { EditorState, StateToken } from '../state/editor-state.ts';
import type { SelectionTarget } from './commands.ts';
import { copyOwned, freezeDTO, ownObservation } from '../state/owned.ts';
import { textRows } from '../state/text-tools.ts';
import { createLiteralMatcher, validateLiteralQuery } from '../state/literal-matches.ts';
import { isWellFormedText } from '../state/text-scalar.ts';
import { validateToken, validateSelection, selectionMessage } from './selection.ts';
import { currentParagraphReference } from './current-paragraph-reference.ts';
// @ts-ignore Canonical display ownership, not a new owner issuer.
import { paragraphSelectionOwner } from '../../../../web/preview/paragraph-selection.mjs';
// @ts-ignore Shared monotone display/source mapper; no Native wire is produced.
import { sourceTextChanges } from '../../../../web/preview/text-offsets.mjs';

export const REPLACE_ALL_PLAN_LIMITS = Object.freeze({
  paragraphs: 20000,
  snapshotUnits: 200000,
  queryUnits: 200000,
  replacementUnits: 4 * 1024 * 1024,
  matches: 4096,
  insertedUnits: 4 * 1024 * 1024,
  insertedBytes: 4 * 1024 * 1024,
  outputUnits: 4 * 1024 * 1024,
});
type Limits = { readonly [Key in keyof typeof REPLACE_ALL_PLAN_LIMITS]: number };
export interface ReplaceAllCapabilities {
  readonly available: boolean;
  readonly reason?: string;
  readonly supportsNewlines: boolean;
}
export interface ReplaceAllPlanRequest {
  readonly schemaVersion: 1;
  readonly query: string;
  readonly replacement: string;
  /** Existing StateToken, including viewRevision; this is not a Native layout grant. */
  readonly layoutToken: StateToken;
  readonly stateVersion: number;
  readonly limits?: Partial<Limits>;
}
export interface ReplaceAllPlannedEdit {
  readonly target: SelectionTarget;
  readonly source: Readonly<{
    section: number;
    paragraph: number;
    startUnit: number;
    endUnit: number;
    reference?: Readonly<Record<string, unknown>>;
  }>;
  /** Display slice; Native must independently verify the corresponding raw slice. */
  readonly expectedOriginal: string;
  readonly replacement: string;
}
export interface ReplaceAllPlan {
  readonly schemaVersion: 1;
  readonly executionAuthority: false;
  readonly status: 'known-no-op' | 'requires-native-preflight';
  readonly scope: 'complete-current-paragraph-snapshot';
  readonly layoutToken: StateToken;
  readonly stateVersion: number;
  readonly nativeHistoryRevision: number | null;
  readonly format: 'hwp5' | 'hwpx';
  readonly query: string;
  readonly replacement: string;
  readonly newlinePolicy: 'literal-preserved-native-adapter-policy-required';
  readonly matchCount: number;
  readonly edits: readonly ReplaceAllPlannedEdit[];
  readonly coverage: Readonly<{
    observedParagraphs: number;
    declaredParagraphs: number;
    sections: readonly Readonly<{ section: number; observedParagraphs: number }>[];
    owners: readonly Readonly<{ section: number; paragraph: number }>[];
    nativeVerified: false;
    requirements: readonly string[];
  }>;
  readonly totals: Readonly<{
    snapshotUnits: number;
    matchedUnits: number;
    insertedUnits: number;
    insertedBytes: number;
    outputUnits: number;
  }>;
}
function record(value: unknown, keys: readonly string[], error: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error(error);
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !keys.includes(key)))
    throw Error(error);
  return value as Record<string, unknown>;
}
function add(total: number, amount: number, limit: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > limit - total)
    throw Error('ReplaceAllPlanLimitExceeded');
  return total + amount;
}
function utf8Bytes(text: string) {
  let bytes = 0;
  for (const scalar of text) {
    const code = scalar.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Pure owned planning only. Even complete display counts do not establish Native
 * coverage, writable owners, source text, newline semantics or transaction authority.
 * No match is silently omitted because its owner is protected/unsupported. */
export function planReplaceAll(state: EditorState, input: ReplaceAllPlanRequest): ReplaceAllPlan {
  const request = copyOwned(input);
  record(
    request,
    ['schemaVersion', 'query', 'replacement', 'layoutToken', 'stateVersion', 'limits'],
    'InvalidReplaceAllPlanRequest',
  );
  if (request.schemaVersion !== 1) throw Error('InvalidReplaceAllPlanRequest');
  validateLiteralQuery(request.query);
  if (typeof request.replacement !== 'string' || !isWellFormedText(request.replacement))
    throw Error('InvalidReplacementText');
  const tokenKeys = Object.keys(state.token);
  const token = record(request.layoutToken, tokenKeys, 'InvalidReplaceAllLayoutToken');
  if (Reflect.ownKeys(token).length !== tokenKeys.length)
    throw Error('InvalidReplaceAllLayoutToken');
  validateToken(request.layoutToken, state, true);
  if (!Number.isSafeInteger(request.stateVersion) || request.stateVersion !== state.stateVersion)
    throw Error('StaleSearchSelection');
  if (state.status !== 'ready') throw Error('EditorNotReady');
  if (
    state.nativeHistoryRevision !== undefined &&
    (!Number.isSafeInteger(state.nativeHistoryRevision) ||
      state.nativeHistoryRevision < 0 ||
      state.nativeHistoryRevision > 0xffffffff)
  )
    throw Error('InvalidDocumentTextSnapshot');
  const limits: Record<string, number> = { ...REPLACE_ALL_PLAN_LIMITS };
  if (request.limits !== undefined) {
    const lower = record(request.limits, Object.keys(limits), 'InvalidReplaceAllPlanLimits');
    for (const [key, value] of Object.entries(lower)) {
      if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > limits[key])
        throw Error('InvalidReplaceAllPlanLimits');
      limits[key] = value as number;
    }
  }
  add(0, request.query.length, limits.queryUnits);
  add(0, request.replacement.length, limits.replacementUnits);
  const insertedBytesPerMatch = utf8Bytes(request.replacement);
  const content = state.content as Record<string, any>;
  if (!content || !['hwp5', 'hwpx'].includes(content.format))
    throw Error('InvalidDocumentTextSnapshot');
  if (
    (content.window !== undefined && content.window !== null) ||
    (content.limited !== undefined && content.limited !== false) ||
    !Number.isSafeInteger(content.totalParagraphs) ||
    content.totalParagraphs < 0 ||
    !Array.isArray(content.paragraphs) ||
    content.totalParagraphs !== content.paragraphs.length
  )
    throw Error('IncompleteReplaceAllSnapshot');
  add(0, content.paragraphs.length, limits.paragraphs);
  if (content.readOnly !== undefined && typeof content.readOnly !== 'boolean')
    throw Error('InvalidDocumentTextSnapshot');
  // Reuse canonical immutable observations (including their existing row lookup).
  // External mutable data is copied once, never cached as a current document.
  const observed = ownObservation(content)();
  const validationState = {
    ...state.token,
    token: state.token,
    content: observed,
  } as EditorState;
  const rows = textRows({ ...validationState, status: 'ready' } as EditorState);
  if (rows.length !== content.totalParagraphs) throw Error('IncompleteReplaceAllSnapshot');
  const sections = new Map<number, number>();
  let snapshotUnits = 0;
  for (const row of rows) {
    if (
      row.section > 0xffffffff ||
      row.paragraph > 0xffffffff ||
      (row.clipped !== undefined && row.clipped !== false)
    )
      throw Error('IncompleteReplaceAllSnapshot');
    if (!isWellFormedText(row.text)) throw Error('InvalidDocumentTextSnapshot');
    snapshotUnits = add(snapshotUnits, row.text.length, limits.snapshotUnits);
    sections.set(row.section, (sections.get(row.section) ?? 0) + 1);
  }
  const matches = createLiteralMatcher(request.query);
  const edits: ReplaceAllPlannedEdit[] = [];
  let matchCount = 0,
    matchedUnits = 0,
    insertedUnits = 0,
    insertedBytes = 0;
  for (const row of rows) {
    const ranges: { section: number; paragraph: number; startUnit: number; endUnit: number }[] = [];
    for (const at of matches(row.text)) {
      matchCount = add(matchCount, 1, limits.matches);
      matchedUnits = add(matchedUnits, request.query.length, limits.snapshotUnits);
      insertedUnits = add(insertedUnits, request.replacement.length, limits.insertedUnits);
      insertedBytes = add(insertedBytes, insertedBytesPerMatch, limits.insertedBytes);
      ranges.push({
        section: row.section,
        paragraph: row.paragraph,
        startUnit: at,
        endUnit: at + request.query.length,
      });
    }
    if (!ranges.length) continue;
    if (content.readOnly === true || (state.capabilities as any)?.readOnly === true)
      throw Error('ReadOnlyDocument');
    if (
      row.fieldReadOnlyReason ||
      row.textSourcePolicyError ||
      (row.fieldLabels !== undefined &&
        (!Array.isArray(row.fieldLabels) || row.fieldLabels.length)) ||
      (row.manualFormulaResults !== undefined &&
        (!Array.isArray(row.manualFormulaResults) || row.manualFormulaResults.length))
    )
      throw Error('UnsupportedReplaceAllFieldOwner');
    if (row.editable !== true) throw Error('SelectionNotEditable');
    const owner = paragraphSelectionOwner(row) ?? '';
    const target = (range: (typeof ranges)[number]): SelectionTarget => ({
      ...request.layoutToken,
      coordinateSpace: 'display',
      format: content.format,
      owner,
      ...range,
      affinity: 'forward',
    });
    // Once per matching row: canonical owner, editable/scalar and created-cell
    // admission plus the existing single mapping/reference contract.
    const first = selectionMessage(target(ranges[0]), validationState);
    const mapped = sourceTextChanges(
      ranges,
      content.format === 'hwp5' ? row.sourceOffsets : undefined,
    );
    if (first.startUnit !== mapped[0].startUnit || first.endUnit !== mapped[0].endUnit)
      throw Error('InvalidReplaceAllSourceMapping');
    const reference =
      content.format === 'hwp5'
        ? currentParagraphReference(
            row.currentReference,
            row.section,
            'UnsupportedReplaceAllReference',
          )
        : undefined;
    for (let i = 0; i < ranges.length; i++) {
      const selected = target(ranges[i]);
      if (i) validateSelection(selected, validationState, true);
      edits.push({
        target: selected,
        source: { ...mapped[i], ...(reference === undefined ? {} : { reference }) },
        expectedOriginal: row.text.slice(selected.startUnit, selected.endUnit),
        replacement: request.replacement,
      });
    }
  }
  const outputUnits = add(snapshotUnits - matchedUnits, insertedUnits, limits.outputUnits);
  const noOp = matchCount === 0 || request.query === request.replacement;
  return freezeDTO(
    copyOwned({
      schemaVersion: 1,
      executionAuthority: false,
      status: noOp ? 'known-no-op' : 'requires-native-preflight',
      scope: 'complete-current-paragraph-snapshot',
      layoutToken: request.layoutToken,
      stateVersion: request.stateVersion,
      nativeHistoryRevision: state.nativeHistoryRevision ?? null,
      format: content.format,
      query: request.query,
      replacement: request.replacement,
      newlinePolicy: 'literal-preserved-native-adapter-policy-required',
      matchCount,
      edits: noOp ? [] : edits,
      coverage: {
        observedParagraphs: rows.length,
        declaredParagraphs: content.totalParagraphs,
        sections: [...sections].map(([section, observedParagraphs]) => ({
          section,
          observedParagraphs,
        })),
        owners: rows.map(({ section, paragraph }) => ({ section, paragraph })),
        nativeVerified: false,
        requirements: [
          'same-native-session-revision-and-layout',
          'source-paragraph-and-text-store-coverage',
          'current-reference-and-canonical-owner',
          'expected-raw-slice-and-protected-ranges',
          'newline-and-format-policy',
          'single-native-history-transaction-with-rollback',
        ],
      },
      totals: { snapshotUnits, matchedUnits, insertedUnits, insertedBytes, outputUnits },
    } as ReplaceAllPlan),
  );
}
