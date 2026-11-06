import { DEMO_COMMAND_REGISTRY } from './command-support.ts';
import { createDialogLayer } from './dialog-layer.ts';
import {
  tableCellBorderReason,
  tableCellBorderValues,
  type TableCellBorderCapture,
  type TableCellBorderDraft,
} from './table-cell-border-port.ts';
// @ts-ignore Existing RGB validator is the sole hex parser.
import { parseCharacterColor } from '../../../js/character-color-args.mjs';
// @ts-ignore Wire subset owns the available line styles and widths.
import { CELL_BORDER_STYLES, CELL_BORDER_WIDTHS } from '../../../js/cell-border-command.mjs';
import './table-cell-border.css';

export function createTableCellBorderView(
  root: HTMLElement,
  capture: TableCellBorderCapture,
  callbacks: { apply: (draft: TableCellBorderDraft) => void; dismiss: () => void },
) {
  let disposed = false,
    composing = false,
    busy = false,
    stale: string | null = null,
    dirty = { style: false, width: false, color: false };
  const dismiss = () => {
    if (!disposed && !composing) callbacks.dismiss();
  };
  const layer = createDialogLayer(root, {
    role: 'table-cell-border-dialog',
    title: DEMO_COMMAND_REGISTRY['table-cell-border'].label,
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.body.classList.add('hwp-cell-border-body');
  const doc = root.ownerDocument,
    current = doc.createElement('p'),
    label = doc.createElement('label');
  const color = doc.createElement('input'),
    hex = doc.createElement('input'),
    status = doc.createElement('p');
  const apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  current.dataset.role = 'cell-border-current';
  current.textContent = '현재 선 모양·폭·색: 미관측';
  label.textContent = '새 선 색';
  color.type = 'color';
  color.value = '#000000';
  color.dataset.role = 'cell-border-color';
  color.setAttribute('aria-label', '새 선 색 선택');
  hex.type = 'text';
  hex.value = '';
  hex.placeholder = '#RRGGBB';
  hex.maxLength = 7;
  hex.dataset.role = 'cell-border-hex';
  hex.setAttribute('aria-label', '새 선 색 RGB 값');
  label.append(color, hex);
  status.dataset.role = 'cell-border-status';
  status.setAttribute('role', 'status');
  apply.type = cancel.type = 'button';
  apply.textContent = '적용';
  cancel.textContent = '취소';
  apply.dataset.role = 'cell-border-apply';
  cancel.dataset.role = 'cell-border-cancel';
  const sides = doc.createElement('fieldset');
  const legend = doc.createElement('legend');
  legend.textContent = '적용할 셀 바깥쪽 변';
  sides.append(legend);
  const checks = (
    [
      ['left', '왼쪽', 1],
      ['right', '오른쪽', 2],
      ['top', '위쪽', 4],
      ['bottom', '아래쪽', 8],
    ] as const
  ).map(([side, text, bit]) => {
    const label = doc.createElement('label'),
      input = doc.createElement('input');
    label.textContent = text;
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.role = 'cell-border-' + side;
    label.append(input);
    sides.append(label);
    input.addEventListener('change', () => {
      if (!disposed && !input.disabled) refresh();
    });
    return { input, bit };
  });
  function select(role: string, text: string, choices: readonly (readonly [string, string])[]) {
    const label = doc.createElement('label'),
      input = doc.createElement('select');
    label.textContent = text;
    input.dataset.role = role;
    input.setAttribute('aria-label', text);
    for (const [value, title] of [['', '직접 선택하세요'], ...choices]) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = title;
      input.append(option);
    }
    input.value = '';
    label.append(input);
    return { label, input };
  }
  const style = select(
    'cell-border-style',
    '새 선 모양',
    CELL_BORDER_STYLES.map(
      (value: string) =>
        [
          value,
          ({ NONE: '없음', SOLID: '실선', DOUBLE_SLIM: '가는 두 줄' } as Record<string, string>)[
            value
          ],
        ] as const,
    ),
  );
  const width = select(
    'cell-border-width',
    '새 선 폭 (mm)',
    CELL_BORDER_WIDTHS.map((value: number) => [String(value), (value / 100).toFixed(2)] as const),
  );
  const draft = (): TableCellBorderDraft => ({
    edges: checks.reduce((mask, { input, bit }) => mask | (input.checked ? bit : 0), 0),
    style: style.input.value,
    width: width.input.value,
    color: hex.value,
    dirty: { ...dirty },
  });
  function refresh() {
    const reason =
      stale ?? (capture.writeReason ? tableCellBorderReason(capture.writeReason) : null);
    let invalid = '';
    try {
      tableCellBorderValues(draft());
    } catch (error) {
      invalid = tableCellBorderReason(error instanceof Error ? error.message : 'InvalidCellBorder');
    }
    apply.disabled = disposed || composing || busy || !!reason || !!invalid;
    for (const input of [color, hex, style.input, width.input, ...checks.map(({ input }) => input)])
      input.disabled = disposed || busy || !!reason;
    status.textContent = reason ?? invalid;
    cancel.textContent = busy ? '닫기 (접수된 작업은 계속)' : '취소';
  }
  for (const [name, input] of [
    ['style', style.input],
    ['width', width.input],
  ] as const)
    input.addEventListener('change', () => {
      if (!disposed && !input.disabled) {
        dirty[name] = true;
        refresh();
      }
    });
  for (const type of ['input', 'change']) {
    color.addEventListener(type, () => {
      if (disposed || color.disabled) return;
      dirty.color = true;
      hex.value = color.value;
      refresh();
    });
    hex.addEventListener(type, () => {
      if (disposed || hex.disabled) return;
      dirty.color = true;
      if (parseCharacterColor(hex.value) !== null) color.value = hex.value;
      refresh();
    });
  }
  layer.element.addEventListener('compositionstart', () => {
    if (!disposed) {
      composing = true;
      refresh();
    }
  });
  layer.element.addEventListener('compositionend', () => {
    if (!disposed) {
      composing = false;
      refresh();
    }
  });
  apply.addEventListener('click', (event) => {
    if (
      !disposed &&
      !composing &&
      !apply.disabled &&
      !('isComposing' in event && event.isComposing === true)
    )
      callbacks.apply(draft());
  });
  cancel.addEventListener('click', dismiss);
  layer.body.append(current, sides, style.label, width.label, label, status);
  layer.footer.append(apply, cancel);
  refresh();
  layer.show(hex);
  return {
    focus() {
      if (!disposed) hex.focus();
    },
    setBusy(value: boolean) {
      if (!disposed) {
        busy = value;
        refresh();
      }
    },
    setStale(value: string) {
      if (!disposed) {
        stale = value;
        refresh();
      }
    },
    setStatus(value: string) {
      if (!disposed) status.textContent = value;
    },
    destroy() {
      if (!disposed) {
        disposed = true;
        layer.destroy();
      }
    },
  };
}
export type TableCellBorderView = ReturnType<typeof createTableCellBorderView>;
