//! Drafts are transient; every committed value comes from the native model.
import { chartPointLabel } from "./chart-point-label.mjs";
import { createChartPointTable } from "./chart-point-table.mjs";
import { createChartPointGrid } from "./chart-point-grid.mjs";
import { createChartPointDrafts } from "./chart-point-drafts.mjs";
export function createChartControls({ form, fields, targets, points, kinds = null, input, note, ready, request }) {
  let rows = [], chart = null, enabled = false, closed = false, serial = 0;
  let targetIdentity = null, pointOrdinal = null;
  let queryNeeded = false;
  let stringAvailable = false, inputBaseline = "", dirty = false;
  let seriesAvailable = false, richAvailable = false;
  let observedRepairsAllowed = false;
  let table = null, grid = null;
  let batchLimits = null, chartRevision = null;
  const drafts = createChartPointDrafts();
  const batchTools = form.querySelector?.("[data-chart-batch-tools]"), batchStage = form.querySelector?.("[data-chart-batch-stage]"), batchApply = form.querySelector?.("[data-chart-batch-apply]"), batchClear = form.querySelector?.("[data-chart-batch-clear]"), batchNote = form.querySelector?.("[data-chart-batch-note]");
  const pointList = form.querySelector?.("[data-chart-point-list]");
  const accepts = kind => ["numeric_cache", "numeric_literal"].includes(kind) || stringAvailable && ["string_cache", "string_literal", "multilevel_cache"].includes(kind);
  const option = (value, label) => { const node = form.ownerDocument.createElement("option"); node.value = String(value); node.textContent = label; return node; };
  const selected = () => rows[Number(targets.value)] ?? null;
  const mode = () => kinds ? (["points", "series", "rich"].includes(kinds.value) ? kinds.value : null) : "points";
  const textMode = () => mode() === "series" || mode() === "rich";
  const available = () => mode() === "points" || mode() === "series" && seriesAvailable || mode() === "rich" && richAvailable;
  const queryKind = () => mode() === "rich" ? "chart-rich-text" : mode() === "series" ? "chart-series-text" : "chart-points";
  const items = () => textMode() ? (chart?.kind === (mode() === "rich" ? "rich_text" : "direct_series") && Array.isArray(chart.values) ? chart.values : []) : mode() === "points" ? chart?.values?.points ?? [] : [];
  const selectedPoint = () => {
    if (points.value === "") return null;
    const index = Number(points.value), point = items()[index];
    const allowed = textMode() ? available() && typeof point?.text === "string" : accepts(point?.kind);
    return Number.isInteger(index) && index >= 0 && allowed ? { index, value: textMode() ? point.text : point.value } : null;
  };
  const batchAvailable = () => !closed && mode() === "points" && batchLimits !== null && Number.isInteger(chartRevision) && chartRevision >= 0 && chartRevision < 0xffffffff && chart?.pair;
  const update = () => {
    form.hidden = closed || !rows.length; fields.disabled = closed || !enabled || !ready() || !selectedPoint();
    if (kinds) kinds.disabled = closed || !enabled || !ready() || !(seriesAvailable || richAvailable);
    if (pointList) pointList.hidden = mode() !== "points";
    if (batchTools) batchTools.hidden = !batchAvailable();
    if (batchStage) batchStage.disabled = !batchAvailable() || fields.disabled;
    if (batchApply) batchApply.disabled = !batchAvailable() || !enabled || !ready() || !drafts.size() || input.value !== inputBaseline;
    if (batchClear) batchClear.disabled = closed || !enabled || !ready() || !drafts.size();
    if (batchNote) batchNote.textContent = `미적용 ${drafts.size()}개 · 담은 뒤 다른 셀을 선택할 수 있습니다. 재조회·문서/차트/모드 변경 시 초안은 취소됩니다.`;
    table?.refresh(); grid?.refresh();
  };
  const currentValue = selection => mode() === "points" ? drafts.value(selection.index) ?? selection.value : selection.value;
  const pick = () => { const selection = selectedPoint(); input.value = selection ? currentValue(selection) : ""; inputBaseline = input.value; dirty = false; if (mode() === "points") { table?.reveal(selection?.index); grid?.reveal(); } update(); };
  const edit = () => { dirty = true; update(); };
  const discard = event => {
    if (closed || !enabled || !ready() || event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !selectedPoint()) return;
    if (!dirty && input.value === inputBaseline) return;
    event.preventDefault(); event.stopPropagation(); pick(); note.textContent = "미적용 차트 입력을 취소했습니다.";
  };
  const sendQuery = () => {
    if (!queryNeeded || closed || !enabled || !ready() || !mode() || !available()) return;
    const row = selected();
    if (!row) return;
    if (request({ kind: queryKind(), ...row, requestId: serial })) queryNeeded = false;
  };
  const query = () => {
    drafts.clear(); chartRevision = null;
    ++serial;
    const row = selected(), identity = row ? `${row.section}:${row.wrapper}:${mode()}` : null;
    if (identity !== targetIdentity) pointOrdinal = null;
    else if (chart) pointOrdinal = selectedPoint()?.index ?? null;
    targetIdentity = identity;
    chart = null; points.replaceChildren(); input.value = ""; update();
    queryNeeded = Boolean(!closed && enabled && row && mode() && available());
    sendQuery();
  };
  const submit = event => {
    event.preventDefault(); update();
    const row = selected();
    if (fields.disabled || !row || !chart) return;
    const selection = selectedPoint();
    if (!selection) return;
    const point = selection.index;
    const value = dirty || input.value !== inputBaseline ? input.value : currentValue(selection);
    if (typeof value !== "string") return;
    const command = textMode() ? { kind: mode() === "rich" ? "chart-rich-text-set" : "chart-series-text-set", ...row, ordinal: point, value } : { kind: stringAvailable ? "chart-point" : "chart-numeric-point", ...row, point, value };
    if (request(command)) note.textContent = "차트 값 반영 중…";
    update();
  };
  const stageBatch = () => {
    update(); const selection = selectedPoint();
    if (!batchAvailable() || !selection || batchStage?.disabled) return;
    try {
      drafts.stage(selection.index, dirty || input.value !== inputBaseline ? input.value : currentValue(selection), items(), batchLimits);
      pick(); note.textContent = `차트 변경 ${drafts.size()}개를 담았습니다. 아직 문서에는 적용되지 않았습니다.`;
    } catch (error) { note.textContent = `차트 초안을 담을 수 없습니다: ${error.message}`; }
    update();
  };
  const applyBatch = () => {
    update(); const row = selected();
    if (!batchAvailable() || !row || !drafts.size() || !enabled || !ready()) return;
    if (input.value !== inputBaseline) { note.textContent = "현재 입력을 먼저 변경 목록에 담거나 취소하세요."; return; }
    if (request({ kind: "chart-points-set", ...row, expectedRevision: chartRevision, expectedPair: structuredClone(chart.pair), changes: drafts.changes() })) note.textContent = "차트 변경 목록 일괄 적용 중…";
    update();
  };
  const clearBatch = () => { if (closed || !enabled || !ready()) return; drafts.clear(); pick(); note.textContent = "담아 둔 차트 초안을 취소했습니다. 문서는 변경되지 않았습니다."; };
  batchStage?.addEventListener("click", stageBatch); batchApply?.addEventListener("click", applyBatch); batchClear?.addEventListener("click", clearBatch);
  targets.addEventListener("change", query); points.addEventListener("change", pick); form.addEventListener("submit", submit);
  kinds?.addEventListener("change", query);
  input.addEventListener("input", edit);
  input.addEventListener("keydown", discard);
  const body = form.querySelector?.("[data-chart-point-body]");
  if (body) table = createChartPointTable({ body, previous: form.querySelector("[data-chart-point-previous]"), next: form.querySelector("[data-chart-point-next]"), note: form.querySelector("[data-chart-point-page]"),
    getChart: () => mode() === "points" ? chart : null, getSelected: () => selectedPoint()?.index ?? null, accepts, ready: () => !closed && enabled && ready() && mode() === "points", select: ordinal => { points.value = String(ordinal); pick(); input.focus(); } });
  const gridBody = form.querySelector?.("[data-chart-grid-body]");
  if (gridBody) grid = createChartPointGrid({ body: gridBody, head: form.querySelector("[data-chart-grid-head]"),
    previousRows: form.querySelector("[data-chart-grid-previous-rows]"), nextRows: form.querySelector("[data-chart-grid-next-rows]"),
    previousColumns: form.querySelector("[data-chart-grid-previous-columns]"), nextColumns: form.querySelector("[data-chart-grid-next-columns]"), note: form.querySelector("[data-chart-grid-page]"),
    getChart: () => mode() === "points" ? chart : null, getSelected: () => selectedPoint()?.index ?? null, accepts,
    getDraft: ordinal => drafts.value(ordinal),
    ready: () => !closed && enabled && ready() && mode() === "points", select: ordinal => { points.value = String(ordinal); pick(); input.focus(); } });
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
        enabled = false; chart = null; targetIdentity = null; pointOrdinal = null; serial++; queryNeeded = false;
        drafts.clear(); batchLimits = null; chartRevision = null;
        rows = []; targets.replaceChildren(); points.replaceChildren();
        input.value = ""; inputBaseline = ""; dirty = false;
        stringAvailable = false; observedRepairsAllowed = false; note.textContent = "";
        seriesAvailable = false; richAvailable = false; if (kinds) kinds.value = "points";
      }
      if (message.kind === "enable" && !message.error) enabled = true;
      if (message.content) {
        queryNeeded = false;
        batchLimits = message.content.chartPointBatchEditAvailable === true ? message.content.chartPointBatchLimits ?? null : null;
        stringAvailable = message.content.chartStringEditAvailable === true;
        seriesAvailable = message.content.chartSeriesTextEditAvailable === true;
        richAvailable = message.content.chartRichTextEditAvailable === true;
        if (!available() && kinds) kinds.value = "points";
        observedRepairsAllowed = message.content.chartOleObservedRepairsAllowed === true;
        const previous = selected();
        rows = message.content.chartEditAvailable ? message.content.chartTargets ?? [] : [];
        targets.replaceChildren(...rows.map((row, i) => option(i, `구역 ${row.section + 1} · 차트 ${i + 1}`)));
        const found = previous ? rows.findIndex(row => row.section === previous.section && row.wrapper === previous.wrapper) : 0;
        targets.value = String(Math.max(0, found));
        queueMicrotask(query);
      }
      if (message.kind === queryKind() && message.requestId === serial) {
        const row = selected();
        if (row && message.section === row.section && message.wrapper === row.wrapper) {
          chart = message.error ? null : message.chart;
          chartRevision = message.historyRevision ?? null;
          points.replaceChildren(...items().flatMap((point, index) => textMode() ? [option(index, `${mode() === "rich" ? "제목/레이블 run" : "시리즈 이름"} ${index + 1}`)] : accepts(point.kind) ? [option(index, chartPointLabel(chart, point, index))] : []));
          if (pointOrdinal !== null && items()[pointOrdinal] && (textMode() || accepts(items()[pointOrdinal].kind))) points.value = String(pointOrdinal);
          pick();
          note.textContent = message.error ? `차트 조회 실패: ${message.error}` : !selectedPoint() ? "현재 차트에는 지원되는 편집 값이 없습니다." : `차트 현재값과 저장 결과를 갱신합니다. 차트 그림·원본 조판과의 동일성을 보장하지 않습니다.${observedRepairsAllowed ? " 호환 저장 옵션 활성: 변경 시 CFB 관리 정보가 정규화될 수 있습니다." : " 기본 strict 저장 정책입니다."}`;
        }
      }
      if (message.kind === "chart-points-set" && message.error) {
        note.textContent = `차트 일괄 변경 실패: ${message.error}`;
        if (message.applied || message.error === "StaleChartBatch") { drafts.clear(); chartRevision = null; queueMicrotask(query); }
      }
      if (["chart-numeric-point", "chart-point", "chart-series-text-set", "chart-rich-text-set"].includes(message.kind) && message.error) { note.textContent = `차트 변경 실패: ${message.error}`; queueMicrotask(query); }
      update();
      queueMicrotask(() => { update(); sendQuery(); });
    },
    close() { closed = true; serial++; drafts.clear(); batchStage?.removeEventListener("click", stageBatch); batchApply?.removeEventListener("click", applyBatch); batchClear?.removeEventListener("click", clearBatch); table?.close(); grid?.close(); kinds?.removeEventListener("change", query); targets.removeEventListener("change", query); points.removeEventListener("change", pick); input.removeEventListener("input", edit); input.removeEventListener("keydown", discard); form.removeEventListener("submit", submit); update(); },
  };
}
