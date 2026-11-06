import { DEMO_COMMAND_REGISTRY } from './command-support.ts';
import { createDialogLayer } from './dialog-layer.ts';
import {
  tableCellAppearanceReason,
  tableCellAppearanceValues,
  type TableCellAppearanceCapture,
} from './table-cell-appearance-port.ts';
import type {
  TableCellAppearanceDraft,
  TableCellFillKind,
  TableCellHatchStyle,
} from './table-cell-fill-draft.ts';
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
  current.textContent = '현재 값은 미확인입니다. 바꿀 항목을 선택하세요.';
  current.className = 'hwp-cell-appearance-note';
  current.dataset.role = 'appearance-current';
  const borderFields = group(panels[0], '테두리');
  borderFields.className = 'hwp-cell-appearance-border-fields';
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
    const heading = doc.createElement('span');
    heading.textContent = label;
    row.append(heading);
    field(row, label + ' 선택', picker);
    field(row, label + ' RGB 값', hex);
    parent.append(row);
    return { picker, hex };
  }
  const borderColor = colors(borderFields, 'appearance-border', '색');
  const target = doc.createElement('div');
  target.className = 'hwp-cell-appearance-target';
  target.dataset.role = 'appearance-target';
  const mode = select(target, 'appearance-mode', '적용 대상', [
    ['cell', '현재 셀'],
    ['range', '행·열 범위'],
    ['table', '표 전체'],
  ]);
  const region = select(borderFields, 'appearance-region', '테두리 위치', [
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
  const sides = group(panels[0], '현재 셀의 변');
  sides.className = 'hwp-cell-appearance-sides';
  sides.dataset.role = 'appearance-sides';
  const preview = doc.createElement('div');
  preview.className = 'hwp-cell-appearance-edge-preview';
  preview.dataset.role = 'appearance-edge-preview';
  preview.setAttribute('role', 'img');
  const previewHorizontal = doc.createElement('span'),
    previewVertical = doc.createElement('span');
  previewHorizontal.className = 'hwp-cell-appearance-preview-horizontal';
  previewVertical.className = 'hwp-cell-appearance-preview-vertical';
  preview.append(previewHorizontal, previewVertical);
  sides.append(preview);
  const sideChoices = doc.createElement('div');
  sideChoices.className = 'hwp-cell-appearance-edge-choices';
  sideChoices.dataset.role = 'appearance-edge-choices';
  sides.append(sideChoices);
  const checks = [
    ['left', '왼쪽', 1],
    ['right', '오른쪽', 2],
    ['top', '위쪽', 4],
    ['bottom', '아래쪽', 8],
  ].map(([key, text, bit]) => {
    const input = checkbox(sideChoices, 'appearance-' + key, String(text));
    input.checked = true;
    return { input, bit: Number(bit) };
  });
  const styleBatchAvailable = () =>
    (capture.state.capabilities as { cellStyleBatchAvailable?: boolean })
      ?.cellStyleBatchAvailable === true;
  const fillFields = group(panels[1], '채우기');
  const backgroundEnabled = checkbox(fillFields, 'appearance-background-enabled', '배경 변경');
  const fillKind = select(fillFields, 'appearance-fill-kind', '채우기', [
    ['solid', '색'],
    ['none', '색 채우기 없음'],
    ['hatch', '무늬'],
    ['linear', '선형 그라데이션'],
  ]);
  const backgroundColor = colors(fillFields, 'appearance-background', '면 색');
  const hatchFields = doc.createElement('div');
  hatchFields.className = 'hwp-cell-appearance-fill-options';
  const hatchColor = colors(hatchFields, 'appearance-hatch', '무늬 색');
  const hatchStyle = select(hatchFields, 'appearance-hatch-style', '무늬 모양', [
    ['', '직접 선택하세요'],
    ['HORIZONTAL', '수평선'],
    ['VERTICAL', '수직선'],
    ['BACK_SLASH', '상향 대각선'],
    ['SLASH', '하향 대각선'],
    ['CROSS', '눈금 무늬'],
    ['CROSS_DIAGONAL', '체크 무늬'],
  ]);
  const linearFields = doc.createElement('div');
  linearFields.className = 'hwp-cell-appearance-fill-options';
  const endColor = colors(linearFields, 'appearance-end', '끝 색');
  const linearNumbers = doc.createElement('div');
  linearNumbers.className = 'hwp-cell-appearance-linear-numbers';
  const linearInputs = {} as Record<
    'angle' | 'centerX' | 'centerY' | 'step' | 'stepCenter',
    HTMLInputElement
  >;
  for (const [key, text, max] of [
    ['angle', '기울임 (°)', 359],
    ['centerX', '가로 중심 (%)', 100],
    ['centerY', '세로 중심 (%)', 100],
    ['step', '번짐 (%)', 100],
    ['stepCenter', '번짐 중심 (%)', 100],
  ] as const) {
    const input = doc.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(max);
    input.step = '1';
    input.value = '';
    input.placeholder = '직접 입력';
    input.dataset.role = 'appearance-' + key;
    linearInputs[key] = input;
    field(linearNumbers, text, input);
  }
  linearFields.append(linearNumbers);
  fillFields.append(hatchFields, linearFields);
  const fillNote = doc.createElement('p');
  fillNote.className = 'hwp-cell-appearance-note';
  fillNote.dataset.role = 'appearance-fill-note';
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
  const targetDraft = () => ({
    mode: mode.value as 'cell' | 'range' | 'table',
    region: region.value as 'outer' | 'inner' | 'all',
    startRow: rangeFields.startRow.value,
    endRow: rangeFields.endRow.value,
    startColumn: rangeFields.startColumn.value,
    endColumn: rangeFields.endColumn.value,
  });
  const draft = (): TableCellAppearanceDraft => ({
    ...(styleBatchAvailable() ? { target: targetDraft() } : {}),
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
      ? {
          color: backgroundColor.hex.value,
          dirty: true,
          ...(styleBatchAvailable()
            ? {
                kind: fillKind.value as TableCellFillKind,
                ...(fillKind.value === 'hatch'
                  ? {
                      hatchColor: hatchColor.hex.value,
                      hatchStyle: hatchStyle.value as TableCellHatchStyle,
                    }
                  : {}),
                ...(fillKind.value === 'linear'
                  ? {
                      endColor: endColor.hex.value,
                      ...Object.fromEntries(
                        Object.entries(linearInputs).map(([key, input]) => [key, input.value]),
                      ),
                    }
                  : {}),
              }
            : {}),
        }
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
    sideChoices.hidden = mode.value !== 'cell';
    sides.children[0].textContent = mode.value === 'cell' ? '현재 셀의 변' : '적용 미리보기';
    if (region.parentElement) region.parentElement.hidden = mode.value === 'cell';
    if (mode.value === 'cell') region.value = 'outer';
    region.disabled = locked || mode.value === 'cell';
    for (const input of Object.values(rangeFields))
      input.disabled = locked || mode.value !== 'range';
    for (const { input } of checks) input.disabled = locked || mode.value !== 'cell';
    const selectedEdges = checks.filter(({ input }) => input.checked);
    preview.dataset.edges = String(checks.reduce((v, c) => v | (c.input.checked ? c.bit : 0), 0));
    preview.dataset.region = mode.value === 'cell' ? 'cell' : region.value;
    preview.setAttribute(
      'aria-label',
      '테두리 적용 미리보기: ' +
        (mode.value !== 'cell'
          ? ({ outer: '바깥쪽', inner: '안쪽', all: '전체' } as Record<string, string>)[
              region.value
            ]
          : selectedEdges.length
            ? selectedEdges.map(({ input }) => input.getAttribute('aria-label')).join(', ')
            : '선택한 변 없음'),
    );
    for (const [side, bit] of [
      ['left', 1],
      ['right', 2],
      ['top', 4],
      ['bottom', 8],
    ] as const)
      preview.dataset[side] = String(
        mode.value === 'cell'
          ? (Number(preview.dataset.edges) & bit) !== 0
          : region.value !== 'inner',
      );
    const advanced = styleBatchAvailable();
    fillKind.parentElement!.hidden = !advanced;
    hatchFields.hidden = !advanced || fillKind.value !== 'hatch';
    linearFields.hidden = !advanced || fillKind.value !== 'linear';
    backgroundColor.picker.parentElement!.parentElement!.hidden =
      advanced && fillKind.value === 'none';
    fillKind.disabled = locked || !advanced;
    for (const input of [hatchColor.picker, hatchColor.hex, hatchStyle])
      input.disabled = locked || !advanced || fillKind.value !== 'hatch';
    for (const input of [endColor.picker, endColor.hex, ...Object.values(linearInputs)])
      input.disabled = locked || !advanced || fillKind.value !== 'linear';
    fillNote.textContent = advanced
      ? '그림·대각선은 지원하지 않습니다. 그라데이션은 제품의 추가 기능입니다.'
      : '배경은 현재 셀의 단색만 바꿀 수 있습니다. 무늬·그림·대각선은 지원하지 않습니다.';
    // Do not silently apply bulk background to just one of the requested cells.
    backgroundColor.picker.disabled = backgroundColor.hex.disabled =
      locked || (!advanced && mode.value !== 'cell') || (advanced && fillKind.value === 'none');
    backgroundEnabled.disabled =
      locked || (!advanced && mode.value !== 'cell' && !backgroundEnabled.checked);
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
      hatchColor,
      () => {
        backgroundEnabled.checked = true;
      },
    ],
    [
      endColor,
      () => {
        backgroundEnabled.checked = true;
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
  for (const input of [fillKind, hatchStyle, ...Object.values(linearInputs)])
    for (const type of ['input', 'change'])
      input.addEventListener(type, () => {
        if (disposed || input.disabled) return;
        backgroundEnabled.checked = true;
        refresh();
      });
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
  function observeCurrent() {
    const observed = (
      capture as TableCellAppearanceCapture & {
        observed?: {
          edges?: Record<
            string,
            { state?: string; style?: string; width?: number; color?: string }
          >;
          fill?: {
            state?: string;
            kind?: string;
            color?: string;
            background?: string;
            pattern?: string;
            angle?: number;
            centerX?: number;
            centerY?: number;
            step?: number;
            stepCenter?: number;
            colors?: readonly string[];
          };
        };
      }
    ).observed;
    if (!observed) {
      current.textContent = '현재 값은 미확인입니다. 바꿀 항목을 선택하세요.';
      return;
    }
    const edgeNames = { left: '왼쪽', right: '오른쪽', top: '위쪽', bottom: '아래쪽' };
    const edges = Object.entries(edgeNames).map(([key, label]) => {
      const edge = observed.edges?.[key];
      return (
        label +
        ': ' +
        (edge?.state === 'none'
          ? '없음'
          : edge?.state === 'known'
            ? [
                edge.style,
                typeof edge.width === 'number' ? (edge.width / 100).toFixed(2) + 'mm' : '',
                edge.color,
              ]
                .filter(Boolean)
                .join(' ')
            : '미확인')
      );
    });
    // Only verified, uniform values become form seeds. Observation never creates edit intent.
    const observedEdges = ['left', 'right', 'top', 'bottom'].map((key) => observed.edges?.[key]);
    for (const [key, input] of [
      ['style', style],
      ['width', width],
      ['color', borderColor.hex],
    ] as const) {
      const value = observedEdges[0]?.[key];
      if (
        value !== undefined &&
        observedEdges.every(
          (edge) => (edge?.state === 'known' || edge?.state === 'none') && edge[key] === value,
        )
      ) {
        if (key === 'style' && CELL_BORDER_STYLES.includes(value)) input.value = String(value);
        if (key === 'width' && CELL_BORDER_WIDTHS.includes(value)) input.value = String(value);
        if (key === 'color' && typeof value === 'string' && parseCharacterColor(value) !== null) {
          input.value = value;
          borderColor.picker.value = value;
        }
      }
    }
    const fill = observed.fill;
    if (fill?.state === 'known' || fill?.state === 'none') {
      const seedColor = (field: ReturnType<typeof colors>, value: unknown) => {
        if (typeof value === 'string' && parseCharacterColor(value) !== null) {
          field.hex.value = field.picker.value = value;
        }
      };
      if (fill.state === 'none' && styleBatchAvailable()) fillKind.value = 'none';
      if (fill.kind === 'solid') {
        fillKind.value = 'solid';
        seedColor(backgroundColor, fill.color);
      }
      if (styleBatchAvailable() && fill.kind === 'hatch') {
        fillKind.value = 'hatch';
        seedColor(backgroundColor, fill.background);
        seedColor(hatchColor, fill.color);
        if (
          ['HORIZONTAL', 'VERTICAL', 'BACK_SLASH', 'SLASH', 'CROSS', 'CROSS_DIAGONAL'].includes(
            fill.pattern ?? '',
          )
        )
          hatchStyle.value = fill.pattern!;
      }
      if (styleBatchAvailable() && fill.kind === 'linear') {
        fillKind.value = 'linear';
        // Seed exact source colours, never derived rendering stops or a truncated multicolour fill.
        if (fill.colors?.length === 2) {
          seedColor(backgroundColor, fill.colors[0]);
          seedColor(endColor, fill.colors[1]);
        }
        for (const [key, input] of Object.entries(linearInputs)) {
          const value = fill[key as keyof typeof linearInputs];
          if (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= (key === 'angle' ? 359 : 100)
          )
            input.value = String(value);
        }
      }
    }
    const fillText =
      fill?.state === 'none'
        ? '없음'
        : fill?.state === 'known'
          ? (({ solid: '단색', hatch: '무늬', linear: '그라데이션' } as Record<string, string>)[
              fill.kind ?? ''
            ] ?? '미지원')
          : '미확인';
    current.textContent =
      '현재 배경: ' +
      fillText +
      (fill?.state === 'known' && fill.color ? ' ' + fill.color : '') +
      '. ' +
      edges.join(' · ');
  }
  observeCurrent();
  layer.body.append(tabs, current, target, ...panels, status);
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
      hatchColor.hex.value = endColor.hex.value = hatchStyle.value = '';
      fillKind.value = 'solid';
      for (const input of Object.values(linearInputs)) input.value = '';
      mode.value = 'cell';
      region.value = 'outer';
      for (const [key, input] of Object.entries(rangeFields))
        input.value = String((key.endsWith('Row') ? capture.cell!.row : capture.cell!.column) + 1);
      for (const { input } of checks) input.checked = true;
      observeCurrent();
      refresh();
    },
    destroy() {
      disposed = true;
      layer.destroy();
    },
  };
}
export type TableCellAppearanceView = ReturnType<typeof createTableCellAppearanceView>;
