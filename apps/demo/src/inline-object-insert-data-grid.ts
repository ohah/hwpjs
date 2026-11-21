import type {
  ChartCreateProfile,
  ChartStockRole,
} from '../../../packages/core/src/commands/inline-object-insert.ts';
import { checkedChartInputNumber } from './inline-object-insert-number.ts';
interface GridSeries {
  name: string;
  values: number[];
  x_values?: number[];
  bubble_sizes?: number[];
  stock_role?: ChartStockRole;
}
interface GridData {
  categories: string[];
  series: GridSeries[];
}
interface Grid {
  collect(): GridData;
  setDisabled(next: boolean): void;
  focus(): void;
}
/** Drafts are keyed by actual profile; changing kind never casts old cells to X/size. */
export function createInlineObjectInsertDataGrid(
  host: HTMLElement,
  onEdit: () => void,
  { strictPieInput = false }: { strictPieInput?: boolean } = {},
) {
  const drafts = new Map<string, { host: HTMLElement; grid: Grid }>();
  let active: Grid,
    disabled = false;
  function setProfile(profile?: ChartCreateProfile) {
    const key = JSON.stringify(profile ?? null);
    let draft = drafts.get(key);
    if (!draft) {
      const container = host.ownerDocument.createElement('div');
      host.append(container);
      draft = {
        host: container,
        grid: profile
          ? createTypedGrid(container, onEdit, profile, strictPieInput)
          : createLegacyGrid(container, onEdit),
      };
      drafts.set(key, draft);
    }
    for (const [id, value] of drafts) value.host.hidden = id !== key;
    active = draft.grid;
    active.setDisabled(disabled);
  }
  setProfile();
  return {
    setProfile,
    collect: (): GridData => active.collect(),
    setDisabled(next: boolean) {
      disabled = next;
      for (const draft of drafts.values()) draft.grid.setDisabled(next);
    },
    focus() {
      active.focus();
    },
  };
}
/** 삽입 전까지 입력 노드만 보유하는 임시 표. 문서·저장 모델을 만들지 않는다. */
function createLegacyGrid(host: HTMLElement, onEdit: () => void) {
  const doc = host.ownerDocument;
  const scroller = doc.createElement('div');
  scroller.className = 'inline-object-insert-grid-scroll';
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', '차트 데이터 표 가로 스크롤');
  const table = doc.createElement('table'),
    caption = doc.createElement('caption');
  caption.textContent = '범주는 행으로, 계열은 열로 입력하세요.';
  const head = doc.createElement('thead'),
    header = doc.createElement('tr'),
    body = doc.createElement('tbody');
  const categoryHead = doc.createElement('th');
  categoryHead.scope = 'col';
  categoryHead.textContent = '범주';
  const actionHead = doc.createElement('th');
  actionHead.scope = 'col';
  actionHead.textContent = '행 관리';
  header.append(categoryHead, actionHead);
  head.append(header);
  table.append(caption, head, body);
  const controls = doc.createElement('div');
  controls.className = 'inline-object-insert-grid-actions';
  const note = doc.createElement('small');
  note.textContent = '범주 최대 4,096개 · 계열 최대 64개 · 전체 값 최대 16,384개';
  scroller.append(table);
  host.append(scroller, controls, note);
  type Column = { cell: HTMLTableCellElement; name: HTMLInputElement; remove: HTMLButtonElement };
  type Row = {
    element: HTMLTableRowElement;
    category: HTMLInputElement;
    action: HTMLTableCellElement;
    remove: HTMLButtonElement;
    values: Map<number, HTMLInputElement>;
  };
  const columns = new Map<number, Column>(),
    rows = new Map<number, Row>();
  let nextColumn = 0,
    nextRow = 0,
    disabled = false;
  function button(text: string, action: () => void) {
    const node = doc.createElement('button');
    node.type = 'button';
    node.textContent = text;
    node.addEventListener('click', () => {
      if (!disabled) action();
    });
    return node;
  }
  function input(label: string, value: string) {
    const node = doc.createElement('input');
    node.type = 'text';
    node.value = value;
    node.setAttribute('aria-label', label);
    node.addEventListener('input', () => {
      node.removeAttribute('aria-invalid');
      onEdit();
    });
    return node;
  }
  function refresh() {
    addRow.disabled = disabled || rows.size >= 4096 || (rows.size + 1) * columns.size > 16384;
    addSeries.disabled = disabled || columns.size >= 64 || rows.size * (columns.size + 1) > 16384;
    let r = 0;
    for (const row of rows.values()) {
      ++r;
      row.category.setAttribute('aria-label', `범주 ${r}`);
      row.category.disabled = disabled;
      row.remove.disabled = disabled || rows.size <= 1;
      row.remove.setAttribute('aria-label', `범주 ${r} 삭제`);
      let c = 0;
      for (const [id] of columns) {
        const node = row.values.get(id)!;
        node.disabled = disabled;
        node.setAttribute('aria-label', `범주 ${r}, 계열 ${++c} 값`);
      }
    }
    let c = 0;
    for (const column of columns.values()) {
      column.name.disabled = disabled;
      column.name.setAttribute('aria-label', `계열 ${++c} 이름`);
      column.remove.disabled = disabled || columns.size <= 1;
      column.remove.setAttribute('aria-label', `계열 ${c} 삭제`);
    }
  }
  function valueCell(row: Row, id: number, value: string) {
    const cell = doc.createElement('td'),
      node = input('값', value);
    node.inputMode = 'decimal';
    cell.append(node);
    row.element.insertBefore(cell, row.action);
    row.values.set(id, node);
  }
  function appendRow(values?: string[]) {
    if (disabled || rows.size >= 4096 || (rows.size + 1) * columns.size > 16384) return;
    const id = ++nextRow,
      element = doc.createElement('tr'),
      first = doc.createElement('th');
    first.scope = 'row';
    const category = input('범주', `항목 ${id}`),
      action = doc.createElement('td');
    const remove = button('행 삭제', () => {
      if (rows.size <= 1) return;
      const next = Array.from(rows.values()).find((row) => row.element !== element)!;
      element.remove();
      rows.delete(id);
      refresh();
      next.category.focus();
      onEdit();
    });
    first.append(category);
    action.append(remove);
    element.append(first, action);
    const row: Row = { element, category, action, remove, values: new Map() };
    rows.set(id, row);
    body.append(element);
    let index = 0;
    for (const columnId of columns.keys()) valueCell(row, columnId, values?.[index++] ?? '0');
    refresh();
    category.focus();
    onEdit();
  }
  function appendSeries() {
    if (disabled || columns.size >= 64 || rows.size * (columns.size + 1) > 16384) return;
    const id = ++nextColumn,
      cell = doc.createElement('th');
    cell.scope = 'col';
    const name = input('계열 이름', `계열 ${id}`);
    const remove = button('계열 삭제', () => {
      if (columns.size <= 1) return;
      cell.remove();
      columns.delete(id);
      for (const row of rows.values()) {
        row.values.get(id)!.parentElement!.remove();
        row.values.delete(id);
      }
      refresh();
      columns.values().next().value!.name.focus();
      onEdit();
    });
    cell.append(name, remove);
    header.insertBefore(cell, actionHead);
    columns.set(id, { cell, name, remove });
    for (const row of rows.values()) valueCell(row, id, '0');
    refresh();
    name.focus();
    onEdit();
  }
  const addRow = button('범주 행 추가', () => appendRow()),
    addSeries = button('계열 열 추가', appendSeries);
  controls.append(addRow, addSeries);
  appendSeries();
  for (const value of ['10', '20', '30']) appendRow([value]);
  function invalid(node: HTMLInputElement, message: string): never {
    node.setAttribute('aria-invalid', 'true');
    node.focus();
    throw Error(message);
  }
  return {
    collect() {
      // 각 노드를 한 번 읽고, 최종 DTO 한 건만 기존 SDK 검증기에 전달한다.
      const categories: string[] = [],
        series = new Map<number, { name: string; values: number[] }>();
      for (const [id, column] of columns) {
        const name = column.name.value.trim();
        if (!name) invalid(column.name, '계열 이름을 입력하세요.');
        series.set(id, { name, values: [] });
      }
      let r = 0;
      for (const row of rows.values()) {
        ++r;
        const category = row.category.value.trim();
        if (!category) invalid(row.category, `${r}번째 범주 이름을 입력하세요.`);
        categories.push(category);
        let c = 0;
        for (const [id, node] of row.values) {
          ++c;
          const raw = node.value.trim(),
            value = Number(raw);
          if (
            !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ||
            !Number.isFinite(value)
          )
            invalid(node, `${r}번째 범주의 ${c}번째 계열 값을 유한한 숫자로 입력하세요.`);
          series.get(id)!.values.push(value);
        }
      }
      return { categories, series: Array.from(series.values()) };
    },
    setDisabled(next: boolean) {
      disabled = next;
      refresh();
    },
    focus() {
      rows.values().next().value!.category.focus();
    },
  };
}

