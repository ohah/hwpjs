import type { EditorState } from '@hwpjs/core';
import type { AtomicRangeSelector } from './range-atomic-formatting.mjs';
interface FormattingPoint {
  readonly section: number;
  readonly paragraph: number;
  readonly unit: number;
}
interface FormattingRange {
  readonly section: number;
  readonly paragraph: number;
  readonly startUnit: number;
  readonly endUnit: number;
}
export interface FormattingRangeBinding {
  readonly documentId: EditorState['documentId'];
  readonly generation: number;
  readonly format: 'hwp5' | 'hwpx';
  readonly anchor: FormattingPoint;
  readonly focus: FormattingPoint;
  readonly members: readonly {
    readonly section: number;
    readonly paragraph: number;
    readonly owner: string;
    readonly text: string;
    readonly offsets:
      | readonly { readonly at: number; readonly source: number }[]
      | null
      | undefined;
    readonly original:
      | { readonly kind: 'original'; readonly section: number; readonly id: string }
      | undefined;
    readonly display: FormattingRange;
    readonly source: FormattingRange;
  }[];
}
/** 현재 관측의 값 비교 자료만 반환한다. 과거 선택을 복원하거나 Native 권한을 만들지 않는다. */
export function captureFormattingRangeBinding(
  state: EditorState,
  selection: unknown,
): FormattingRangeBinding | null;
export function formattingRangeBindingMatches(
  binding: FormattingRangeBinding | null | undefined,
  state: EditorState,
  selection: unknown,
): boolean;
export function formattingRangeSelectors(
  binding: FormattingRangeBinding | null | undefined,
  character: boolean,
): readonly AtomicRangeSelector[];
