import type { EditorState } from '../state/editor-state.ts';
import {
  assertDocumentTextIndexCurrent,
  type DocumentTextIndex,
} from '../state/document-text-search.ts';
import { copyOwned, freezeDTO } from '../state/owned.ts';
import { createLiteralMatcher, validateLiteralQuery } from '../state/literal-matches.ts';
import { isWellFormedText } from '../state/text-scalar.ts';

/** Native transaction resource ceilings, independent of display/window bounds.
 * The receiving Native adapter must enforce its own limits and owner policies. */
export const DOCUMENT_REPLACE_ALL_LIMITS = Object.freeze({
  paragraphs: 20000,
  snapshotUnits: 4 * 1024 * 1024,
  queryUnits: 200000,
  replacementUnits: 4 * 1024 * 1024,
  matches: 4096,
  insertedUnits: 4 * 1024 * 1024,
  insertedBytes: 4 * 1024 * 1024,
  outputUnits: 4 * 1024 * 1024,
});
type Limits = { readonly [Key in keyof typeof DOCUMENT_REPLACE_ALL_LIMITS]: number };
export interface DocumentReplaceAllRequest {
  readonly query: string;
  readonly replacement: string;
  readonly limits?: Partial<Limits>;
}
export interface DocumentReplacementGroup {
  /** Read locator only; the Native adapter must resolve it in the bound session. */
  readonly ref: string;
  readonly beforeUnits: number;
  readonly edits: readonly Readonly<{
    startUnit: number;
    endUnit: number;
    expectedOriginal: string;
    text: string;
  }>[];
}

function add(total: number, amount: number, limit: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > limit - total)
    throw Error('ReplaceAllPlanLimitExceeded');
  return total + amount;
}
function record(input: unknown, keys: readonly string[]) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw Error('InvalidDocumentReplaceAllRequest');
}

/** Plan the entire admitted Native inventory, never the painted rows. No owner is
 * discarded for being protected or generated. This is not a Native wire command
 * or an execution grant: mapping, complete coverage and every edit are validated
 * again before one atomic Native transaction is allowed to publish. */
export function planDocumentReplaceAll(
  state: EditorState,
  index: DocumentTextIndex,
  input: DocumentReplaceAllRequest,
) {
  assertDocumentTextIndexCurrent(index, state);
  const request = copyOwned(input);
  record(request, ['query', 'replacement', 'limits']);
  if (typeof request.replacement !== 'string' || !isWellFormedText(request.replacement))
    throw Error('InvalidReplacementText');
  const limits: { -readonly [Key in keyof Limits]: number } = { ...DOCUMENT_REPLACE_ALL_LIMITS };
  if (request.limits !== undefined) {
    record(request.limits, Object.keys(limits));
    for (const [key, value] of Object.entries(request.limits)) {
      const name = key as keyof Limits;
      if (!Number.isSafeInteger(value) || value < 0 || value > limits[name])
        throw Error('InvalidReplaceAllPlanLimits');
      limits[name] = value;
    }
  }
  validateLiteralQuery(request.query);
  add(0, request.query.length, limits.queryUnits);
  add(0, request.replacement.length, limits.replacementUnits);
  add(0, index.native.rows.length, limits.paragraphs);
  // Enforce budgets before allocating the query prefix table.
  const matches = createLiteralMatcher(request.query);
  let bytesPerMatch = 0;
  for (const scalar of request.replacement) {
    const code = scalar.codePointAt(0)!;
    bytesPerMatch += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  const groups: DocumentReplacementGroup[] = [];
  let snapshotUnits = 0,
    matchedUnits = 0,
    insertedUnits = 0,
    insertedBytes = 0,
    matchCount = 0;
  for (const row of index.native.rows) {
    snapshotUnits = add(snapshotUnits, row.text.length, limits.snapshotUnits);
    const edits: {
      startUnit: number;
      endUnit: number;
      expectedOriginal: string;
      text: string;
    }[] = [];
    for (const at of matches(row.text)) {
      matchCount = add(matchCount, 1, limits.matches);
      matchedUnits = add(matchedUnits, request.query.length, limits.snapshotUnits);
      insertedUnits = add(insertedUnits, request.replacement.length, limits.insertedUnits);
      insertedBytes = add(insertedBytes, bytesPerMatch, limits.insertedBytes);
      // Exact identity replacements stay in the plan: Native still checks every
      // match and coverage; neither an unsupported owner nor a no-op is skipped.
      edits.push({
        startUnit: at,
        endUnit: at + request.query.length,
        expectedOriginal: request.query,
        text: request.replacement,
      });
    }
    if (edits.length) groups.push({ ref: row.ref, beforeUnits: row.text.length, edits });
  }
  const outputUnits = add(snapshotUnits - matchedUnits, insertedUnits, limits.outputUnits);
  return freezeDTO({
    schemaVersion: 1 as const,
    executionAuthority: false as const,
    scope: 'native-document-text' as const,
    token: index.token,
    stateVersion: index.stateVersion,
    format: index.native.format,
    binding: index.native.binding,
    coverage: index.native.coverage,
    query: request.query,
    replacement: request.replacement,
    requiresNativePreflight: true as const,
    matchCount,
    groups,
    totals: { snapshotUnits, matchedUnits, insertedUnits, insertedBytes, outputUnits },
  });
}
export type DocumentReplaceAllPlan = ReturnType<typeof planDocumentReplaceAll>;
