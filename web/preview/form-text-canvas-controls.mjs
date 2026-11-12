import {
  formTextDraftEditorGeometry,
  paintedFormTextEditorGeometry,
} from './form-text-draft-editor-geometry.mjs';
import { createFormTextDraft } from './form-text-eol.mjs';
import { canvasDocumentPoint } from './canvas-pointer-coordinates.mjs';

/** Temporary input only. Worker/native responses remain the value authority. */
export function createFormTextCanvasControls({ canvas, viewport, renderer, note, ready, request }) {
  let available = false,
    pending = false,
    selected = null,
    selectedAutoSizeOwner = null,
    input = null,
    draft = null,
    beforeEdit = null,
    composing = false,
    closed = false;
  let stopGeometryWatch = () => {};
  const events = new AbortController(),
    options = { signal: events.signal };
  const dismiss = () => {
    stopGeometryWatch();
    stopGeometryWatch = () => {};
    input?.remove();
    input = null;
    draft = null;
    beforeEdit = null;
    selected = null;
    selectedAutoSizeOwner = null;
    composing = false;
  };
  const deniedMessage = '이 양식은 현재 편집할 수 없습니다. 다시 선택해 주세요.';
  const resizeUnavailableMessage = '자동 크기를 갱신할 수 없어 현재 표시 크기로 입력합니다.';
  const admitSelected = () => {
    if (!selectedAutoSizeOwner) return true;
    if (
      selected?.form.autoSizeOwner === selectedAutoSizeOwner &&
      renderer.formTextDraftAdmission?.(selected) === true
    )
      return true;
    dismiss();
    note.textContent = deniedMessage;
    return false;
  };
  const resizeAutoSizeDraft = () => {
    if (!input || !selected) return true;
    if (!selectedAutoSizeOwner) return true;
    if (!admitSelected()) return false;
    if (composing) return true;
    const scale = renderer.viewScale?.() ?? 1;
    const bounds = canvas.getBoundingClientRect();
    const left = bounds.left + selected.x * scale - (viewport.scrollLeft ?? 0);
    const top = bounds.top + selected.y * scale - viewport.scrollTop;
    if (!Number.isFinite(scale) || scale <= 0 || ![left, top].every(Number.isFinite)) {
      input.dataset.formTextGeometryCapability = 'unsupported';
      input.dataset.formTextGeometryBasis = 'retained-edit-viewport';
      note.textContent = '화면 배율을 확인할 수 없어 입력 위치 갱신을 보류했습니다.';
      return true;
    }
    let geometry;
    try {
      geometry = formTextDraftEditorGeometry(
        renderer.measureFormTextDraft?.(selected, input.value),
      );
    } catch {
      geometry = { kind: 'unsupported' };
    }
    // Recheck the same authority after measurement; failure never authorizes fallback.
    if (!admitSelected()) return false;
    const supported = geometry.kind === 'supported';
    const style = supported ? geometry.style : paintedFormTextEditorGeometry(selected);
    if (!style) {
      dismiss();
      note.textContent = deniedMessage;
      return false;
    }
    const previousCapability = input.dataset.formTextGeometryCapability;
    input.dataset.formTextGeometryCapability = supported ? 'supported' : 'unsupported';
    input.dataset.formTextGeometryBasis = supported
      ? 'current-autosize-measurement'
      : style.minWidth
        ? 'painted-edit-viewport'
        : 'current-painted-geometry';
    Object.assign(input.style, {
      left: `${left}px`,
      top: `${top}px`,
      ...style,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
    });
    if (!supported)
      note.textContent = style.minWidth
        ? '자동 크기를 갱신할 수 없어 입력창을 넓혀 입력합니다.'
        : resizeUnavailableMessage;
    else if (previousCapability === 'unsupported')
      note.textContent = '양식 입력 위치를 갱신했습니다.';
    return true;
  };
  const submit = () => {
    if (!input || !selected || pending || !available || !ready()) return false;
    if (!admitSelected() || composing) return false;
    let text;
    try {
      text = selected.form.multiline === true ? draft.update(input.value) : input.value;
    } catch {
      note.textContent = '입력 내용을 확인해 주세요. 올바른 문자와 줄바꿈을 사용해 주세요.';
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
    } catch {
      pending = false;
      note.textContent = '양식 값을 적용하지 못했습니다. 다시 시도해 주세요.';
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
      if (
        target.form.autoSizeOwner &&
        (!Number.isFinite(scale) ||
          scale <= 0 ||
          ![
            bounds.left + target.x * scale - (viewport.scrollLeft ?? 0),
            bounds.top + target.y * scale - viewport.scrollTop,
          ].every(Number.isFinite))
      ) {
        note.textContent = '화면 배율을 확인할 수 없습니다. 다시 선택해 주세요.';
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss();
      selected = target;
      selectedAutoSizeOwner = target.form.autoSizeOwner ?? null;
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
            } catch {
              note.textContent = '입력 내용을 확인해 주세요. 올바른 문자와 줄바꿈을 사용해 주세요.';
            }
          }
          beforeEdit = null;
          resizeAutoSizeDraft();
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
          resizeAutoSizeDraft();
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
      if (!resizeAutoSizeDraft()) {
        dismiss();
        return;
      }
      canvas.ownerDocument.body.append(input);
      input.focus();
      input.select();
      if (target.form.autoSizeOwner)
        stopGeometryWatch =
          renderer.watchFormTextGeometry?.(target, (current) => {
            if (!current) {
              dismiss();
              return;
            }
            selected = current;
            resizeAutoSizeDraft();
          }) ?? (() => {});
      if (input.dataset.formTextGeometryCapability !== 'unsupported')
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
      if (message.kind === 'enable') {
        available = !message.error && message.formTextAvailable === true;
        if (!available) dismiss();
      }
      if (message.content || (message.applied && message.error)) dismiss();
      if (message.kind === 'form-text') {
        pending = false;
        note.textContent = message.error
          ? '양식 값을 적용하지 못했습니다. 다시 시도해 주세요.'
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
