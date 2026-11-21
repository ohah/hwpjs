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
  selector: ObjectOuterMarginsSelector,
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
    !editor ||
    typeof editor.getObjectOuterMargins !== 'function' ||
    typeof editor.dispatchCommand !== 'function'
  ) {
    status.textContent = '현재 개체의 바깥 여백은 변경할 수 없습니다.';
    group.append(status);
    return {
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
    busy = true;
  const apply = doc.createElement('button');
  apply.type = 'button';
  apply.textContent = '바깥 여백 적용';
  apply.dataset.role = 'object-outer-margins-apply';
  const availability = () => {
    const valid = capture !== undefined && port.current(capture);
    apply.disabled = disposed || busy || !valid || !gate.allowed('margins');
    for (const field of outerMarginFields)
      inputs[field].disabled = disposed || busy || !valid || gate.busy;
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
      dirty[field] = !original || input.value.trim() !== outerMarginDraft(original)[field];
      gate.setDirty(
        'margins',
        outerMarginFields.some((key) => dirty[key]),
      );
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
    if (disposed || busy || !capture || !original) return;
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
      );
    } catch {
      status.textContent = '바깥 여백에 0 이상인 올바른 mm 값을 입력해주세요.';
      return;
    }
    if (!gate.begin('margins')) {
      status.textContent =
        '크기와 위치를 함께 변경할 수 없습니다. 다른 값을 되돌리거나 속성 창을 다시 열어주세요.';
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
  const click = () => {
    void onApply();
  };
  apply.addEventListener('click', click);
  void (async () => {
    try {
      const result = await port.read(selector);
      if (disposed) return;
      if (!result.available) {
        status.textContent = '현재 개체의 바깥 여백은 변경할 수 없습니다.';
        return;
      }
      const values = result.capture.read.observation.margins,
        labels = outerMarginDraft(values);
      capture = result.capture;
      original = values;
      for (const field of outerMarginFields) inputs[field].value = labels[field];
      status.textContent = '크기와 배치를 유지하며 글상자의 바깥 여백만 변경합니다.';
    } catch {
      if (!disposed)
        status.textContent = '바깥 여백을 확인하지 못했습니다. 개체 속성을 다시 열어주세요.';
    } finally {
      busy = false;
      if (!disposed) availability();
    }
  })();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      capture = undefined;
      unsubscribe();
      for (const remove of removals) remove();
      apply.removeEventListener('click', click);
      group.remove();
      apply.remove();
    },
  };
}
