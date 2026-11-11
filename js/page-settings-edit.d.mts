export type * from '../packages/core/src/commands/page-settings-dto.ts';
import type {
  PageSettingsValues,
  PageSettingsBinding,
  HwpxPageSettingsSnapshot,
  Hwp5PageSettingsSnapshot,
  HwpxPageSettingsTarget,
  Hwp5PageSettingsTarget,
  HwpxPageSettingsUnavailableReason,
  Hwp5PageSettingsUnavailableReason,
  PageSettingsOwner,
  HwpxPageSettingsCapabilities,
  Hwp5PageSettingsCapabilities,
  PageSettingsCapabilities,
  PageSettingsWriteRequest,
  PageSettingsWriteOutcome,
  PageSettingsEditApi,
} from '../packages/core/src/commands/page-settings-dto.ts';
export function ownPageRecord(value: unknown, keys: readonly string[]): Record<string, unknown>;
export function checkedPageSettingsValues(value: unknown): PageSettingsValues;
export function checkedPageSettingsCapabilities(value: unknown): PageSettingsCapabilities;
export function pageSettingsSource(
  cap: PageSettingsCapabilities,
  row: PageSettingsCapabilities['sections'][number],
): Omit<
  HwpxPageSettingsSnapshot,
  | 'section_ordinal'
  | 'element_index'
  | 'duplicate_margins'
  | 'hide_first_empty_line'
  | 'visibility_count'
> | null;
export function createPageSettingsEditApi(options: {
  wasm: Readonly<Record<string, unknown>>;
  memory: {
    copy(ptr: number, len: number): Uint8Array;
    error(): Error;
    withBytes<T>(bytes: Uint8Array, callback: (ptr: number, len: number) => T): T;
  };
  check(): void;
  format?: 'hwpx' | 'hwp5';
}): PageSettingsEditApi;
