import { createFormTextDraft } from './form-text-eol.mjs';
import { canvasDocumentPoint } from './canvas-pointer-coordinates.mjs';

/** Temporary input only. Worker/native responses remain the value authority. */
export function createFormTextCanvasControls({ canvas, viewport, renderer, note, ready, request }) {
  let available = false,
    pending = false,
    selected = null,
    input = null,
    draft = null,
    beforeEdit = null,
    composing = false,
    closed = false;
  const events = new AbortController(),
    options = { signal: events.signal };
  const dismiss = () => {
    input?.remove();
    input = null;
    draft = null;
    beforeEdit = null;
    selected = null;
    composing = false;
  };
  const submit = () => {
    if (!input || !selected || composing || pending || !available || !ready()) return false;
    let text;
    try {
      text = selected.form.multiline === true ? draft.update(input.value) : input.value;
    } catch (error) {
      note.textContent = error.message;
      return false;
    }
    const target = selected.form.form;
    if (
      !text.isWellFormed() ||
      text.length > 65535 ||
      (selected.form.multiline === true && /\t/.test(text))
    ) {
      note.textContent = '올바른 Unicode 문자열을 입력하세요(최대65535유닛).';
      return false;
    }
    pending = true;
    try {
      if (
        !request({
          kind: 'form-text',
          origin: 'form',
          section: target.section,
          formNode: target.formNode,
          text,
        })
      ) {
        pending = false;
        return false;
      }
    } catch (error) {
      pending = false;
      note.textContent = `양식 요청 실패: ${error.message}`;
      return false;
    }
    dismiss();
    note.textContent = '양식 값 반영 중…';
    return true;
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (
        closed ||
        event.button !== 0 ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        pending ||
        !available ||
        !ready()
      )
        return;
      const bounds = canvas.getBoundingClientRect(),
        scale = renderer.viewScale?.() ?? 1;
      const point = canvasDocumentPoint(
        event,
        bounds,
        viewport.scrollTop,
        scale,
        viewport.scrollLeft ?? 0,
      );
      const target = renderer.formTextAtLogicalPoint(point.x, point.y);
      if (
        !target ||
        target.form.form.editable === false ||
        !['edit', 'edit_box', 'combo_box'].includes(target.form.form.source.kind)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss();
      selected = target;
      const multiline = target.form.multiline === true;
      input = canvas.ownerDocument.createElement(multiline ? 'textarea' : 'input');
      if (multiline) {
        input.wrap = target.form.wordWrap === true ? 'soft' : 'off';
        input.spellcheck = false;
      } else input.type = 'text';
      draft = multiline ? createFormTextDraft(target.form.label) : null;
      input.value = draft ? draft.projection : target.form.label;
      input.addEventListener(
        'beforeinput',
        (event) => {
          beforeEdit = draft
            ? {
                projection: input.value,
                start: input.selectionStart,
                end: input.selectionEnd,
                inputType: event.inputType,
              }
            : null;
        },
        options,
      );
      input.addEventListener(
        'input',
        (event) => {
          if (draft) {
            try {
              draft.update(input.value, event.inputType, beforeEdit);
            } catch (error) {
              note.textContent = error.message;
            }
          }
          beforeEdit = null;
        },
        options,
      );
      input.setAttribute(
        'aria-label',
        multiline
          ? '양식 여러 줄 값 · Ctrl+Enter 적용 · Escape 취소'
          : '양식 값 · Enter 적용 · Escape 취소',
      );
      Object.assign(input.style, {
        position: 'fixed',
        zIndex: '1000',
        boxSizing: 'border-box',
        left: `${bounds.left + target.x * scale - (viewport.scrollLeft ?? 0)}px`,
        top: `${bounds.top + target.y * scale - viewport.scrollTop}px`,
        width: `${target.width * scale}px`,
        height: `${Math.max(24, target.height * scale)}px`,
        font: target.form.font,
        color: target.form.foreground,
        background: target.form.background,
        ...(multiline
          ? {
              width: `${target.width}px`,
              height: `${target.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              lineHeight: `${target.form.lineHeight}px`,
              scrollbarWidth: 'none',
              whiteSpace: target.form.wordWrap === true ? 'break-spaces' : 'pre',
              wordBreak: 'break-all',
              lineBreak: 'anywhere',
              overflowWrap: 'anywhere',
              padding: '0 3px',
              border: '0',
              resize: 'none',
              overflow: 'auto',
            }
          : {}),
      });
      input.addEventListener(
        'compositionstart',
        () => {
          composing = true;
        },
        options,
      );
      input.addEventListener(
        'compositionend',
        () => {
          composing = false;
        },
        options,
      );
      input.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            dismiss();
            canvas.focus();
          } else if (
            e.key === 'Enter' &&
            (!multiline || e.ctrlKey || e.metaKey) &&
            !e.isComposing &&
            !composing
          ) {
            e.preventDefault();
            if (submit()) canvas.focus();
          }
        },
        options,
      );
      canvas.ownerDocument.body.append(input);
      input.focus();
      input.select();
      note.textContent = multiline
        ? '여러 줄 양식: Enter 줄바꿈, Ctrl+Enter 적용, Escape 취소.'
        : '양식 값 입력: Enter 적용, Escape 취소. 편집 권한은 적용 시 원본 속성으로 검사합니다.';
    },
    { ...options, capture: true },
  );
  viewport.addEventListener('scroll', dismiss, options);
  return {
    message(message) {
      if (closed) return;
      if (['load', 'unlock'].includes(message.kind)) {
        available = false;
        pending = false;
        dismiss();
      }
      if (message.kind === 'enable')
        available = !message.error && message.formTextAvailable === true;
      if (message.content || (message.applied && message.error)) dismiss();
      if (message.kind === 'form-text') {
        pending = false;
        note.textContent = message.error
          ? `양식 변경 실패: ${message.error}`
          : '양식 값을 적용했습니다.';
      }
    },
    close() {
      if (closed) return;
      closed = true;
      events.abort();
      dismiss();
    },
  };
}
