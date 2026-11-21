import type { ObjectOuterMargins, ObjectOuterMarginsSelector } from '@hwpjs/core';
import type { ObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import {
  outerMarginDraft,
  outerMarginFields,
  outerMarginValues,
  type OuterMarginField,
} from './object-outer-margins-input.ts';
import {
  createObjectOuterMarginsPort,
  type ObjectOuterMarginsCapture,
  type ObjectOuterMarginsEditor,
} from './object-outer-margins-port.ts';
export type { ObjectOuterMarginsEditor } from './object-outer-margins-port.ts';
export function createObjectOuterMarginsForm(
  root: HTMLElement,
  footer: HTMLElement,
  editor: ObjectOuterMarginsEditor | undefined,
  selector: ObjectOuterMarginsSelector | undefined,
  drawingCurrent: () => boolean,
  gate: ObjectPropertiesEditGate,
  onApplied: () => void,
) {
  const doc = root.ownerDocument,
    group = doc.createElement('fieldset'),
    legend = doc.createElement('legend'),
    status = doc.createElement('p');
  legend.textContent = '바깥 여백';
  status.setAttribute('role', 'status');
  status.dataset.role = 'object-outer-margins-status';
  group.append(legend);
  root.append(group);
  if (
    !selector ||
    !editor ||
    typeof editor.getObjectOuterMargins !== 'function' ||
    typeof editor.dispatchCommand !== 'function'
  ) {
    status.textContent = '현재 개체의 바깥 여백은 변경할 수 없습니다.';
    group.append(status);
    return {
      refresh() {},
      dispose() {
        group.remove();
      },
    };
  }
  const port = createObjectOuterMarginsPort(editor, drawingCurrent);
  const inputs = {} as Record<OuterMarginField, HTMLInputElement>,
    dirty = { left: false, right: false, top: false, bottom: false };
  const removals: Array<() => void> = [];
  let original: ObjectOuterMargins | undefined,
    capture: ObjectOuterMarginsCapture | undefined,
    disposed = false,
    busy = true,
    composing = false,
    legacyIME = false;
  const apply = doc.createElement('button');
  apply.type = 'button';
  apply.textContent = '바깥 여백 적용';
  apply.dataset.role = 'object-outer-margins-apply';
  const availability = () => {
    const valid = capture !== undefined && port.current(capture);
    let validValues = false;
    try {
      if (original && capture) {
        outerMarginValues(
          {
            left: inputs.left.value,
            right: inputs.right.value,
            top: inputs.top.value,
            bottom: inputs.bottom.value,
          },
          dirty,
          original,
          capture.read.observation.format,
        );
        validValues = true;
      }
    } catch {}
    apply.disabled =
      disposed ||
      busy ||
      composing ||
      legacyIME ||
      !valid ||
      !validValues ||
      !gate.allowed('margins');
    for (const field of outerMarginFields)
      inputs[field].disabled =
        disposed ||
        busy ||
        !valid ||
        gate.busy ||
        (capture?.read.observation.verticalOnly === true &&
          (field === 'left' || field === 'right'));
  };
  for (const [field, title] of [
    ['left', '왼쪽'],
    ['right', '오른쪽'],
    ['top', '위쪽'],
    ['bottom', '아래쪽'],
  ] as const) {
    const label = doc.createElement('label'),
      input = doc.createElement('input');
    label.textContent = title + ' (mm)';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.disabled = true;
    input.dataset.role = 'object-outer-margins-' + field;
    inputs[field] = input;
    const onInput = () => {
      dirty[field] =
        !original ||
        input.value.trim() !== outerMarginDraft(original, capture?.read.observation.format)[field];
      gate.setDirty(
        'margins',
        outerMarginFields.some((key) => dirty[key]),
      );
      availability();
    };
    input.addEventListener('input', onInput);
    removals.push(() => input.removeEventListener('input', onInput));
    label.append(input);
    group.append(label);
  }
  status.textContent = '현재 개체의 바깥 여백을 확인하고 있습니다.';
  group.append(status);
  footer.append(apply);
  const unsubscribe = gate.subscribe(availability);
  const onApply = async () => {
    if (disposed || busy || composing || legacyIME || !capture || !original) return;
    if (!port.current(capture)) {
      capture = undefined;
      status.textContent = '문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.';
      availability();
      return;
    }
    let margins: ObjectOuterMargins;
    try {
      margins = outerMarginValues(
        {
          left: inputs.left.value,
          right: inputs.right.value,
          top: inputs.top.value,
          bottom: inputs.bottom.value,
        },
        dirty,
        original,
        capture.read.observation.format,
      );
    } catch {
      status.textContent = '바깥 여백에 0 이상인 올바른 mm 값을 입력해주세요.';
      return;
    }
    if (!gate.begin('margins')) {
      status.textContent =
        '한 번에 크기와 위치, 바깥 여백, 본문 배치 중 하나만 변경하세요. 다른 값을 되돌리거나 속성 창을 다시 열어주세요.';
      return;
    }
    const owned = capture;
    capture = undefined;
    busy = true;
    availability();
    try {
      const result = await port.apply(owned, margins);
      if (disposed) return;
      if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op')
        onApplied();
      else status.textContent = '바깥 여백 적용 상태를 확인하려면 개체 속성을 다시 열어주세요.';
    } catch {
      if (!disposed)
        status.textContent = '바깥 여백을 확인하지 못했습니다. 개체 속성을 다시 열어주세요.';
    } finally {
      busy = false;
      gate.end('margins');
      if (!disposed) availability();
    }
  };
  const compositionStart = () => {
    composing = true;
    availability();
  };
  const compositionEnd = () => {
    composing = false;
    legacyIME = false;
    availability();
  };
  const keydown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.isComposing || e.keyCode === 229 || e.which === 229) {
      legacyIME = true;
      availability();
    }
  };
  const keyup = (event: Event) => {
    legacyIME = (event as KeyboardEvent).isComposing === true;
    availability();
  };
  root.addEventListener('compositionstart', compositionStart);
  root.addEventListener('compositionend', compositionEnd);
  root.addEventListener('keydown', keydown);
  root.addEventListener('keyup', keyup);
  const click = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.isComposing || e.keyCode === 229 || e.which === 229) return;
    void onApply();
  };
  apply.addEventListener('click', click);
  void (async () => {
    try {
      const result = await port.read(selector);
      if (disposed) return;
      if (!result.available) {
        status.textContent =
          result.reason === 'UnsupportedObjectOuterMargins'
            ? '현재 배치에서는 바깥 여백 편집을 지원하지 않습니다.'
            : '현재 개체의 바깥 여백은 변경할 수 없습니다.';
        return;
      }
      const values = result.capture.read.observation.margins,
        labels = outerMarginDraft(values, result.capture.read.observation.format);
      capture = result.capture;
      original = values;
      for (const field of outerMarginFields) inputs[field].value = labels[field];
      status.textContent = outerMarginFields.some((field) => values[field] < 0)
        ? '원본의 음수 여백을 표시합니다. 모든 여백을 0 이상으로 수정한 뒤 적용해주세요.'
        : capture.read.observation.verticalOnly === true
          ? '위아래 배치에서는 위쪽과 아래쪽 여백만 변경합니다. 왼쪽과 오른쪽 원값은 유지합니다.'
          : '크기와 배치를 유지하며 개체의 바깥 여백만 변경합니다.';
    } catch {
      if (!disposed)
        status.textContent = '바깥 여백을 확인하지 못했습니다. 개체 속성을 다시 열어주세요.';
    } finally {
      busy = false;
      if (!disposed) availability();
    }
  })();
  return {
    refresh: availability,
    dispose() {
      if (disposed) return;
      disposed = true;
      capture = undefined;
      unsubscribe();
      gate.setDirty('margins', false);
      root.removeEventListener('compositionstart', compositionStart);
      root.removeEventListener('compositionend', compositionEnd);
      root.removeEventListener('keydown', keydown);
      root.removeEventListener('keyup', keyup);
      for (const remove of removals) remove();
      apply.removeEventListener('click', click);
      group.remove();
      apply.remove();
    },
  };
}
