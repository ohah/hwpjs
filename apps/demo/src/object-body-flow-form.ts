import type { ObjectBodyFlow, ObjectBodyFlowSelector } from '@hwpjs/core';
import type { ObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import { bodyFlowValues, checkedBodyFlow, sameBodyFlow } from './object-body-flow-input.ts';
import {
  createObjectBodyFlowPort,
  type ObjectBodyFlowCapture,
  type ObjectBodyFlowEditor,
} from './object-body-flow-port.ts';
export type { ObjectBodyFlowEditor } from './object-body-flow-port.ts';
export function createObjectBodyFlowForm(
  root: HTMLElement,
  footer: HTMLElement,
  editor: ObjectBodyFlowEditor | undefined,
  selector: ObjectBodyFlowSelector,
  drawingCurrent: () => boolean,
  gate: ObjectPropertiesEditGate,
  onApplied: () => void,
) {
  const doc = root.ownerDocument,
    group = doc.createElement('fieldset'),
    legend = doc.createElement('legend'),
    status = doc.createElement('p');
  legend.textContent = '본문과 개체 배치';
  status.setAttribute('role', 'status');
  status.dataset.role = 'object-body-flow-status';
  group.append(legend);
  root.append(group);
  if (
    !editor ||
    typeof editor.getObjectBodyFlow !== 'function' ||
    typeof editor.dispatchCommand !== 'function'
  ) {
    status.textContent = '현재 개체의 본문 배치를 변경할 수 없습니다.';
    group.append(status);
    return {
      dispose() {
        group.remove();
      },
    };
  }
  const port = createObjectBodyFlowPort(editor, drawingCurrent),
    wrap = doc.createElement('select'),
    side = doc.createElement('select'),
    apply = doc.createElement('button');
  wrap.dataset.role = 'object-body-flow-wrap';
  side.dataset.role = 'object-body-flow-side';
  apply.dataset.role = 'object-body-flow-apply';
  apply.type = 'button';
  apply.textContent = '본문 배치 적용';
  for (const [control, title, options] of [
    [
      wrap,
      '본문과 배치',
      [
        ['', '확인 중'],
        ['SQUARE', '본문과 어울림'],
        ['TOP_AND_BOTTOM', '위아래'],
        ['BEHIND_TEXT', '글 뒤로'],
        ['IN_FRONT_OF_TEXT', '글 앞으로'],
      ],
    ],
    [
      side,
      '본문 방향',
      [
        ['', '확인 중'],
        ['BOTH_SIDES', '양쪽'],
        ['LEFT_ONLY', '왼쪽만'],
        ['RIGHT_ONLY', '오른쪽만'],
        ['LARGEST_ONLY', '넓은 쪽'],
      ],
    ],
  ] as const) {
    const label = doc.createElement('label');
    label.textContent = title;
    for (const [value, text] of options) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = text;
      control.append(option);
    }
    control.value = '';
    control.disabled = true;
    label.append(control);
    group.append(label);
  }
  group.append(status);
  footer.append(apply);
  let capture: ObjectBodyFlowCapture | undefined,
    original: ObjectBodyFlow | undefined,
    disposed = false,
    busy = true,
    composing = false;
  const draft = () => bodyFlowValues({ textWrap: wrap.value, textFlow: side.value }, original!);
  const availability = () => {
    const valid = !!capture && port.current(capture);
    let changed = false;
    try {
      changed = !!original && !sameBodyFlow(draft(), original);
    } catch {}
    apply.disabled =
      disposed || busy || composing || !valid || !changed || !gate.allowed('bodyFlow');
    wrap.disabled = disposed || busy || !valid || gate.busy;
    side.disabled = wrap.disabled || wrap.value !== 'SQUARE';
  };
  const unsubscribe = gate.subscribe(availability);
  const onChange = () => {
    if (disposed || busy || !capture || !original || !port.current(capture)) {
      availability();
      return;
    }
    if (wrap.value !== 'SQUARE') side.value = original.textFlow;
    let dirty = false;
    try {
      dirty = !sameBodyFlow(draft(), original);
      status.textContent = '배치만 변경하며 크기와 바깥 여백은 유지합니다.';
    } catch {
      status.textContent = '올바른 본문 배치를 선택해주세요.';
    }
    gate.setDirty('bodyFlow', dirty);
    availability();
  };
  wrap.addEventListener('change', onChange);
  side.addEventListener('change', onChange);
  const compositionStart = () => {
      composing = true;
      availability();
    },
    compositionEnd = () => {
      composing = false;
      availability();
    };
  root.addEventListener('compositionstart', compositionStart);
  root.addEventListener('compositionend', compositionEnd);
  const onApply = async () => {
    if (disposed || busy || composing || !capture || !original) return;
    if (!port.current(capture)) {
      capture = undefined;
      status.textContent = '문서가 바뀌었습니다. 개체 속성을 다시 열어주세요.';
      availability();
      return;
    }
    let flow: ObjectBodyFlow;
    try {
      flow = draft();
    } catch {
      status.textContent = '올바른 본문 배치를 선택해주세요.';
      return;
    }
    if (sameBodyFlow(flow, original) || !gate.begin('bodyFlow')) return;
    const owned = capture;
    capture = undefined;
    busy = true;
    availability();
    try {
      const result = await port.apply(owned, flow);
      if (disposed) return;
      if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op')
        onApplied();
      else status.textContent = '적용 상태를 확인하려면 개체 속성을 다시 열어주세요.';
    } catch {
      if (!disposed)
        status.textContent = '본문 배치를 확인하지 못했습니다. 개체 속성을 다시 열어주세요.';
    } finally {
      busy = false;
      gate.end('bodyFlow');
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
        status.textContent = '현재 개체의 본문 배치를 변경할 수 없습니다.';
        return;
      }
      original = Object.freeze(checkedBodyFlow(result.capture.read.observation.flow));
      capture = result.capture;
      wrap.value = original.textWrap;
      side.value = original.textFlow;
      status.textContent = '배치만 변경하며 크기와 바깥 여백은 유지합니다.';
    } catch {
      if (!disposed)
        status.textContent = '본문 배치를 확인하지 못했습니다. 개체 속성을 다시 열어주세요.';
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
      gate.setDirty('bodyFlow', false);
      wrap.removeEventListener('change', onChange);
      side.removeEventListener('change', onChange);
      root.removeEventListener('compositionstart', compositionStart);
      root.removeEventListener('compositionend', compositionEnd);
      apply.removeEventListener('click', click);
      group.remove();
      apply.remove();
    },
  };
}
