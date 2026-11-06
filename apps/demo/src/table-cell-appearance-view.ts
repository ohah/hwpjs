import { DEMO_COMMAND_REGISTRY } from './command-support.ts';
import { createDialogLayer } from './dialog-layer.ts';
import {
  tableCellAppearanceReason,
  tableCellAppearanceValues,
  type TableCellAppearanceCapture,
  type TableCellAppearanceDraft,
} from './table-cell-appearance-port.ts';
// @ts-ignore Wire validators own the supported line vocabulary and millimetre widths.
import { CELL_BORDER_STYLES, CELL_BORDER_WIDTHS } from '../../../js/cell-border-command.mjs';
// @ts-ignore Existing RGB validator is the sole hex parser.
import { parseCharacterColor } from '../../../js/character-color-args.mjs';
import './table-cell-appearance.css';

export function createTableCellAppearanceView(
  root: HTMLElement,
  initial: TableCellAppearanceCapture,
  callbacks: {
    apply: (draft: TableCellAppearanceDraft, keepOpen?: boolean) => void;
    dismiss: () => void;
  },
) {
  let capture = initial,
    disposed = false,
    busy = false,
    composing = false,
    stale: string | null = null,
    reported: string | null = null,
    dirty = { style: false, width: false, color: false };
  const doc = root.ownerDocument;
  const dismiss = () => {
    if (!disposed && !composing) callbacks.dismiss();
  };
  const layer = createDialogLayer(root, {
    role: 'table-cell-appearance-dialog',
    title: DEMO_COMMAND_REGISTRY['table-cell-appearance'].label,
    mode: 'modal',
    onDismiss: dismiss,
  });
  layer.element.classList.add('hwp-cell-appearance-dialog');
  const tabs = doc.createElement('div');
  tabs.className = 'hwp-cell-appearance-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '셀 테두리/배경');
  const panels = [doc.createElement('div'), doc.createElement('div')];
  const tabButtons = ['테두리', '배경'].map((name, i) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.dataset.role = i === 0 ? 'appearance-border-tab' : 'appearance-background-tab';
    button.setAttribute('role', 'tab');
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-label', name);
    panels[i].className = 'hwp-cell-appearance-panel';
    tabs.append(button);
    button.addEventListener('click', () => {
      if (!disposed && !composing) selectTab(i);
    });
    button.addEventListener('keydown', (event) => {
      if (event.isComposing || composing) return;
      const next =
        event.key === 'ArrowRight' || event.key === 'ArrowLeft'
          ? 1 - i
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 1
              : null;
      if (next === null) return;
      event.preventDefault();
      selectTab(next);
      tabButtons[next].focus();
    });
    return button;
  });
  function selectTab(index: number) {
    tabButtons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }
  const controls: (HTMLInputElement | HTMLSelectElement)[] = [];
  function field(parent: HTMLElement, text: string, input: HTMLInputElement | HTMLSelectElement) {
    const label = doc.createElement('label'),
      caption = doc.createElement('span');
    label.className = 'hwp-cell-appearance-field';
    caption.textContent = text;
    input.setAttribute('aria-label', text);
    label.append(caption, input);
    parent.append(label);
    controls.push(input);
    return input;
  }
  function checkbox(parent: HTMLElement, role: string, text: string) {
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.checked = false;
    input.dataset.role = role;
    field(parent, text, input);
    return input;
  }
  function select(
    parent: HTMLElement,
    role: string,
    text: string,
    choices: readonly (readonly [string, string])[],
  ) {
    const input = doc.createElement('select');
    input.dataset.role = role;
    for (const [value, text] of choices) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = text;
      input.append(option);
    }
    input.value = choices[0][0];
    field(parent, text, input);
    return input;
  }
  function group(parent: HTMLElement, title: string) {
    const fieldset = doc.createElement('fieldset'),
      legend = doc.createElement('legend');
    legend.textContent = title;
    fieldset.append(legend);
    parent.append(fieldset);
    return fieldset;
  }
  const current = doc.createElement('p');
  current.textContent = '현재 테두리·배경 값은 확인되지 않았습니다. 바꿀 항목을 직접 선택하세요.';
  current.className = 'hwp-cell-appearance-note';
  current.dataset.role = 'appearance-current';
  const borderFields = group(panels[0], '테두리');
  const borderEnabled = checkbox(borderFields, 'appearance-border-enabled', '테두리 변경');
  const style = select(borderFields, 'appearance-border-style', '종류', [
    ['', '직접 선택하세요'],
    ...CELL_BORDER_STYLES.map(
      (value: string) =>
        [
          value,
          ({ NONE: '없음', SOLID: '실선', DOUBLE_SLIM: '가는 두 줄' } as Record<string, string>)[
            value
          ],
        ] as const,
    ),
  ]);
  const width = select(borderFields, 'appearance-border-width', '굵기 (mm)', [
    ['', '직접 선택하세요'],
    ...CELL_BORDER_WIDTHS.map(
      (value: number) => [String(value), (value / 100).toFixed(2)] as const,
    ),
  ]);
  function colors(parent: HTMLElement, prefix: string, label: string) {
    const row = doc.createElement('div');
    row.className = 'hwp-cell-appearance-colors';
    const picker = doc.createElement('input'),
      hex = doc.createElement('input');
    picker.type = 'color';
    picker.value = '#000000';
    picker.dataset.role = prefix + '-color';
    hex.type = 'text';
    hex.value = '';
    hex.placeholder = '#RRGGBB';
    hex.maxLength = 7;
    hex.dataset.role = prefix + '-hex';
    field(row, label + ' 선택', picker);
    field(row, label + ' RGB 값', hex);
    parent.append(row);
    return { picker, hex };
  }
  const borderColor = colors(borderFields, 'appearance-border', '색');
  const target = group(panels[0], '적용 위치');
  const mode = select(target, 'appearance-mode', '적용 대상', [
    ['cell', '현재 셀'],
    ['range', '행·열 범위'],
    ['table', '표 전체'],
  ]);
  const region = select(target, 'appearance-region', '테두리 위치', [
    ['outer', '바깥쪽'],
    ['inner', '안쪽'],
    ['all', '전체'],
  ]);
  const range = doc.createElement('div');
  range.className = 'hwp-cell-appearance-range';
  const rangeFields = {} as Record<
    'startRow' | 'endRow' | 'startColumn' | 'endColumn',
    HTMLInputElement
  >;
  for (const [key, label] of [
    ['startRow', '시작 줄'],
    ['endRow', '끝 줄'],
    ['startColumn', '시작 칸'],
    ['endColumn', '끝 칸'],
  ] as const) {
    const input = doc.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.dataset.role = 'appearance-' + key;
    input.value = String((key.endsWith('Row') ? capture.cell!.row : capture.cell!.column) + 1);
    rangeFields[key] = input;
    field(range, label, input);
  }
  target.append(range);
  const rangeNote = doc.createElement('p');
  rangeNote.className = 'hwp-cell-appearance-note';
  rangeNote.textContent = '줄·칸 번호는 1부터 입력합니다. 범위는 번호로 지정합니다.';
  target.append(rangeNote);
  const sides = group(target, '현재 셀의 변');
  const checks = [
    ['left', '왼쪽', 1],
    ['right', '오른쪽', 2],
    ['top', '위쪽', 4],
    ['bottom', '아래쪽', 8],
  ].map(([key, text, bit]) => {
    const input = checkbox(sides, 'appearance-' + key, String(text));
    input.checked = true;
    return { input, bit: Number(bit) };
  });
  const fillFields = group(panels[1], '채우기');
  const backgroundEnabled = checkbox(
    fillFields,
    'appearance-background-enabled',
    '현재 셀의 단색 배경 변경',
  );
  const backgroundColor = colors(fillFields, 'appearance-background', '면 색');
  const fillNote = doc.createElement('p');
  fillNote.className = 'hwp-cell-appearance-note';
  fillNote.textContent =
    '배경은 현재 셀의 단색만 바꿀 수 있습니다. 무늬·그림·대각선은 지원하지 않습니다.';
  fillFields.append(fillNote);
  const status = doc.createElement('p');
  status.dataset.role = 'appearance-status';
  status.setAttribute('role', 'status');
  const confirm = doc.createElement('button'),
    cancel = doc.createElement('button'),
    apply = doc.createElement('button');
  for (const [button, name, text] of [
    [confirm, 'confirm', '확인'],
    [cancel, 'cancel', '취소'],
    [apply, 'apply', '적용'],
  ] as const) {
    button.type = 'button';
    button.textContent = text;
    button.dataset.role = 'appearance-' + name;
    layer.footer.append(button);
  }
  const draft = (): TableCellAppearanceDraft => ({
    border: borderEnabled.checked
      ? {
          mode: mode.value as 'cell' | 'range' | 'table',
          region: region.value as 'outer' | 'inner' | 'all',
          startRow: rangeFields.startRow.value,
          endRow: rangeFields.endRow.value,
          startColumn: rangeFields.startColumn.value,
          endColumn: rangeFields.endColumn.value,
          edges: checks.reduce((v, c) => v | (c.input.checked ? c.bit : 0), 0),
          style: style.value,
          width: width.value,
          color: borderColor.hex.value,
          dirty: { ...dirty },
        }
      : null,
    background: backgroundEnabled.checked
      ? { color: backgroundColor.hex.value, dirty: true }
      : null,
  });
  function refresh() {
    const reason =
      stale ?? (capture.writeReason ? tableCellAppearanceReason(capture.writeReason) : null);
    let invalid = '';
    const changed = borderEnabled.checked || backgroundEnabled.checked;
    if (changed) {
      try {
        tableCellAppearanceValues(draft(), capture);
      } catch (error) {
        invalid = tableCellAppearanceReason(
          error instanceof Error ? error.message : 'InvalidCellAppearance',
        );
      }
    }
    const locked = disposed || busy || !!reason;
    for (const control of controls) control.disabled = locked;
    range.hidden = mode.value !== 'range';
    rangeNote.hidden = mode.value !== 'range';
    sides.hidden = mode.value !== 'cell';
    if (mode.value === 'cell') region.value = 'outer';
    region.disabled = locked || mode.value === 'cell';
    for (const input of Object.values(rangeFields))
      input.disabled = locked || mode.value !== 'range';
    for (const { input } of checks) input.disabled = locked || mode.value !== 'cell';
    // Do not silently apply bulk background to just one of the requested cells.
    backgroundColor.picker.disabled = backgroundColor.hex.disabled =
      locked || mode.value !== 'cell';
    backgroundEnabled.disabled = locked || (mode.value !== 'cell' && !backgroundEnabled.checked);
    confirm.disabled = disposed || busy || composing || !!reason || !!invalid;
    apply.disabled = confirm.disabled || !changed;
    status.textContent =
      reason ?? (invalid || reported || (!changed ? '바꿀 항목을 선택하세요.' : ''));
    cancel.textContent = busy ? '닫기 (접수된 작업은 계속)' : '취소';
  }
  for (const [name, input] of [
    ['style', style],
    ['width', width],
  ] as const)
    input.addEventListener('change', () => {
      if (disposed || input.disabled) return;
      dirty[name] = true;
      borderEnabled.checked = true;
      refresh();
    });
  for (const [color, onChange] of [
    [
      borderColor,
      () => {
        dirty.color = true;
        borderEnabled.checked = true;
      },
    ],
    [
      backgroundColor,
      () => {
        backgroundEnabled.checked = true;
      },
    ],
  ] as const) {
    for (const type of ['input', 'change']) {
      color.picker.addEventListener(type, () => {
        if (disposed || color.picker.disabled) return;
        color.hex.value = color.picker.value;
        onChange();
        refresh();
      });
      color.hex.addEventListener(type, () => {
        if (disposed || color.hex.disabled) return;
        if (parseCharacterColor(color.hex.value) !== null) color.picker.value = color.hex.value;
        onChange();
        refresh();
      });
    }
  }
  for (const input of [
    borderEnabled,
    backgroundEnabled,
    mode,
    region,
    ...Object.values(rangeFields),
    ...checks.map((c) => c.input),
  ])
    for (const type of ['input', 'change'])
      input.addEventListener(type, () => {
        if (!disposed && !input.disabled) refresh();
      });
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    refresh();
  });
  confirm.addEventListener('click', (event) => {
    if (disposed || confirm.disabled || (event as any).isComposing) return;
    if (!borderEnabled.checked && !backgroundEnabled.checked) dismiss();
    else callbacks.apply(draft(), false);
  });
  apply.addEventListener('click', (event) => {
    if (!disposed && !apply.disabled && !(event as any).isComposing) callbacks.apply(draft(), true);
  });
  cancel.addEventListener('click', dismiss);
  layer.body.append(tabs, current, ...panels, status);
  selectTab(0);
  refresh();
  layer.show(tabButtons[0]);
  return {
    focus() {
      if (!disposed) tabButtons[0].focus();
    },
    setBusy(value: boolean) {
      busy = value;
      if (value) reported = null;
      refresh();
    },
    setStale(value: string) {
      stale = value;
      refresh();
    },
    setStatus(value: string) {
      reported = value;
      refresh();
    },
    reset(value: TableCellAppearanceCapture) {
      capture = value;
      stale = null;
      reported = null;
      borderEnabled.checked = backgroundEnabled.checked = false;
      dirty = { style: false, width: false, color: false };
      style.value = width.value = borderColor.hex.value = backgroundColor.hex.value = '';
      refresh();
    },
    destroy() {
      disposed = true;
      layer.destroy();
    },
  };
}
export type TableCellAppearanceView = ReturnType<typeof createTableCellAppearanceView>;