/** Explicit-profile grid; every new numeric cell is blank until authored. */
function createTypedGrid(
  host: HTMLElement,
  onEdit: () => void,
  profile: ChartCreateProfile,
  strictPieInput: boolean,
): Grid {
  const doc = host.ownerDocument;
  const kind = profile.kind;
  const xy = kind === 'scatterChart' || kind === 'bubbleChart',
    bubble = kind === 'bubbleChart';
  const stock = profile.kind === 'stockChart';
  const surface = kind === 'surfaceChart' || kind === 'surface3DChart';
  const single = kind === 'pieChart' || kind === 'pie3DChart' || kind === 'ofPieChart';
  const roles: readonly ChartStockRole[] = stock
    ? profile.stock_layout === 'openHighLowClose'
      ? ['open', 'high', 'low', 'close']
      : ['high', 'low', 'close']
    : [];
  const roleNames = { open: '시가', high: '고가', low: '저가', close: '종가' };
  type Values = {
    y: HTMLInputElement;
    x?: HTMLInputElement;
    size?: HTMLInputElement;
    cell: HTMLTableCellElement;
  };
  type Column = {
    name: HTMLInputElement;
    head: HTMLTableCellElement;
    remove: HTMLButtonElement;
    role?: ChartStockRole;
  };
  type Row = {
    element: HTMLTableRowElement;
    category?: HTMLInputElement;
    label: HTMLTableCellElement;
    action: HTMLTableCellElement;
    remove: HTMLButtonElement;
    values: Map<number, Values>;
  };
  const columns = new Map<number, Column>(),
    rows = new Map<number, Row>();
  let nextColumn = 0,
    nextRow = 0,
    disabled = false;
  const scroller = doc.createElement('div'),
    table = doc.createElement('table'),
    caption = doc.createElement('caption');
  scroller.className = 'inline-object-insert-grid-scroll';
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', '차트 데이터 표 가로 스크롤');
  caption.textContent = xy
    ? bubble
      ? '각 점의 X·Y·버블 크기를 직접 입력하세요.'
      : '각 점의 X·Y를 직접 입력하세요.'
    : stock
      ? '각 날짜의 역할별 주가를 입력하세요. 저가 ≤ 시가·종가 ≤ 고가입니다.'
      : surface
        ? '행은 범주, 열은 계열입니다. 최소 2×2의 값을 직접 입력하세요.'
        : '범주와 계열별 값을 직접 입력하세요.';
  const head = doc.createElement('thead'),
    header = doc.createElement('tr'),
    body = doc.createElement('tbody');
  const first = doc.createElement('th'),
    last = doc.createElement('th');
  first.textContent = xy ? '점' : stock ? '날짜' : '범주';
  first.scope = 'col';
  last.textContent = '행 관리';
  last.scope = 'col';
  header.append(first, last);
  head.append(header);
  table.append(caption, head, body);
  scroller.append(table);
  const controls = doc.createElement('div');
  controls.className = 'inline-object-insert-grid-actions';
  const note = doc.createElement('small');
  note.textContent = '숫자는 자동으로 채우지 않습니다. 빈 값·무한대·비숫자는 사용할 수 없습니다.';
  host.append(scroller, controls, note);
  function input(label: string, value = '') {
    const node = doc.createElement('input');
    node.type = 'text';
    node.value = value;
    node.setAttribute('aria-label', label);
    node.addEventListener('input', () => {
      node.removeAttribute('aria-invalid');
      onEdit();
    });
    return node;
  }
  function button(label: string, action: () => void) {
    const node = doc.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.addEventListener('click', () => {
      if (!disabled) action();
    });
    return node;
  }
  const minRows = surface ? 2 : 1,
    minColumns = stock ? roles.length : surface ? 2 : 1;
  const maxColumns = stock ? roles.length : single ? 1 : 64;
  const factor = bubble ? 3 : 2;
  function refresh() {
    addRow.disabled =
      disabled || rows.size >= 4096 || (rows.size + 1) * columns.size * factor > 16384;
    addSeries.disabled =
      disabled || columns.size >= maxColumns || rows.size * (columns.size + 1) * factor > 16384;
    let r = 0;
    for (const row of rows.values()) {
      ++r;
      if (row.category) {
        row.category.disabled = disabled;
        row.category.setAttribute('aria-label', `${stock ? '날짜' : '범주'} ${r}`);
      } else row.label.textContent = `점 ${r}`;
      row.remove.disabled = disabled || rows.size <= minRows;
      row.remove.setAttribute('aria-label', `행 ${r} 삭제`);
      let c = 0;
      for (const [id] of columns) {
        ++c;
        const values = row.values.get(id)!;
        values.y.disabled = disabled;
        values.y.setAttribute(
          'aria-label',
          `${xy ? '점' : '범주'} ${r}, 계열 ${c} ${xy ? 'Y' : '값'}`,
        );
        if (values.x) {
          values.x.disabled = disabled;
          values.x.setAttribute('aria-label', `점 ${r}, 계열 ${c} X`);
        }
        if (values.size) {
          values.size.disabled = disabled;
          values.size.setAttribute('aria-label', `점 ${r}, 계열 ${c} 크기`);
        }
      }
    }
    let c = 0;
    for (const column of columns.values()) {
      column.name.disabled = disabled;
      column.name.setAttribute('aria-label', `계열 ${++c} 이름`);
      column.remove.disabled = disabled || stock || columns.size <= minColumns;
      column.remove.setAttribute('aria-label', `계열 ${c} 삭제`);
    }
  }
  function valueCell(row: Row, id: number) {
    const cell = doc.createElement('td'),
      y = input('Y');
    const values: Values = { cell, y };
    const add = (label: string, node: HTMLInputElement) => {
      const wrapper = doc.createElement('label'),
        caption = doc.createElement('span');
      caption.textContent = label;
      wrapper.append(caption, node);
      cell.append(wrapper);
    };
    if (xy) {
      values.x = input('X');
      add('X', values.x);
    }
    add(xy ? 'Y' : '값', y);
    if (bubble) {
      values.size = input('크기');
      add('버블 크기', values.size);
    }
    row.values.set(id, values);
    row.element.insertBefore(cell, row.action);
  }
  function appendRow() {
    if (disabled || rows.size >= 4096 || (rows.size + 1) * columns.size * factor > 16384) return;
    const id = ++nextRow,
      element = doc.createElement('tr'),
      label = doc.createElement('th'),
      action = doc.createElement('td');
    label.scope = 'row';
    const category = xy ? undefined : input(stock ? '날짜' : '범주');
    if (category) label.append(category);
    const remove = button('행 삭제', () => {
      if (rows.size <= minRows) return;
      element.remove();
      rows.delete(id);
      refresh();
      focus();
      onEdit();
    });
    action.append(remove);
    element.append(label, action);
    const row: Row = { element, label, action, remove, category, values: new Map() };
    rows.set(id, row);
    body.append(element);
    for (const id of columns.keys()) valueCell(row, id);
    refresh();
    onEdit();
  }
  function appendSeries(role?: ChartStockRole) {
    if (disabled || columns.size >= maxColumns || rows.size * (columns.size + 1) * factor > 16384)
      return;
    const id = ++nextColumn,
      head = doc.createElement('th'),
      name = input('계열 이름', role ? roleNames[role] : '');
    head.scope = 'col';
    const remove = button('계열 삭제', () => {
      if (stock || columns.size <= minColumns) return;
      head.remove();
      columns.delete(id);
      for (const row of rows.values()) {
        row.values.get(id)!.cell.remove();
        row.values.delete(id);
      }
      refresh();
      focus();
      onEdit();
    });
    if (role) {
      const label = doc.createElement('span');
      label.textContent = `${roleNames[role]} (${role})`;
      head.append(label);
    }
    head.append(name, remove);
    header.insertBefore(head, last);
    columns.set(id, { name, head, remove, role });
    for (const row of rows.values()) valueCell(row, id);
    refresh();
    onEdit();
  }
  const addRow = button(xy ? '점 행 추가' : '범주 행 추가', appendRow),
    addSeries = button('계열 열 추가', () => appendSeries());
  controls.append(addRow, addSeries);
  if (stock) for (const role of roles) appendSeries(role);
  else for (let i = 0; i < minColumns; ++i) appendSeries();
  for (let i = 0; i < minRows; ++i) appendRow();
  function invalid(node: HTMLInputElement, message: string): never {
    node.setAttribute('aria-invalid', 'true');
    node.focus();
    throw Error(message);
  }
  function numeric(node: HTMLInputElement, label: string, nonnegative = false) {
    try {
      return checkedChartInputNumber(node.value.trim(), nonnegative);
    } catch (error) {
      invalid(
        node,
        error instanceof Error && error.message === 'ChartInputPrecisionLoss'
          ? `${label}은 반올림 없이 사용할 수 없습니다. 소수 자릿수나 숫자의 크기를 조정하세요.`
          : `${label}을 ${nonnegative ? '0 이상의 ' : ''}허용 범위의 숫자로 입력하세요.`,
      );
    }
  }
  function focus() {
    const row = rows.values().next().value!;
    (
      row.category ??
      row.values.values().next().value!.x ??
      row.values.values().next().value!.y
    ).focus();
  }
  return {
    collect() {
      const categories: string[] = [],
        result = new Map<number, GridSeries>();
      for (const [id, column] of columns) {
        const name = column.name.value.trim();
        if (!name) invalid(column.name, '계열 이름을 입력하세요.');
        result.set(id, {
          name,
          values: [],
          ...(xy ? { x_values: [] } : {}),
          ...(bubble ? { bubble_sizes: [] } : {}),
          ...(column.role ? { stock_role: column.role } : {}),
        });
      }
      let r = 0;
      for (const row of rows.values()) {
        ++r;
        if (row.category) {
          const category = row.category.value.trim();
          if (!category)
            invalid(row.category, `${r}번째 ${stock ? '날짜' : '범주'} 이름을 입력하세요.`);
          categories.push(category);
        }
        let c = 0;
        for (const [id, fields] of row.values) {
          ++c;
          const series = result.get(id)!;
          if (fields.x) series.x_values!.push(numeric(fields.x, `${r}번째 점의 ${c}번째 계열 X`));
          series.values.push(
            numeric(
              fields.y,
              `${r}번째 ${xy ? '점' : '범주'}의 ${c}번째 계열 ${xy ? 'Y' : '값'}`,
              strictPieInput && kind === 'pieChart',
            ),
          );
          if (fields.size)
            series.bubble_sizes!.push(
              numeric(fields.size, `${r}번째 점의 ${c}번째 계열 크기`, true),
            );
        }
      }
      return { categories, series: Array.from(result.values()) };
    },
    setDisabled(next: boolean) {
      disabled = next;
      refresh();
    },
    focus,
  };
}
