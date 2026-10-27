import type { SelectionTarget } from './commands.ts';
import type { validateSelection } from './selection.ts';

/** 기존 ordinal ABI에 전달할 수 있는 원본 바인딩만 확인한다. node ID를 ordinal로 바꾸지 않는다. */
export function validateOriginalParagraphReference(
  target: SelectionTarget,
  row: ReturnType<typeof validateSelection>,
  errorName: 'UnsupportedFormattingReference' | 'UnsupportedHyperlinkReference',
): void {
  if (target.format !== 'hwp5') return;
  const ref = row.currentReference as { kind?: string; section?: number; id?: string } | undefined;
  if (
    ref?.kind !== 'original' ||
    ref.section !== target.section ||
    typeof ref.id !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(ref.id) ||
    BigInt(ref.id) > 0xffffffffn
  ) {
    throw Error(errorName);
  }
}
