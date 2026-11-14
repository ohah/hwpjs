/** 삽입 전까지 입력 노드만 보유하는 임시 표. 문서·저장 모델을 만들지 않는다. */
export function createInlineObjectInsertDataGrid(host: HTMLElement, onEdit: () => void) {
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
