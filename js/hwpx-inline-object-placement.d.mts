import type {
  InlineObjectBinding,
  InlineObjectOwner,
  InlineObjectSelector,
  InlineObjectAddress,
  InlineObjectOwnedAddress,
  InlineObjectObservation,
} from '../packages/core/src/commands/inline-object-placement-dto.ts';
export type {
  InlineObjectBinding,
  InlineObjectOwner,
  InlineObjectSelector,
  InlineObjectAddress,
  InlineObjectOwnedAddress,
  InlineObjectObservation,
} from '../packages/core/src/commands/inline-object-placement-dto.ts';
export function checkedInlineObjectOwner(input: unknown): InlineObjectOwner;
export function checkedInlineObjectSelector(input: unknown): InlineObjectSelector;
export function checkedInlineObjectObservation(input: unknown): InlineObjectObservation;
export function matchInlineObjectObservation(
  selector: InlineObjectSelector,
  observation: unknown,
): InlineObjectObservation;
export function checkedInlineObjectTarget(
  input: unknown,
): InlineObjectAddress & { unit: number; expected_text: string };
export function checkedInlineObjectTarget(
  input: unknown,
  equation: true,
): InlineObjectAddress & { start: number; expectedText: string };
export function inlineObjectPlacementAvailable(wasm: Readonly<Record<string, unknown>>): boolean;
export function requireInlineObjectPlacement(
  wasm: Readonly<Record<string, unknown>>,
  request: unknown,
): void;
