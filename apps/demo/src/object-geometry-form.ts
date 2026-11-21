import type { ObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import type { HeadlessEditor, ObjectGeometrySelector, ObjectGeometryFrame } from '@hwpjs/core';
import { createObjectGeometryPort } from './object-geometry-port.ts';
import { createObjectGeometryController } from './object-geometry-controller.ts';
import {
  objectGeometryDraft,
  objectGeometryPatch,
  type ObjectGeometryField,
} from './object-geometry-input.ts';
export type ObjectGeometryEditor = Pick<
  HeadlessEditor,
  'getEditorState' | 'getObjectGeometry' | 'dispatchCommand'
>;
/** Reusable form. Only the fresh typed Native capture supplies values and write authority. */
export function createObjectGeometryForm(
  root: HTMLElement,
  footer: HTMLElement,
  editor: ObjectGeometryEditor | undefined,
  selector: ObjectGeometrySelector,
  onApplied: () => void,
  editGate?: ObjectPropertiesEditGate,
) {
  const doc = root.ownerDocument,
    group = doc.createElement('fieldset'),
    legend = doc.createElement('legend'),
    status = doc.createElement('p'),
    apply = doc.createElement('button');
  legend.textContent = '크기와 위치';
  group.append(legend);
  if (
    !editor ||
    typeof editor.getObjectGeometry !== 'function' ||
    typeof editor.dispatchCommand !== 'function'
  ) {
    status.textContent = '현재 실행 환경에서는 크기와 위치를 변경할 수 없습니다.';
    group.append(status);
    root.append(group);
    return {
      dispose() {
        group.remove();
      },
    };
  }
  status.setAttribute('role', 'status');
  status.textContent = '현재 개체의 편집 가능 여부를 확인하고 있습니다.';
  apply.type = 'button';
  apply.textContent = '적용';
  apply.disabled = true;
  apply.dataset.role = 'object-geometry-apply';
  const inputs = {} as Record<ObjectGeometryField, HTMLInputElement>,
    dirty = { width: false, height: false, horizontalOffset: false, verticalOffset: false };
  let original: ObjectGeometryFrame | undefined,
    busy = true,
    disposed = false,
    size = false,
    position = false;
  const listeners: Array<() => void> = [];
  for (const [field, labelText] of [
    ['width', '너비'],
    ['height', '높이'],
    ['horizontalOffset', '가로 위치 간격'],
    ['verticalOffset', '세로 위치 간격'],
  ] as const) {
    const label = doc.createElement('label'),
      input = doc.createElement('input');
    label.textContent = labelText + ' (mm)';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.disabled = true;
    input.dataset.role = 'object-geometry-' + field;
    inputs[field] = input;
    const onInput = () => {
      dirty[field] = true;
      publishDirty();
    };
    input.addEventListener('input', onInput);
    listeners.push(() => input.removeEventListener('input', onInput));
    label.append(input);
    group.append(label);
  }
  const inlineLabel = doc.createElement('label'),
    inline = doc.createElement('input');
  inline.type = 'checkbox';
  inline.disabled = true;
  inlineLabel.textContent = '글자처럼 취급';
  inlineLabel.append(inline);
  group.append(inlineLabel);
  const placement = doc.createElement('p');
  placement.textContent =
    '위치 간격은 현재 문서의 배치 기준을 유지합니다. 글자처럼 취급하는 개체는 본문 흐름을 따릅니다.';
  group.append(placement, status);
  root.append(group);
  footer.append(apply);
  function availability() {
    apply.disabled =
      busy ||
      !original ||
      (!size && !position) ||
      (editGate !== undefined && !editGate.allowed('geometry'));
    for (const field of Object.keys(inputs) as ObjectGeometryField[])
      inputs[field].disabled =
        busy ||
        editGate?.busy === true ||
        !original ||
        (field === 'width' || field === 'height' ? !size : !position);
    inline.disabled = busy || editGate?.busy === true || !original || !position;
  }
  const controller = createObjectGeometryController({
    port: createObjectGeometryPort(editor),
    selector,
    onApplied,
    onBusy(value) {
      busy = value;
      availability();
    },
    onStatus(text) {
      status.textContent = text;
    },
    onCapture(capture) {
      original = capture.read.observation.frame;
      size = capture.read.observation.editable.size;
      position = capture.read.observation.editable.position;
      const draft = objectGeometryDraft(original);
      for (const field of Object.keys(inputs) as ObjectGeometryField[])
        inputs[field].value = draft[field];
      inline.checked = original.treatAsCharacter;
      status.textContent =
        size || position
          ? '현재 문서의 원본 개체 속성을 변경합니다.'
          : '현재 개체는 크기와 위치를 변경할 수 없습니다.';
      availability();
    },
  });
  const unsubscribeGate = editGate?.subscribe(availability);
  function publishDirty() {
    if (!editGate || !original) return;
    const labels = objectGeometryDraft(original);
    editGate.setDirty(
      'geometry',
      (Object.keys(inputs) as ObjectGeometryField[]).some(
        (field) => dirty[field] && inputs[field].value.trim() !== labels[field],
      ) || inline.checked !== original.treatAsCharacter,
    );
  }
  const onInline = publishDirty;
  inline.addEventListener('change', onInline);
  const onApply = () => {
    if (disposed || busy || !original) return;
    try {
      const patch = {
        ...objectGeometryPatch(
          {
            width: inputs.width.value,
            height: inputs.height.value,
            horizontalOffset: inputs.horizontalOffset.value,
            verticalOffset: inputs.verticalOffset.value,
            dirty,
          },
          original,
        ),
        ...(inline.checked !== original.treatAsCharacter
          ? { treatAsCharacter: inline.checked }
          : {}),
      };
      if (editGate && !editGate.begin('geometry')) {
        status.textContent =
          '바깥 여백을 함께 변경할 수 없습니다. 다른 값을 되돌리거나 속성 창을 다시 열어주세요.';
        return;
      }
      void controller.apply(patch).finally(() => editGate?.end('geometry'));
    } catch {
      status.textContent = '크기와 위치에 올바른 mm 값을 입력해주세요.';
    }
  };
  apply.addEventListener('click', onApply);
  void controller.read();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.dispose();
      unsubscribeGate?.();
      inline.removeEventListener('change', onInline);
      for (const remove of listeners) remove();
      apply.removeEventListener('click', onApply);
      group.remove();
      apply.remove();
    },
  };
}
