import type { StateToken } from '../state/editor-state.ts';
import type { CreatedCellTypingRequest } from './created-cell-typing-dto.ts';
import { validateCharacterFormattingPatch } from './character-formatting-patch.ts';
import { copyOwned, freezeDTO } from '../state/owned.ts';
import { isWellFormedText } from '../state/text-scalar.ts';

declare const createdCellTextTarget: unique symbol;
/** Exact editor-issued logical cell authority. Copying observations does not issue a target. */
export interface CreatedCellTextTarget extends StateToken {
  readonly [createdCellTextTarget]: true;
  readonly coordinateSpace: 'created-cell-utf16';
  readonly format: 'hwp5' | 'hwpx';
  readonly text: string;
  readonly startUnit: number;
  readonly endUnit: number;
}
export interface CreatedCellTextSelector {
  readonly section: number;
  readonly identity: string;
  readonly row: number;
  readonly column: number;
}
export interface CreatedCellTextRange {
  readonly startUnit: number;
  readonly endUnit: number;
}
/** Insertion styling applies only to newly inserted text, never to a retained range. */
export interface CreatedCellSplicePayload {
  readonly target: CreatedCellTextTarget;
  readonly text: string;
  readonly insertion?: CreatedCellTypingRequest['insertion'];
  readonly selectionVersion?: number;
}
export interface CreatedCellTextObservation {
  readonly schemaVersion: 1;
  readonly format: 'hwp5' | 'hwpx';
  readonly scope: number;
  readonly binding: Readonly<{ session: string; revision: number }>;
  readonly selector: CreatedCellTextSelector;
  readonly text: string;
  readonly reference?: unknown;
}
const uint = (n: unknown): n is number =>
  typeof n === 'number' &&
  Number.isSafeInteger(n) &&
  n >= 0 &&
  n <= 0xffffffff &&
  !Object.is(n, -0);
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const p = copyOwned(value) as Record<string, unknown>;
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.keys(p).some((k) => !keys.includes(k))
  )
    throw Error('InvalidCreatedCellTextTarget');
  return p;
}
export function checkedCreatedCellTextSelector(value: unknown): CreatedCellTextSelector {
  const p = record(value, ['section', 'identity', 'row', 'column']);
  if (
    ![p.section, p.row, p.column].every(uint) ||
    typeof p.identity !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(p.identity) ||
    BigInt(p.identity) > 0xffffffffffffffffn
  )
    throw Error('InvalidCreatedCellTextTarget');
  return freezeDTO(p) as unknown as CreatedCellTextSelector;
}
export function checkedCreatedCellTextRange(value: unknown): CreatedCellTextRange {
  const p = record(value, ['startUnit', 'endUnit']);
  if (!uint(p.startUnit) || !uint(p.endUnit) || p.endUnit < p.startUnit)
    throw Error('InvalidTextPosition');
  return freezeDTO(p) as unknown as CreatedCellTextRange;
}
function boundary(text: string, unit: number): boolean {
  return (
    unit <= text.length &&
    !(
      unit > 0 &&
      unit < text.length &&
      text.charCodeAt(unit - 1) >= 0xd800 &&
      text.charCodeAt(unit - 1) <= 0xdbff &&
      text.charCodeAt(unit) >= 0xdc00 &&
      text.charCodeAt(unit) <= 0xdfff
    )
  );
}
export function checkedCreatedCellTextObservation(
  input: unknown,
  selector: CreatedCellTextSelector,
  range: CreatedCellTextRange,
  format: 'hwp5' | 'hwpx',
  revision: number | undefined,
): CreatedCellTextObservation {
  const p = record(input, [
    'schemaVersion',
    'format',
    'scope',
    'binding',
    'selector',
    'text',
    'reference',
  ]);
  const binding = record(p.binding, ['session', 'revision']);
  const actual = checkedCreatedCellTextSelector(p.selector);
  if (
    p.schemaVersion !== 1 ||
    p.format !== format ||
    !Number.isSafeInteger(p.scope) ||
    (p.scope as number) < 0 ||
    typeof binding.session !== 'string' ||
    !binding.session ||
    !uint(binding.revision) ||
    binding.revision !== revision ||
    actual.section !== selector.section ||
    actual.identity !== selector.identity ||
    actual.row !== selector.row ||
    actual.column !== selector.column ||
    typeof p.text !== 'string' ||
    !isWellFormedText(p.text)
  )
    throw Error('StaleCreatedCellTextObservation');
  if (!boundary(p.text, range.startUnit) || !boundary(p.text, range.endUnit))
    throw Error('InvalidTextPosition');
  if (format === 'hwp5' && (!p.reference || typeof p.reference !== 'object'))
    throw Error('InvalidCurrentReferenceScope');
  if (format === 'hwpx' && Object.hasOwn(p, 'reference'))
    throw Error('InvalidCurrentReferenceScope');
  return freezeDTO(p) as unknown as CreatedCellTextObservation;
}
/** Own request data while preserving the unforgeable WeakMap target identity. */
export function captureCreatedCellSplicePayload(input: unknown): CreatedCellSplicePayload {
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw Error('InvalidCreatedCellSplice');
  const p: Record<string, unknown> = Object.create(null);
  for (const k of Reflect.ownKeys(input)) {
    if (typeof k !== 'string' || !['target', 'text', 'insertion', 'selectionVersion'].includes(k))
      throw Error('InvalidCreatedCellSplice');
    const d = Object.getOwnPropertyDescriptor(input, k)!;
    if (!('value' in d)) throw Error('AccessorPayloadUnsupported');
    p[k] = k === 'target' ? d.value : copyOwned(d.value);
  }
  if (
    !p.target ||
    typeof p.target !== 'object' ||
    typeof p.text !== 'string' ||
    !isWellFormedText(p.text)
  )
    throw Error('InvalidText');
  if (p.selectionVersion !== undefined && !uint(p.selectionVersion))
    throw Error('InvalidSelectionVersion');
  if (p.insertion !== undefined) {
    const insertion = record(p.insertion, ['character']);
    if (Object.hasOwn(insertion, 'character'))
      validateCharacterFormattingPatch(insertion.character);
    p.insertion = freezeDTO(insertion);
  }
  return Object.freeze(p) as unknown as CreatedCellSplicePayload;
}
