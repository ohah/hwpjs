import { createObjectBodyFlowForm, type ObjectBodyFlowEditor } from './object-body-flow-form.ts';
import { createObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import {
  createObjectOuterMarginsForm,
  type ObjectOuterMarginsEditor,
} from './object-outer-margins-form.ts';
import { createObjectGeometryForm, type ObjectGeometryEditor } from './object-geometry-form.ts';
import { createDialogLayer } from './dialog-layer.ts';
import type { DrawingPropertiesCapture } from './drawing-properties-port.ts';
import type { DrawingPropertiesView } from './drawing-properties-controller.ts';

export function createDrawingPropertiesView(
  root: HTMLElement,
  capture: DrawingPropertiesCapture,
  onDismiss: () => void,
  editor?: ObjectGeometryEditor,
  marginsEditor?: ObjectOuterMarginsEditor,
  drawingCurrent: () => boolean = () => true,
  bodyFlowEditor?: ObjectBodyFlowEditor,
): DrawingPropertiesView {
  const doc = root.ownerDocument;
  const layer = createDialogLayer(root, {
    role: 'drawing-properties',
    title: '개체 속성',
    mode: 'modal',
    onDismiss,
  });
  const scope = doc.createElement('p');
  scope.textContent =
    '아래 내용은 현재 문서에서 조회한 정보입니다. 크기와 위치, 바깥 여백, 본문 배치는 편집 가능한 경우 하나씩 적용할 수 있습니다.';
  const values = doc.createElement('dl');
  for (const field of capture.fields) {
    const term = doc.createElement('dt'),
      value = doc.createElement('dd');
    term.textContent = field.label;
    value.textContent = field.value;
    values.append(term, value);
  }
  layer.body.append(scope, values);
  for (const label of ['너비', '높이']) {
    if (capture.fields.some((field) => field.label === label)) continue;
    const unavailable = doc.createElement('p');
    unavailable.textContent = `${label} 정보를 확인할 수 없습니다.`;
    layer.body.append(unavailable);
  }
  const textLabel = doc.createElement('p'),
    text = doc.createElement('pre');
  textLabel.textContent =
    capture.text === null
      ? '내용 정보를 확인할 수 없습니다.'
      : `내용${capture.textTruncated ? ' (일부만 표시)' : ''}`;
  text.style.whiteSpace = 'pre-wrap';
  text.style.overflowWrap = 'anywhere';
  text.textContent = capture.text === '' ? '내용이 없습니다.' : (capture.text ?? '');
  layer.body.append(textLabel);
  if (capture.text !== null) layer.body.append(text);
  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = '닫기';
  dismiss.addEventListener('click', onDismiss);
  layer.footer.append(dismiss);
  const editGate = createObjectPropertiesEditGate();
  const editStatus = doc.createElement('p');
  editStatus.setAttribute('role', 'status');
  editStatus.dataset.role = 'object-property-edit-status';
  layer.body.append(editStatus);
  const unsubscribeGate = editGate.subscribe(() => {
    editStatus.textContent = editGate.conflict
      ? '한 번에 크기와 위치, 바깥 여백, 본문 배치 중 하나만 변경하세요. 다른 값을 되돌리거나 속성 창을 다시 열어주세요.'
      : '';
  });
  const geometry = createObjectGeometryForm(
    layer.body,
    layer.footer,
    editor,
    {
      kind: 'drawing',
      section: capture.target.section,
      node: capture.target.drawingNode,
    },
    onDismiss,
    editGate,
  );
  const margins = createObjectOuterMarginsForm(
    layer.body,
    layer.footer,
    marginsEditor,
    capture.format === 'hwp5'
      ? { kind: 'textbox', section: capture.target.section, node: capture.target.drawingNode }
      : capture.format === 'hwpx'
        ? { kind: 'drawing', section: capture.target.section, node: capture.target.drawingNode }
        : undefined,
    drawingCurrent,
    editGate,
    onDismiss,
  );
  const bodyFlow = createObjectBodyFlowForm(
    layer.body,
    layer.footer,
    bodyFlowEditor,
    {
      kind: 'drawing',
      section: capture.target.section,
      node: capture.target.drawingNode,
    },
    drawingCurrent,
    editGate,
    onDismiss,
  );
  let disposed = false;
  return {
    show() {
      if (!disposed) layer.show(dismiss);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      dismiss.removeEventListener('click', onDismiss);
      unsubscribeGate();
      geometry.dispose();
      margins.dispose();
      bodyFlow.dispose();
      layer.destroy();
    },
  };
}
