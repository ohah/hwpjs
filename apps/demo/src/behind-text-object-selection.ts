import type { EditorState } from '@hwpjs/core';
import type { ActionAvailability } from './shell-contract.ts';
export interface BehindTextObjectSelectionHost {
  requestBehindTextObjectSelection?(): boolean;
}
type State = Pick<EditorState, 'status' | 'content' | 'historyRecoveryRequired'>;
export function behindTextObjectSelectionAvailability(
  state: State,
  host: BehindTextObjectSelectionHost | undefined,
): ActionAvailability {
  if (state.status !== 'ready' || state.historyRecoveryRequired)
    return { enabled: false, reason: '문서가 준비된 뒤 글 뒤 개체를 선택하세요.' };
  if (
    !state.content ||
    typeof state.content !== 'object' ||
    !('format' in state.content) ||
    state.content.format !== 'hwpx'
  )
    return { enabled: false, reason: 'HWPX 문서에서 글 뒤 개체를 선택할 수 있습니다.' };
  if (typeof host?.requestBehindTextObjectSelection !== 'function')
    return { enabled: false, reason: '현재 보기에서는 글 뒤 개체를 선택할 수 없습니다.' };
  return { enabled: true };
}
/** The owning Surface arms/cancels the one-shot trusted border click, not the app. */
export function requestBehindTextObjectSelection(
  getState: () => State,
  host: BehindTextObjectSelectionHost | undefined,
  note: (message: string) => void,
): boolean {
  const available = behindTextObjectSelectionAvailability(getState(), host);
  if (!available.enabled) {
    note(available.reason!);
    return false;
  }
  let armed = false;
  try {
    armed = host?.requestBehindTextObjectSelection?.() === true;
  } catch {
    armed = false;
  }
  note(
    armed
      ? '글 뒤 개체의 테두리를 클릭한 뒤 P를 눌러 개체 속성을 여세요. Escape로 취소할 수 있습니다.'
      : '지금은 글 뒤 개체를 선택할 수 없습니다. 문서 상태를 확인한 뒤 다시 실행하세요.',
  );
  return armed;
}
