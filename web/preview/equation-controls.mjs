import { createEquationEditState } from "./equation-edit-state.mjs";
import { validateEquationSources } from "../../js/hwpx-equation-sources.mjs";

const pageSize = 64;
const reasons = { inactive: "비활성 분기", inline_text_descendant: "텍스트 내부 구조", unsupported_encoding: "편집 미지원 인코딩", missing_script: "script 없음", multiple_scripts: "script 중복", nested_script: "script 하위 요소" };
export function createEquationControls({ form, fields, section, list, targets, previous, next, pageNote, refresh, input, note, ready, request }) {
  let enabled = false, closed = false, serial = 0, sectionCount = 0, rows = [], page = 0, pendingList = null, status = "";
  let renderedDraft = null, domBaseline = "";
  let initialList = false, scheduled = false;
  let pendingTarget = null;
  let paintSnapshot = null;
  const selected = () => targets.value === "" ? null : rows[Number(targets.value)] ?? null;
  const sectionIndex = () => {
    const value = Number(section.value);
    return Number.isInteger(value) && value >= 1 && value <= sectionCount ? value - 1 : null;
  };
  const update = view => {
    const canUse = !closed && enabled && ready();
    form.hidden = closed || !enabled;
    fields.disabled = !canUse || !view.canSubmit || selected()?.issue !== null;
    list.disabled = !canUse || pendingList !== null || view.pending !== null;
    section.disabled = !canUse || pendingList !== null || view.pending !== null;
    targets.disabled = !canUse || pendingList !== null || view.pending !== null;
    previous.disabled = !canUse || pendingList !== null || view.pending !== null || page === 0;
    next.disabled = !canUse || pendingList !== null || view.pending !== null || (page + 1) * pageSize >= rows.length;
    refresh.disabled = !canUse || pendingList !== null || view.pending === "write" || !selected() || selected().issue !== null;
    if (view.draft !== renderedDraft) {
      if (input.value !== view.draft) input.value = view.draft;
      renderedDraft = view.draft; domBaseline = input.value;
    }
    const target = selected();
    const paintError = paintSnapshot?.equationPaintErrors?.find(row => row.section === target?.section && row.node === target?.node);
    const paintWarning = paintSnapshot?.equationPaintWarnings?.find(row => row.section === target?.section && row.node === target?.node);
    const hint = paintError ? `Canvas 수식 미리보기 불가: ${paintError.error} · 대체 표식을 유지합니다.`
      : paintWarning ? "구문 복구 표시: EOF의 닫히지 않은 그룹을 표시했습니다. 원문·저장값은 수정하지 않았습니다."
      : paintSnapshot?.equationPaintAvailable ? "지원 수식은 Canvas 미리보기를 갱신합니다. 원본 글꼴·도형 크기·기준선과의 동일성은 미검증입니다." : "Canvas 수식 조판을 사용할 수 없습니다. 대체 표식을 유지합니다.";
    note.textContent = status || (view.error ? `수식 조회/변경 실패: ${view.error} · 상태가 바뀌었다면 현재값을 다시 조회하세요.` : view.pending ? "수식 처리 중…" : `수식 script 편집 · ${hint} 다시 조회하면 미적용 초안은 폐기됩니다.`);
  };
  const state = createEquationEditState({ request: message => !closed && enabled && ready() && request(message), changed: view => { status = ""; update(view); } });
  const render = () => update(state.snapshot());
  const clearRows = () => { rows = []; page = 0; targets.replaceChildren(); targets.value = ""; pageNote.textContent = ""; state.reset(); };
  const pick = () => {
    const row = selected();
    state.reset();
    if (!row || row.issue !== null || !ready()) {
      status = row?.issue ? `조회 불가: ${reasons[row.issue] ?? row.issue}` : "목록과 현재값을 다시 조회하세요.";
      render(); return false;
    }
    return state.select({ section: row.section, node: row.node });
  };
  const showPage = (preferred = null) => {
    const start = page * pageSize, visible = rows.slice(start, start + pageSize);
    targets.replaceChildren(...visible.map((row, index) => {
      const option = form.ownerDocument.createElement("option");
      option.value = String(start + index); option.disabled = row.issue !== null;
      option.textContent = `수식 ${start + index + 1} · 원본 #${row.node}${row.issue === null ? "" : ` · ${reasons[row.issue] ?? row.issue}`}`;
      return option;
    }));
    const wanted = visible.findIndex(row => row.node === preferred && row.issue === null);
    const first = wanted >= 0 ? wanted : visible.findIndex(row => row.issue === null);
    targets.value = visible.length ? String(start + Math.max(0, first)) : "";
    pageNote.textContent = rows.length ? `${start + 1}–${Math.min(start + pageSize, rows.length)} / ${rows.length}` : "수식 없음";
    if (visible.length) return pick();
    else { status = "이 구역에는 대상 수식이 없습니다."; render(); }
  };
  const queryList = () => {
    if (closed || !enabled || !ready()) return false;
    const chosen = sectionIndex();
    serial++; pendingList = null; clearRows();
    if (chosen === null) { status = "유효한 구역 번호를 입력하세요."; render(); return false; }
    const requestId = serial;
    pendingList = { requestId, section: chosen };
    if (!request({ kind: "equation-sources", requestId, section: chosen })) {
      pendingList = null; pendingTarget = null; status = "수식 목록 조회를 시작할 수 없습니다.";
    } else { initialList = false; status = "수식 목록 조회 중…"; }
    render(); return pendingList !== null;
  };
  const scheduleInitialList = () => {
    if (closed || !enabled || !initialList || scheduled) return;
    scheduled = true; const epoch = serial;
    queueMicrotask(() => {
      scheduled = false;
      if (closed || !enabled || !initialList) return;
      if (serial !== epoch) { scheduleInitialList(); return; }
      queryList();
    });
  };
  const sectionChanged = () => { serial++; initialList = false; pendingTarget = null; pendingList = null; clearRows(); status = "새 구역의 목록을 조회하세요."; render(); };
  const listClicked = () => { pendingTarget = null; queryList(); };
  const edit = () => { if (input.value !== domBaseline) state.edit(input.value); };
  const submit = event => {
    event.preventDefault();
    if (closed || !enabled || !ready() || !state.snapshot().canSubmit) return;
    edit(); state.submit();
  };
  const goPrevious = () => { if (!previous.disabled) { page--; showPage(); } };
  const goNext = () => { if (!next.disabled) { page++; showPage(); } };
  const reload = () => { if (!refresh.disabled) state.refresh(); };
  list.addEventListener("click", listClicked); section.addEventListener("input", sectionChanged);
  targets.addEventListener("change", pick); previous.addEventListener("click", goPrevious); next.addEventListener("click", goNext);
  refresh.addEventListener("click", reload); input.addEventListener("input", edit); form.addEventListener("submit", submit);
  const reset = () => { serial++; enabled = false; initialList = false; sectionCount = 0; pendingTarget = null; pendingList = null; paintSnapshot = null; clearRows(); status = ""; render(); };
  reset();
  return {
    reset,
    select(target) {
      if (closed || !enabled || !ready() || pendingList !== null || state.snapshot().pending !== null || !target || !Number.isInteger(target.section) || target.section < 0 || target.section >= sectionCount || !Number.isInteger(target.node) || target.node < 0 || target.node > 0xffffffff) return false;
      const index = rows.findIndex(row => row.section === target.section && row.node === target.node);
      if (index >= 0) {
        if (rows[index].issue !== null) return false;
        page = Math.floor(index / pageSize);
        return showPage(target.node);
      }
      initialList = false;
      pendingTarget = { section: target.section, node: target.node };
      section.value = String(target.section + 1);
      return queryList();
    },
    message(message) {
      if (closed) return;
      if (message.kind === "enable") {
        reset();
        if (message.content) paintSnapshot = message.content;
        enabled = !message.error && message.equationScriptAvailable === true && Number.isInteger(message.equationSectionCount) && message.equationSectionCount > 0;
        if (enabled) { sectionCount = message.equationSectionCount; section.max = String(sectionCount); section.value = "1"; initialList = true; scheduleInitialList(); }
        render(); return;
      }
      if (message.content) paintSnapshot = message.content;
      if (message.kind === "equation-sources" && pendingList && message.requestId === pendingList.requestId && message.section === pendingList.section) {
        const chosen = pendingList.section; pendingList = null;
        if (message.error) { pendingTarget = null; status = `수식 목록 조회 실패: ${message.error}`; render(); return; }
        try { rows = validateEquationSources(message.sources).map(row => ({ ...row, section: chosen })); }
        catch { pendingTarget = null; status = "수식 목록 조회 실패: InvalidHwpxEquationSources"; render(); return; }
        const target = pendingTarget; pendingTarget = null;
        if (target !== null) {
          const index = rows.findIndex(row => row.section === target.section && row.node === target.node && row.issue === null);
          if (index < 0) { status = "선택한 수식이 현재 목록에 없거나 편집할 수 없습니다."; render(); return; }
          page = Math.floor(index / pageSize);
        }
        showPage(target?.node ?? null); return;
      }
      state.message(message); render(); scheduleInitialList();
    },
    close() {
      if (closed) return;
      reset(); closed = true; state.close();
      list.removeEventListener("click", listClicked); section.removeEventListener("input", sectionChanged);
      targets.removeEventListener("change", pick); previous.removeEventListener("click", goPrevious); next.removeEventListener("click", goNext);
      refresh.removeEventListener("click", reload); input.removeEventListener("input", edit); form.removeEventListener("submit", submit);
      render();
    },
  };
}
