import { createDialogLayer } from './dialog-layer.ts';
import { editableChartPoint, type ChartCapture } from './chart-data-port.ts';
import type { ChartDataViewFactory } from './chart-data-controller.ts';

export function chartDataViewFactory(root: HTMLElement): ChartDataViewFactory {
  return (targets, callbacks) => {
    const doc = root.ownerDocument;
    let disposed = false,
      busy = false,
      valid = false,
      composing = false,
      key229 = false;
    let fields: HTMLInputElement[] = [];
    const dismiss = () => {
      if (!composing && !key229 && !disposed) callbacks.onDismiss();
    };
    const layer = createDialogLayer(root, {
      role: 'chart-data',
      title: '기존 차트 데이터 편집',
      mode: 'modal',
      onDismiss: dismiss,
    });
    const label = doc.createElement('label'),
      select = doc.createElement('select');
    label.textContent = '기존 차트 ';
    select.setAttribute('aria-label', '편집할 기존 차트');
    targets.forEach((target, i) => {
      const option = doc.createElement('option');
      option.value = String(i);
      option.textContent = `차트 ${i + 1} · 구역 ${target.section} · 노드 ${target.wrapper}`;
      select.append(option);
    });
    label.append(select);
    const hint = doc.createElement('p'),
      rows = doc.createElement('div'),
      status = doc.createElement('p');
    hint.textContent =
      '기존 차트의 값과 범주를 수정합니다. 차트·계열 추가 및 삭제는 지원하지 않습니다.';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    rows.style.maxHeight = '45vh';
    rows.style.overflow = 'auto';
    const apply = doc.createElement('button'),
      cancel = doc.createElement('button');
    apply.type = cancel.type = 'button';
    apply.textContent = '변경 일괄 적용';
    cancel.textContent = '취소';
    layer.body.append(label, hint, rows, status);
    layer.footer.append(apply, cancel);
    const update = () => {
      select.disabled = busy || composing || key229;
      apply.disabled = busy || !valid || composing || key229;
      for (const input of fields)
        input.disabled = busy || !valid || input.dataset.editable !== 'true';
    };
    const removals: (() => void)[] = [];
    const listen = (node: EventTarget, kind: string, fn: (event: any) => void) => {
      node.addEventListener(kind, fn);
      removals.push(() => node.removeEventListener(kind, fn));
    };
    listen(select, 'change', () => {
      if (!busy && !composing && !key229 && !disposed) {
        const target = targets[Number(select.value)];
        if (target) callbacks.onSelect(target);
      }
    });
    listen(apply, 'click', () => {
      if (!apply.disabled && !disposed) callbacks.onApply(fields.map((input) => input.value));
    });
    listen(cancel, 'click', dismiss);
    listen(layer.element, 'compositionstart', () => {
      composing = true;
      update();
    });
    listen(layer.element, 'compositionend', () => {
      composing = false;
      key229 = false;
      update();
    });
    listen(layer.element, 'keydown', (event: KeyboardEvent) => {
      if (event.keyCode === 229 || event.isComposing) {
        key229 = true;
        update();
      }
    });
    listen(layer.element, 'keyup', (event: KeyboardEvent) => {
      if (!event.isComposing && event.keyCode !== 229) {
        key229 = false;
        update();
      }
    });
    update();
    layer.show(select);
    return {
      focus: () => select.focus(),
      setBusy(value) {
        busy = value;
        update();
      },
      setStatus(text) {
        status.textContent = text;
      },
      showCapture(capture: ChartCapture | null) {
        rows.replaceChildren();
        fields = [];
        valid = capture !== null && capture.points.some(editableChartPoint);
        capture?.points.forEach((point, i) => {
          const row = doc.createElement('label'),
            input = doc.createElement('input');
          row.style.display = 'block';
          row.textContent = `포인트 ${i} · ${point.kind} `;
          input.type = 'text';
          input.value = point.value;
          input.setAttribute('aria-label', `포인트 ${i} 값 (${point.kind})`);
          input.dataset.editable = String(editableChartPoint(point));
          fields.push(input);
          row.append(input);
          rows.append(row);
        });
        if (capture && !valid) status.textContent = '지원되는 편집 값이 없습니다.';
        update();
      },
      invalidate() {
        valid = false;
        status.textContent =
          '문서 상태가 바뀌었습니다. 차트를 다시 선택하거나 창을 다시 열어주세요.';
        update();
      },
      destroy() {
        if (disposed) return;
        disposed = true;
        for (const remove of removals) remove();
        layer.destroy();
      },
    };
  };
}
