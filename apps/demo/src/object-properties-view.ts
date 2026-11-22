import { createPictureCropForm } from './picture-crop-form.ts';
import type { HeadlessEditor } from '@hwpjs/core';
import type { PictureReplacementHost } from './picture-replacement-port.ts';
import {
  createObjectOuterMarginsForm,
  type ObjectOuterMarginsEditor,
} from './object-outer-margins-form.ts';
import type { ObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import type { ObjectOuterMarginsSelector } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import {
  pictureSize,
  proportionalPictureSize,
  type PictureSizeDraft,
} from './object-properties-input.ts';
import type { ObjectPropertiesView } from './object-properties-controller.ts';
import type { ObjectPropertiesCapture } from './object-properties-port.ts';
import './object-properties.css';

let instance = 0;
export function createObjectPropertiesView(
  root: HTMLElement,
  captured: ObjectPropertiesCapture,
  initial: PictureSizeDraft,
  callbacks: {
    onApply(draft: PictureSizeDraft): void;
    onDismiss(): void;
    editGate?: ObjectPropertiesEditGate;
    crop?: {
      editor: HeadlessEditor;
      host(): PictureReplacementHost | undefined;
      gate: ObjectPropertiesEditGate;
      onStatus(text: string): void;
    };
    onReplace?(): void;
    replacementInput?: HTMLInputElement;
    outerMargins?: {
      editor: ObjectOuterMarginsEditor;
      selector: ObjectOuterMarginsSelector;
      current(): boolean;
      gate: ObjectPropertiesEditGate;
    };
  },
): ObjectPropertiesView {
  if (!captured.target) throw Error('MissingPicturePropertyTarget');
  const doc = root.ownerDocument,
    prefix = `hwp-object-properties-${++instance}`;
  let disposed = false,
    busy = false,
    composing = false,
    key229 = false;
  let reason: string | null = null,
    notice = '';
  let ratioError = false,
    lastEdited: 'width' | 'height' = 'width';
  const dirty = { width: false, height: false };
  const dismiss = () => {
    if (!disposed && !composing && !key229) callbacks.onDismiss();
  };
  const layer = createDialogLayer(root, {
    role: 'object-properties',
    title: '개체 속성 — 그림',
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.element.classList.add('hwp-object-properties');
  const basics = doc.createElement('fieldset'),
    legend = doc.createElement('legend');
  legend.textContent = '크기';
  basics.append(legend);
  const fields = {} as Record<'width' | 'height', HTMLInputElement>;
  for (const [key, text] of [
    ['width', '너비'],
    ['height', '높이'],
  ] as const) {
    const label = doc.createElement('label'),
      input = doc.createElement('input'),
      unit = doc.createElement('span');
    label.textContent = text;
    input.id = `${prefix}-${key}`;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = initial[key];
    input.dataset.role = `object-${key}`;
    input.setAttribute('aria-label', `${text} (mm)`);
    input.setAttribute('aria-describedby', `${prefix}-status`);
    unit.textContent = 'mm';
    label.append(input, unit);
    basics.append(label);
    fields[key] = input;
  }
  const lockRow = doc.createElement('label'),
    lock = doc.createElement('input');
  lock.type = 'checkbox';
  lock.dataset.role = 'object-lock-ratio';
  lock.setAttribute('aria-label', '가로·세로 비율 유지');
  const lockText = doc.createElement('span');
  lockText.textContent = '가로·세로 비율 유지';
  lockRow.append(lock, lockText);
  basics.append(lockRow);
  const hint = doc.createElement('p'),
    status = doc.createElement('p');
  hint.textContent = callbacks.outerMargins
    ? '크기, 바깥 여백, 이미지 파일은 한 번에 하나씩 변경합니다.'
    : '선택한 그림의 크기를 변경합니다. 위치·회전·자르기 등 추가 속성은 현재 이 창에서 지원하지 않습니다.';
  hint.className = 'hwp-object-hint';
  status.id = `${prefix}-status`;
  status.dataset.role = 'object-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  apply.type = cancel.type = 'button';
  apply.textContent = '확인';
  cancel.textContent = '취소';
  apply.dataset.role = 'object-apply';
  cancel.dataset.role = 'object-cancel';
  layer.body.append(basics, hint, status);
  // Keep the native file chooser inside the active modal's non-inert subtree.
  if (callbacks.replacementInput) layer.body.append(callbacks.replacementInput);
  const replace = callbacks.onReplace ? doc.createElement('button') : null;
  const replacementStatus = callbacks.onReplace ? doc.createElement('p') : null;
  let replacementEnabled = false;
  let replacementPhase: 'reading' | 'sending' | null = null;
  if (replace && replacementStatus) {
    replace.type = 'button';
    replace.dataset.role = 'object-replace-picture';
    replace.textContent = '이미지 파일 교체';
    replacementStatus.dataset.role = 'object-replacement-status';
    replacementStatus.setAttribute('role', 'status');
    replacementStatus.textContent = '현재 그림의 교체 지원을 확인하고 있습니다.';
    layer.body.append(replace, replacementStatus);
  }

  layer.footer.append(apply, cancel);
  const removals: (() => void)[] = [];
  const listen = (node: EventTarget, type: string, fn: (event: any) => void) => {
    node.addEventListener(type, fn);
    removals.push(() => node.removeEventListener(type, fn));
  };
  const draft = (): PictureSizeDraft => ({
    width: fields.width.value,
    height: fields.height.value,
    dirty: { ...dirty },
    ...(lock.checked && dirty[lastEdited] ? { aspectRatio: lastEdited } : {}),
  });
  const gate = callbacks.editGate ?? callbacks.outerMargins?.gate;
  let margins: ReturnType<typeof createObjectOuterMarginsForm> | undefined;
  const refresh = () => {
    if (disposed) return;
    let invalid: string | null = null;
    try {
      pictureSize(draft(), captured.target!);
    } catch {
      invalid =
        '너비와 높이는 양의 mm 값으로 입력하세요. 소수점 아래 둘째 자리까지 사용할 수 있습니다.';
    }
    if (ratioError)
      invalid = '비율을 유지한 크기가 허용 범위를 벗어납니다. 더 작은 크기를 입력하세요.';
    apply.disabled =
      busy ||
      replacementPhase !== null ||
      composing ||
      key229 ||
      reason !== null ||
      invalid !== null ||
      (gate !== undefined && !gate.allowed('geometry'));
    fields.width.disabled =
      fields.height.disabled =
      lock.disabled =
        busy || replacementPhase !== null || reason !== null || gate?.busy === true;
    cancel.textContent =
      busy || replacementPhase === 'sending' || gate?.busy === true ? '닫기 (적용은 계속)' : '취소';
    if (replace)
      replace.disabled =
        busy ||
        replacementPhase !== null ||
        composing ||
        key229 ||
        !replacementEnabled ||
        (gate !== undefined && !gate.allowed('geometry'));
    layer.element.setAttribute(
      'aria-busy',
      String(busy || replacementPhase !== null || gate?.busy === true),
    );
    status.textContent =
      reason ??
      invalid ??
      (gate?.conflict
        ? '크기와 바깥 여백은 함께 적용할 수 없습니다. 다른 초안을 되돌리세요.'
        : notice);
    margins?.refresh();
  };
  const changed = (key: 'width' | 'height') => {
    lastEdited = key;
    dirty[key] = fields[key].value !== initial[key];
    gate?.setDirty('geometry', busy || replacementPhase !== null || dirty.width || dirty.height);
    if (disposed || busy || reason || composing || key229) return;
    notice = '';
    ratioError = false;
    if (lock.checked) {
      try {
        const other = key === 'width' ? 'height' : 'width';
        if (!dirty[key]) {
          fields[other].value = initial[other];
          dirty[other] = false;
        } else {
          const next = proportionalPictureSize(key, fields[key].value, captured.target!);
          fields[other].value = next[other];
          dirty[other] = true;
        }
      } catch {
        ratioError = true;
      }
    }
    gate?.setDirty('geometry', busy || replacementPhase !== null || dirty.width || dirty.height);
    refresh();
  };
  for (const key of ['width', 'height'] as const) listen(fields[key], 'input', () => changed(key));
  listen(lock, 'change', () => {
    ratioError = false;
    if (dirty.width || dirty.height) changed(lastEdited);
    else refresh();
  });
  listen(layer.element, 'compositionstart', () => {
    composing = true;
    refresh();
  });
  listen(layer.element, 'compositionend', () => {
    composing = false;
    key229 = false;
    changed(lastEdited);
  });
  listen(layer.element, 'keydown', (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) {
      key229 = true;
      refresh();
      return;
    }
    if (
      !event.defaultPrevented &&
      event.key === 'Enter' &&
      (event.target === fields.width || event.target === fields.height)
    ) {
      event.preventDefault();
      event.stopPropagation();
      refresh();
      if (!disposed && !apply.disabled) callbacks.onApply(draft());
    }
  });
  listen(layer.element, 'keyup', () => {
    key229 = false;
    changed(lastEdited);
  });
  listen(apply, 'click', () => {
    refresh();
    if (!disposed && !apply.disabled) callbacks.onApply(draft());
  });
  listen(cancel, 'click', dismiss);
  if (replace)
    listen(replace, 'click', () => {
      refresh();
      if (!disposed && !replace.disabled) callbacks.onReplace?.();
    });
  margins = callbacks.outerMargins
    ? createObjectOuterMarginsForm(
        layer.body,
        layer.footer,
        callbacks.outerMargins.editor,
        callbacks.outerMargins.selector,
        () => !busy && replacementPhase === null && callbacks.outerMargins!.current(),
        callbacks.outerMargins.gate,
        callbacks.onDismiss,
      )
    : undefined;
  const crop = callbacks.crop
    ? createPictureCropForm({ ...callbacks.crop, root: layer.body, onClose: callbacks.onDismiss })
    : undefined;
  const stopGate = gate?.subscribe(refresh);
  refresh();
  layer.show(fields.width);
  return {
    focus() {
      if (!disposed) fields.width.focus();
    },
    setBusy(value) {
      busy = value;
      gate?.setDirty('geometry', busy || replacementPhase !== null || dirty.width || dirty.height);
      refresh();
    },
    setAvailability(value) {
      reason = value;
      crop?.refresh();
      refresh();
    },
    setStatus(value) {
      notice = value;
      refresh();
    },
    setReplacementPending(value) {
      replacementPhase = value;
      gate?.setDirty('geometry', busy || replacementPhase !== null || dirty.width || dirty.height);
      refresh();
    },
    setReplacementAvailability(enabled, text) {
      replacementEnabled = enabled;
      if (replacementStatus) replacementStatus.textContent = text;
      refresh();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      stopGate?.();
      margins?.dispose();
      crop?.dispose();
      gate?.setDirty('geometry', false);
      for (const remove of removals.splice(0)) remove();
      layer.destroy();
    },
  };
}
