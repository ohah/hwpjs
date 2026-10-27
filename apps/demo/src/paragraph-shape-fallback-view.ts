import type { createFormattingDialogView } from './formatting-dialog-view.ts';
import './paragraph-shape-fallback.css';
type View = Pick<ReturnType<typeof createFormattingDialogView>, 'element'>;
const scopeText =
  '이 창에서는 정렬만 적용합니다. 여백·간격·격자·테두리·배경은 이 창에서 변경되지 않습니다.';
/** 기존 정렬창의 권한·입력·IME·확인·정리 수명은 그대로 두고 표현만 보강한다. */
export function decorateParagraphAlignmentFallback(view: View): void {
  const element = view.element;
  if (element.dataset.kind !== 'paragraph' || element.dataset.paragraphFallbackDecorated === 'true')
    return;
  element.dataset.paragraphFallbackDecorated = 'true';
  element.dataset.paragraphMode = 'alignment-only';
  element.classList.add('hwp-paragraph-alignment-fallback');
  element.setAttribute('aria-description', scopeText);
  const notice = element.ownerDocument.createElement('p');
  notice.dataset.role = 'paragraph-fallback-scope';
  notice.className = 'hwp-paragraph-fallback-scope';
  notice.textContent = scopeText;
  const status = element.querySelector<HTMLElement>('[data-role=format-dialog-status]');
  status?.parentElement?.append(notice);
}
