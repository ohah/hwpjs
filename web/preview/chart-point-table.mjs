import { chartPointLabel } from './chart-point-label.mjs';

const pageSize = 64;
// Only pagination is owned here. Values are read from the current native query.
export function createChartPointTable({
  body,
  previous,
  next,
  note,
  getChart,
  getSelected = () => null,
  accepts,
  ready,
  select,
}) {
  let page = 0,
    closed = false;
  const render = () => {
    const chart = closed ? null : getChart(),
      values = chart?.values.points ?? [];
    const selected = closed ? null : getSelected();
    const pages = Math.ceil(values.length / pageSize);
    page = Math.max(0, Math.min(page, pages - 1));
    const rows = values.slice(page * pageSize, (page + 1) * pageSize).map((point, offset) => {
      const ordinal = page * pageSize + offset;
      const row = body.ownerDocument.createElement('tr');
      const label = body.ownerDocument.createElement('td');
      const button = body.ownerDocument.createElement('button');
      button.type = 'button';
      button.dataset.chartPoint = String(ordinal);
      button.textContent = chartPointLabel(chart, point, ordinal);
      const current = ordinal === selected;
      button.setAttribute('aria-current', String(current));
      button.style.fontWeight = current ? '700' : '';
      button.disabled = closed || !ready() || !accepts(point.kind);
      label.append(button);
      const value = body.ownerDocument.createElement('td');
      value.textContent = point.value;
      value.style.whiteSpace = 'pre-wrap';
      row.append(label, value);
      return row;
    });
    body.replaceChildren(...rows);
    previous.disabled = closed || !ready() || page === 0;
    next.disabled = closed || !ready() || page + 1 >= pages;
    note.textContent = values.length
      ? `${page + 1}/${pages}쪽 · 전체 ${values.length}개 값`
      : '표시할 차트 값이 없습니다.';
  };
  const pick = (event) => {
    const button = event.target.closest?.('button[data-chart-point]');
    if (closed || !ready() || !button || !body.contains(button) || button.disabled) return;
    if (!/^(0|[1-9][0-9]*)$/.test(button.dataset.chartPoint ?? '')) return;
    const ordinal = Number(button.dataset.chartPoint),
      point = getChart()?.values.points[ordinal];
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || !point || !accepts(point.kind)) return;
    select(ordinal);
  };
  const back = () => {
    if (!closed && !previous.disabled && ready()) {
      page--;
      render();
    }
  };
  const forward = () => {
    if (!closed && !next.disabled && ready()) {
      page++;
      render();
    }
  };
  body.addEventListener('click', pick);
  previous.addEventListener('click', back);
  next.addEventListener('click', forward);
  return {
    refresh: render,
    reveal(ordinal) {
      if (Number.isSafeInteger(ordinal) && ordinal >= 0) page = Math.floor(ordinal / pageSize);
      render();
    },
    close() {
      closed = true;
      body.removeEventListener('click', pick);
      previous.removeEventListener('click', back);
      next.removeEventListener('click', forward);
      render();
    },
  };
}
