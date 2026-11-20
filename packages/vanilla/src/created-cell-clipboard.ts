import type {
  SPLICE_TEXT_COMMAND,
  HeadlessEditor,
  CommandResult,
  CreatedCellTextSelector,
  CreatedCellTextRange,
} from '@hwpjs/core';
// @ts-ignore 기존 선택 텍스트 I/O 경로를 그대로 재사용합니다.
import { transferSelectedText } from '../../../web/preview/clipboard-transfer.mjs';
export interface CreatedCellClipboardSelection {
  readonly selector: CreatedCellTextSelector;
  readonly range: CreatedCellTextRange;
  readonly expectedText: string;
  readonly text: string;
  readonly current: () => boolean;
}
/** 읽기 캡처는 target이 아닙니다. 삭제에만 현재 Core target을 별도 발급합니다. */
export function captureCreatedCellClipboard(options: {
  editor: Pick<HeadlessEditor, 'getCreatedCellTextTarget' | 'dispatchCommand'>;
  selection: CreatedCellClipboardSelection;
  token: Parameters<HeadlessEditor['getCreatedCellTextTarget']>[2];
  clipboard?: { writeText?: (text: string) => Promise<void> } | null;
  spliceCommand: typeof SPLICE_TEXT_COMMAND;
  cut: boolean;
  writable: boolean;
  current: () => boolean;
  report: (message: string) => void;
  onResult?: (result: CommandResult) => void;
  prepareCut?: () => { complete(result: CommandResult): Promise<boolean>; cancel(): void } | null;
}): (() => Promise<boolean>) | null {
  const { editor, selection, clipboard, cut, report } = options;
  const current = () => options.current() && selection.current() && options.current();
  if (
    !current() ||
    typeof clipboard?.writeText !== 'function' ||
    (cut &&
      (!options.writable ||
        typeof editor.getCreatedCellTextTarget !== 'function' ||
        typeof editor.dispatchCommand !== 'function'))
  )
    return null;
  let used = false;
  return async () => {
    if (used) return false;
    used = true;
    if (!current()) {
      report('SurfaceClipboardSelectionStale');
      return false;
    }
    try {
      const target = cut
        ? await editor.getCreatedCellTextTarget(selection.selector, selection.range, options.token)
        : null;
      if (!current()) {
        report('CreatedCellClipboardTargetStale');
        return false;
      }
      if (
        cut &&
        (!target ||
          target.text !== selection.expectedText ||
          target.startUnit !== selection.range.startUnit ||
          target.endUnit !== selection.range.endUnit)
      ) {
        report('CreatedCellClipboardTargetMismatch');
        return false;
      }
      return await transferSelectedText({
        clipboard,
        text: selection.text,
        isCurrent: current,
        onFailure: report,
        cut,
        async remove() {
          if (!target || !current()) {
            report('CreatedCellClipboardTargetStale');
            return false;
          }
          const continuation = options.prepareCut?.();
          if (options.prepareCut && !continuation) {
            report('CreatedCellClipboardTargetStale');
            return false;
          }
          let result: CommandResult;
          let restored = true;
          try {
            result = await editor.dispatchCommand(options.spliceCommand, { target, text: '' });
            // 화면 복구 예외나 관찰자 예외가 실제 Core 결과를 숨기지 않습니다.
            try {
              options.onResult?.(result);
            } catch {}
            if (result.status === 'committed-with-snapshot' && continuation) {
              try {
                restored = await continuation.complete(result);
              } catch {
                restored = false;
              }
            }
          } finally {
            continuation?.cancel();
          }
          if (result.status !== 'committed-with-snapshot') {
            report(result.error ?? result.status);
            return false;
          }
          if (!restored) {
            report('CreatedCellClipboardCaretUnavailable');
            return false;
          }
          report('선택 텍스트 오려두기 완료');
          return true;
        },
        report,
      });
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
}
