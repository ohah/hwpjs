//! Drafts are transient; every committed value comes from the native model.
import { chartPointLabel } from "./chart-point-label.mjs";
import { createChartPointTable } from "./chart-point-table.mjs";
export function createChartControls({ form, fields, targets, points, input, note, ready, request }) {
  let rows = [], chart = null, enabled = false, closed = false, serial = 0;
  let targetIdentity = null, pointOrdinal = null;
  let stringAvailable = false, inputBaseline = "", dirty = false;
  let observedRepairsAllowed = false;
  let table = null;
  const accepts = kind => ["numeric_cache", "numeric_literal"].includes(kind) || stringAvailable && ["string_cache", "string_literal", "multilevel_cache"].includes(kind);
  const option = (value, label) => { const node = form.ownerDocument.createElement("option"); node.value = String(value); node.textContent = label; return node; };
  const selected = () => rows[Number(targets.value)] ?? null;
  const selectedPoint = () => {
    if (points.value === "") return null;
    const index = Number(points.value), point = chart?.values.points[index];
    return Number.isInteger(index) && index >= 0 && accepts(point?.kind) ? { index, point } : null;
  };
  const update = () => { form.hidden = closed || !rows.length; fields.disabled = closed || !enabled || !ready() || !selectedPoint(); table?.refresh(); };
  const pick = () => { input.value = selectedPoint()?.point.value ?? ""; inputBaseline = input.value; dirty = false; table?.reveal(selectedPoint()?.index); update(); };
  const edit = () => { dirty = true; };
  const query = () => {
    const row = selected(), identity = row ? `${row.section}:${row.wrapper}` : null;
    if (identity !== targetIdentity) pointOrdinal = null;
    else if (chart) pointOrdinal = selectedPoint()?.index ?? null;
    targetIdentity = identity;
    chart = null; points.replaceChildren(); input.value = ""; update();
    if (!closed && enabled && row && ready()) request({ kind: "chart-points", ...row, requestId: ++serial });
  };
  const submit = event => {
    event.preventDefault(); update();
    const row = selected();
    if (fields.disabled || !row || !chart) return;
    const selection = selectedPoint();
    if (!selection) return;
    const point = selection.index;
    const value = dirty || input.value !== inputBaseline ? input.value : selection.point.value;
    if (typeof value !== "string") return;
    if (request({ kind: stringAvailable ? "chart-point" : "chart-numeric-point", ...row, point, value })) note.textContent = "차트 값 반영 중…";
    update();
  };
  targets.addEventListener("change", query); points.addEventListener("change", pick); form.addEventListener("submit", submit);
  input.addEventListener("input", edit);
  const body = form.querySelector?.("[data-chart-point-body]");
  if (body) table = createChartPointTable({ body, previous: form.querySelector("[data-chart-point-previous]"), next: form.querySelector("[data-chart-point-next]"), note: form.querySelector("[data-chart-point-page]"),
    getChart: () => chart, accepts, ready: () => !closed && enabled && ready(), select: ordinal => { points.value = String(ordinal); pick(); input.focus(); } });
  return {
    select(row) {
      if (closed || !enabled || !ready()) return false;
      const index = rows.findIndex(value => value.section === row.section && value.wrapper === row.wrapper);
      if (index < 0) return false;
      targets.value = String(index); query(); return true;
    },
    message(message) {
      if (closed) return;
      if (["load", "unlock"].includes(message.kind)) {
        enabled = false; chart = null; targetIdentity = null; pointOrdinal = null; serial++;
        rows = []; targets.replaceChildren(); points.replaceChildren();
        input.value = ""; inputBaseline = ""; dirty = false;
        stringAvailable = false; observedRepairsAllowed = false; note.textContent = "";
      }
      if (message.kind === "enable" && !message.error) enabled = true;
      if (message.content) {
        stringAvailable = message.content.chartStringEditAvailable === true;
        observedRepairsAllowed = message.content.chartOleObservedRepairsAllowed === true;
        const previous = selected();
        rows = message.content.chartEditAvailable ? message.content.chartTargets ?? [] : [];
        targets.replaceChildren(...rows.map((row, i) => option(i, `구역 ${row.section + 1} · 차트 ${i + 1}`)));
        const found = previous ? rows.findIndex(row => row.section === previous.section && row.wrapper === previous.wrapper) : 0;
        targets.value = String(Math.max(0, found));
        queueMicrotask(query);
      }
      if (message.kind === "chart-points" && message.requestId === serial) {
        const row = selected();
        if (row && message.section === row.section && message.wrapper === row.wrapper) {
          chart = message.error ? null : message.chart;
          points.replaceChildren(...(chart?.values.points ?? []).flatMap((point, index) => accepts(point.kind) ? [option(index, chartPointLabel(chart, point, index))] : []));
          if (pointOrdinal !== null && accepts(chart?.values.points[pointOrdinal]?.kind)) points.value = String(pointOrdinal);
          pick();
          note.textContent = message.error ? `차트 조회 실패: ${message.error}` : !selectedPoint() ? "현재 차트에는 지원되는 편집 값이 없습니다." : `데이터 값을 수정할 수 있습니다. 차트 그림 재계산은 아직 지원하지 않습니다.${observedRepairsAllowed ? " 호환 저장 옵션 활성: 변경 시 CFB 관리 정보가 정규화될 수 있습니다." : " 기본 strict 저장 정책입니다."}`;
        }
      }
      if (["chart-numeric-point", "chart-point"].includes(message.kind) && message.error) { note.textContent = `차트 변경 실패: ${message.error}`; queueMicrotask(query); }
      update();
      queueMicrotask(update);
    },
    close() { closed = true; serial++; table?.close(); targets.removeEventListener("change", query); points.removeEventListener("change", pick); input.removeEventListener("input", edit); form.removeEventListener("submit", submit); update(); },
  };
}
