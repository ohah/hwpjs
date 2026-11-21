import './table-cell-properties.css';
import { createDialogLayer } from './dialog-layer.ts';
import { createCellSizeUnitDraft, type CellSizeUnit } from './table-cell-size-units.ts';
import { tableCellDimensions } from './table-cell-properties-port.ts';
import type { CreatedCellPropertiesPatch } from './created-cell-properties-port.ts';
export function createCreatedCellPropertiesView(
  root: HTMLElement,
  expected: { width: number; height: number },
  callbacks: {
    apply(patch: CreatedCellPropertiesPatch): void;
    dismiss(): void;
  },
  writeReason: string | null,
  alignment?: { value: 0 | 1 | 2 | null; writable: boolean },
) {
  const layer = createDialogLayer(root, {
    role: 'created-cell-properties-dialog',
    title: '표/셀 속성',
    mode: 'modal',
    onDismiss: callbacks.dismiss,
  });
  const doc = root.ownerDocument,
    sizes = createCellSizeUnitDraft(expected);
  const fields: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  const add = (name: string, label: string, choices?: readonly string[]) => {
    const row = doc.createElement('label'),
      text = doc.createElement('span');
    text.textContent = label;
    const input = choices ? doc.createElement('select') : doc.createElement('input');
    if (choices)
      for (const value of choices) {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = value || '변경하지 않음';
        input.append(option);
      }
    input.dataset.role = `created-cell-${name}`;
    input.setAttribute('aria-label', label);
    row.append(text, input);
    layer.body.append(row);
    fields[name] = input;
    return input;
  };
  const unit = add('unit', '단위', ['mm', 'pt']);
  unit.value = 'mm';
  const width = add('width', '셀 너비'),
    height = add('height', '셀 높이');
  width.value = sizes.read().width;
  height.value = sizes.read().height;
  const vertical = add('vertical-alignment', '세로 정렬', ['', '0', '1', '2']);
  const labels = ['확인할 수 없음', '위쪽', '가운데', '아래쪽'];
  Array.from(vertical.children).forEach((option, index) => {
    option.textContent = labels[index];
    if (index === 0) (option as HTMLOptionElement).disabled = true;
  });
  vertical.value = alignment?.value == null ? '' : String(alignment.value);
  const alignmentAvailable = alignment?.value != null && alignment.writable;
  const fillMode = add('fill-mode', '채우기', ['', 'none', 'solid']);
  for (const option of Array.from(fillMode.children)) {
    if ((option as HTMLOptionElement).value === 'none') option.textContent = '채우기 없음';
    if ((option as HTMLOptionElement).value === 'solid') option.textContent = '단색';
  }
  const fill = add('fill', '배경색 RGB (변경할 때만 6자리 입력)');
  const style = add('border-style', '바깥 테두리 종류', ['', 'NONE', 'SOLID', 'DOUBLE_SLIM']);
  const borderWidth = add('border-width', '바깥 테두리 굵기 (0.01mm)', [
    '',
    '10',
    '12',
    '15',
    '20',
    '25',
    '30',
    '40',
    '50',
    '60',
    '70',
    '100',
    '150',
    '200',
    '300',
    '400',
    '500',
  ]);
  const borderColor = add('border-color', '바깥 테두리 RGB (변경할 때만 6자리 입력)');
  const note = doc.createElement('p');
  note.textContent =
    '변경은 실행 취소 한 단계로 기록됩니다. HWP 저장 시 조판 갱신 안내를 확인하세요.';
  layer.body.append(note);
  const status = doc.createElement('p'),
    apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  apply.type = cancel.type = 'button';
  apply.textContent = '확인';
  cancel.textContent = '닫기';
  apply.dataset.role = 'created-cell-apply';
  cancel.dataset.role = 'created-cell-cancel';
  layer.body.append(status);
  layer.footer.append(apply, cancel);
  let busy = false,
    stale = false,
    disposed = false,
    composing = false;
  const rgb = (value: string) => {
    if (!/^[\da-fA-F]{6}$/.test(value)) throw Error('색상은 RGB 6자리로 입력하세요.');
    return Number.parseInt(value, 16);
  };
  const patch = () => {
    const dimensions = tableCellDimensions({ ...sizes.points(), mode: 'cell' }, expected),
      dirty = sizes.points().dirty;
    const size = {
      ...(dirty.width ? { width: dimensions.width } : {}),
      ...(dirty.height ? { height: dimensions.height } : {}),
    };
    const stroke = {
      ...(style.value ? { style: style.value } : {}),
      ...(borderWidth.value ? { width: Number(borderWidth.value) } : {}),
      ...(borderColor.value ? { color: rgb(borderColor.value) } : {}),
    };
    const appearance = {
      ...(fillMode.value === 'none'
        ? { fill: { kind: 'none' } }
        : fillMode.value === 'solid'
          ? { fill: { kind: 'solid', color: rgb(fill.value) } }
          : {}),
      ...(Object.keys(stroke).length
        ? {
            borders: Object.fromEntries(
              ['left', 'right', 'top', 'bottom'].map((edge) => [edge, stroke]),
            ),
          }
        : {}),
    };
    let verticalAlignment: 0 | 1 | 2 | undefined;
    if (alignmentAvailable) {
      if (!['0', '1', '2'].includes(vertical.value))
        throw Error('지원하지 않는 세로 정렬 값입니다.');
      const current = Number(vertical.value) as 0 | 1 | 2;
      if (current !== alignment.value) verticalAlignment = current;
    }
    if (
      !Object.keys(size).length &&
      !Object.keys(appearance).length &&
      verticalAlignment === undefined
    )
      throw Error('변경한 값이 없습니다.');
    return {
      ...(Object.keys(size).length ? { size } : {}),
      ...(verticalAlignment === undefined ? {} : { verticalAlignment }),
      ...(Object.keys(appearance).length ? { appearance } : {}),
    };
  };
  function refresh() {
    let error = writeReason;
    try {
      patch();
    } catch (cause) {
      error ||= cause instanceof Error ? cause.message : String(cause);
    }
    const blocked = disposed || busy || stale || !!writeReason;
    for (const input of Object.values(fields)) input.disabled = blocked;
    fill.disabled = blocked || fillMode.value === 'none';
    vertical.disabled = blocked || !alignmentAvailable;
    apply.disabled = blocked || composing || !!error;
    status.textContent = stale ? '선택이나 문서가 바뀌었습니다. 창을 다시 여세요.' : (error ?? '');
  }
  for (const [axis, input] of [
    ['width', width],
    ['height', height],
  ] as const)
    input.addEventListener('input', () => {
      if (!busy && !stale && !writeReason) sizes.edit(axis, input.value);
      refresh();
    });
  fill.addEventListener('input', () => {
    if (!busy && !stale && !writeReason && fillMode.value !== 'none' && fill.value)
      fillMode.value = 'solid';
  });
  for (const input of [vertical, fillMode, fill, style, borderWidth, borderColor]) {
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
  }
  unit.addEventListener('change', () => {
    if (!busy && !stale && !writeReason && sizes.changeUnit(unit.value as CellSizeUnit)) {
      width.value = sizes.read().width;
      height.value = sizes.read().height;
    } else unit.value = sizes.read().unit;
    refresh();
  });
  layer.element.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  layer.element.addEventListener('compositionend', () => {
    composing = false;
    refresh();
  });
  apply.addEventListener('click', (event) => {
    if (!apply.disabled && !(event as any).isComposing) callbacks.apply(patch());
  });
  cancel.addEventListener('click', callbacks.dismiss);
  refresh();
  layer.show(width);
  return {
    element: layer.element,
    focus: () => width.focus(),
    setBusy(value: boolean) {
      busy = value;
      refresh();
    },
    setStale() {
      stale = true;
      refresh();
    },
    setStatus(value: string) {
      status.textContent = value;
    },
    destroy() {
      disposed = true;
      layer.destroy();
    },
  };
}
