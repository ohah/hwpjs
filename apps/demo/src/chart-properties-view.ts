import { createObjectGeometryForm, type ObjectGeometryEditor } from './object-geometry-form.ts';
import { createDialogLayer } from './dialog-layer.ts';
import { pictureMillimeters } from './object-properties-input.ts';
import type { ChartPropertiesViewFactory } from './chart-properties-controller.ts';

export function chartPropertiesViewFactory(
  root: HTMLElement,
  editor?: ObjectGeometryEditor,
): ChartPropertiesViewFactory {
  return (callbacks) => {
    const doc = root.ownerDocument;
    let geometry: ReturnType<typeof createObjectGeometryForm> | undefined;
    let disposed = false,
      ready = false;
    const dismiss = () => {
      if (!disposed) callbacks.onDismiss();
    };
    const layer = createDialogLayer(root, {
      role: 'chart-properties',
      title: '개체 속성',
      mode: 'modal',
      onDismiss: dismiss,
    });
    const rows = doc.createElement('dl'),
      note = doc.createElement('p'),
      status = doc.createElement('p');
    note.textContent = '차트 제목과 데이터는 아래 데이터 편집에서 변경합니다.';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const edit = doc.createElement('button'),
      close = doc.createElement('button');
    edit.type = close.type = 'button';
    edit.textContent = '데이터 편집';
    close.textContent = '닫기';
    edit.dataset.role = 'chart-properties-edit-data';
    close.dataset.role = 'chart-properties-close';
    edit.disabled = true;
    const onEdit = () => {
      if (!disposed && ready && !edit.disabled) callbacks.onEditData();
    };
    edit.addEventListener('click', onEdit);
    close.addEventListener('click', dismiss);
    layer.body.append(rows, note, status);
    layer.footer.append(edit, close);
    layer.show(close);
    const row = (name: string, value: string) => {
      const term = doc.createElement('dt'),
        detail = doc.createElement('dd');
      term.textContent = name;
      detail.textContent = value;
      rows.append(term, detail);
    };
    const mm = (value: unknown) =>
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= -0x80000000 &&
      value <= 0xffffffff
        ? `${value < 0 ? '−' : ''}${value === 0 ? '0' : pictureMillimeters(Math.abs(value))} mm`
        : '확인할 수 없음';
    return {
      focus: () => {
        if (!disposed) close.focus();
      },
      showCapture(capture, availability) {
        if (disposed) return;
        rows.replaceChildren();
        ready = capture !== null;
        edit.disabled = !capture || availability.enabled !== true;
        status.textContent = capture
          ? availability.enabled
            ? ''
            : (availability.reason ?? '현재 차트 데이터를 편집할 수 없습니다.')
          : '현재 차트 속성을 읽고 있습니다.';
        if (!capture) return;
        if (!geometry)
          geometry = createObjectGeometryForm(
            layer.body,
            layer.footer,
            editor,
            { kind: 'chart', section: capture.target.section, node: capture.target.wrapper },
            dismiss,
          );
        const g = capture.source.host.geometry;
        row(
          capture.title?.shortened ? '제목 (일부)' : '제목',
          capture.title ? capture.title.lines.join('\n') : '확인할 수 없음',
        );
        row('너비', g.width_relative === 4 ? mm(g.width) : '상대 크기 또는 확인할 수 없음');
        row('높이', g.height_relative === 2 ? mm(g.height) : '상대 크기 또는 확인할 수 없음');
        row(
          '글자처럼 취급',
          g.treat_as_character === true
            ? '예'
            : g.treat_as_character === false
              ? '아니오'
              : '확인할 수 없음',
        );
        row('가로 위치 간격', mm(g.horizontal_offset));
        row('세로 위치 간격', mm(g.vertical_offset));
      },
      destroy() {
        if (disposed) return;
        disposed = true;
        ready = false;
        edit.removeEventListener('click', onEdit);
        close.removeEventListener('click', dismiss);
        geometry?.dispose();
        layer.destroy();
      },
    };
  };
}
