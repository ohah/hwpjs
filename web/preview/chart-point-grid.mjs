import { chartPointGridModel } from "./chart-point-grid-model.mjs";
const rowsPerPage = 32,
  columnsPerPage = 8;
export function createChartPointGrid({
  head,
  body,
  previousRows,
  nextRows,
  previousColumns,
  nextColumns,
  note,
  getChart,
  getSelected,
  getDraft = () => undefined,
  accepts,
  ready,
  select,
}) {
  let rowPage = 0,
    columnPage = 0,
    closed = false;
  const element = (tag, text) => {
    const node = body.ownerDocument.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const render = (reveal) => {
    const chart = closed ? null : getChart(),
      selected = closed ? null : getSelected();
    let model;
    try {
      model = chartPointGridModel(chart);
    } catch {
      model = null;
    }
    const location = reveal && model?.locations.get(selected);
    if (location) {
      rowPage = Math.floor(location.row / rowsPerPage);
      columnPage = Math.floor(location.column / columnsPerPage);
    }
    const rowPages = Math.ceil((model?.rows.length ?? 0) / rowsPerPage),
      columnPages = Math.ceil((model?.columns.length ?? 0) / columnsPerPage);
    rowPage = Math.max(0, Math.min(rowPage, rowPages - 1));
    columnPage = Math.max(0, Math.min(columnPage, columnPages - 1));
    const firstColumn = columnPage * columnsPerPage,
      firstRow = rowPage * rowsPerPage;
    const columns = model?.columns.slice(firstColumn, firstColumn + columnsPerPage) ?? [];
    const header = element("tr"),
      corner = element("th", "포인트 번호");
    corner.setAttribute("scope", "col");
    header.append(corner);
    for (const column of columns) {
      const cell = element("th", column.label);
      cell.setAttribute("scope", "col");
      header.append(cell);
    }
    head.replaceChildren(header);
    const rows = (model?.rows.slice(firstRow, firstRow + rowsPerPage) ?? []).map((row) => {
      const tr = element("tr"),
        label = element("th", String(row.index));
      label.setAttribute("scope", "row");
      tr.append(label);
      for (let offset = 0; offset < columns.length; offset++) {
        const cell = element("td"),
          ordinals = row.cells.get(firstColumn + offset) ?? [];
        if (!ordinals.length) cell.textContent = "—";
        for (const ordinal of ordinals) {
          const point = chart.values.points[ordinal],
            draft = getDraft(ordinal),
            button = element("button", draft ?? point.value);
          button.type = "button";
          button.dataset.chartGridPoint = String(ordinal);
          button.setAttribute(
            "aria-label",
            `${columns[offset].label} · 포인트 ${row.index} · ${draft ?? point.value}${draft === undefined ? "" : " · 미적용 초안"}`,
          );
          if (draft !== undefined) button.dataset.chartDraft = "true";
          button.setAttribute("aria-current", String(ordinal === selected));
          button.disabled = closed || !ready() || !accepts(point.kind);
          button.style.whiteSpace = "pre-wrap";
          button.style.display = "block";
          cell.append(button);
        }
        tr.append(cell);
      }
      return tr;
    });
    body.replaceChildren(...rows);
    previousRows.disabled = closed || !ready() || rowPage === 0;
    nextRows.disabled = closed || !ready() || rowPage + 1 >= rowPages;
    previousColumns.disabled = closed || !ready() || columnPage === 0;
    nextColumns.disabled = closed || !ready() || columnPage + 1 >= columnPages;
    note.textContent = !model
      ? "차트 표 데이터를 구성할 수 없습니다. 원본 값 목록을 확인하세요."
      : !model.rows.length
        ? "표시할 차트 값이 없습니다."
        : `행 ${rowPage + 1}/${rowPages}쪽 · 열 ${columnPage + 1}/${columnPages}쪽 · ${model.rows.length}포인트 · ${model.columns.length}원본 열 · 셀을 선택한 뒤 값을 적용하세요. —는 원본에 값이 없는 자리입니다.`;
  };
  const pick = (event) => {
    const button = event.target.closest?.("button[data-chart-grid-point]");
    if (
      closed ||
      !ready() ||
      !button ||
      !body.contains(button) ||
      button.disabled ||
      !/^(0|[1-9][0-9]*)$/.test(button.dataset.chartGridPoint ?? "")
    )
      return;
    const ordinal = Number(button.dataset.chartGridPoint),
      point = getChart()?.values.points[ordinal];
    if (!Number.isSafeInteger(ordinal) || !point || !accepts(point.kind)) return;
    select(ordinal);
  };
  const handlers = [
    [
      previousRows,
      () => {
        rowPage--;
      },
    ],
    [
      nextRows,
      () => {
        rowPage++;
      },
    ],
    [
      previousColumns,
      () => {
        columnPage--;
      },
    ],
    [
      nextColumns,
      () => {
        columnPage++;
      },
    ],
  ].map(([button, change]) => {
    const handler = () => {
      if (!closed && ready() && !button.disabled) {
        change();
        render(false);
      }
    };
    button.addEventListener("click", handler);
    return [button, handler];
  });
  body.addEventListener("click", pick);
  return {
    refresh: () => render(false),
    reveal: () => render(true),
    close() {
      closed = true;
      body.removeEventListener("click", pick);
      for (const [button, handler] of handlers) button.removeEventListener("click", handler);
      render(false);
    },
  };
}
