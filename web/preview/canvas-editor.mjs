import { LINE_HEIGHT } from "./layout.mjs";
import { hitText, caretGeometry, sameParagraph } from "./text-geometry.mjs";
import { textChange, snapUnit } from "./text-input.mjs";
import { navigateText } from "./text-navigation.mjs";
import { sourceTextChange } from "./text-offsets.mjs";

/** DOM draft and interaction only. Native acknowledgements own committed text. */
export function createCanvasEditor({ canvas, viewport, input, renderer, controls, note }) {
  const events = new AbortController(), listen = (node, type, fn) => node.addEventListener(type, fn, { signal: events.signal });
  let target = null, committed = "", anchor = null, focus = null, pending = null, composing = false, drag = null;
  let historyAvailable = false, historyPending = false, structureAvailable = false, splitTarget = null;
  const report = text => { note.textContent = text; };
  const place = () => {
    const caret = caretGeometry(renderer.layout(), focus);
    if (!caret) return;
    // Keep the real IME target at the painted caret, not far offscreen.
    input.style.left = `${Math.max(0, Math.min(caret.x, viewport.clientWidth - 2))}px`;
    input.style.top = `${Math.max(viewport.scrollTop, Math.min(caret.y, viewport.scrollTop + viewport.clientHeight - LINE_HEIGHT))}px`;
  };
  renderer.onGeometry(place);
  const paint = () => {
    let composition;
    const change = composing && textChange(committed, input.value);
    if (change) composition = { anchor: { ...target, unit: change.startUnit }, focus: { ...target, unit: change.startUnit + change.text.length } };
    renderer.select({ anchor, focus, active: document.activeElement === input || drag !== null, composition });
    canvas.dataset.caret = focus ? `${focus.section}:${focus.paragraph}:${focus.unit}` : "";
    canvas.dataset.selection = anchor && focus ? `${anchor.unit}:${focus.unit}` : "";
    canvas.dataset.composing = String(composing);
    place();
  };
  const sync = () => {
    if (!target) return;
    const backward = input.selectionDirection === "backward";
    const start = snapUnit(input.value, input.selectionStart), end = snapUnit(input.value, input.selectionEnd, true);
    const anchorUnit = backward ? end : start, focusUnit = backward ? start : end;
    anchor = { ...target, unit: anchorUnit, affinity: anchor?.unit === anchorUnit ? anchor.affinity : "forward" };
    focus = { ...target, unit: focusUnit, affinity: focus?.unit === focusUnit ? focus.affinity : "forward" };
    paint();
  };
  const setSelection = (a, f) => {
    anchor = a; focus = f;
    input.setSelectionRange(Math.min(a.unit, f.unit), Math.max(a.unit, f.unit), a.unit > f.unit ? "backward" : "forward");
    paint();
  };
  const pump = () => {
    if (!target || composing || pending || historyPending || !controls.ready() || controls.busy()) return;
    const change = textChange(committed, input.value);
    if (!change) return;
    pending = { start: change.startUnit, end: change.endUnit };
    const command = sourceTextChange(change, renderer.paragraph(target)?.sourceOffsets);
    if (!controls.request({ kind: "splice", origin: "canvas", section: target.section, paragraph: target.paragraph, ...command })) pending = null;
    input.setAttribute("aria-busy", String(Boolean(pending)));
  };
  const reveal = () => {
    const caret = caretGeometry(renderer.layout(), focus);
    if (!caret || document.activeElement !== input) return;
    if (caret.y < viewport.scrollTop) viewport.scrollTop = caret.y;
    else if (caret.y + LINE_HEIGHT > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = caret.y + LINE_HEIGHT - viewport.clientHeight;
    place(); input.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const preview = () => { renderer.preview({ ...target, text: input.value }); sync(); reveal(); };
  const coordinates = event => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top + viewport.scrollTop };
  };
  const point = (event, constrained = null) => { const { x, y } = coordinates(event); return hitText(renderer.layout(), x, y, constrained); };
  listen(canvas, "pointermove", event => {
    canvas.style.cursor = point(event) ? "text" : "default";
    if (drag !== event.pointerId || !target) return;
    const box = viewport.getBoundingClientRect();
    if (event.clientY < box.top || event.clientY > box.bottom) viewport.scrollTop += event.clientY < box.top ? -LINE_HEIGHT : LINE_HEIGHT;
    const next = point(event, target); if (next) setSelection(anchor, next);
  });
  listen(canvas, "pointerdown", event => {
    if (event.button !== 0) return;
    const next = point(event);
    if (!next) { input.blur(); return; }
    event.preventDefault();
    if (historyPending || composing || ((pending || input.value !== committed) && !sameParagraph(next, target))) { report("입력 반영 중입니다. 같은 문단에서 이어서 입력하거나 잠시 기다리세요."); return; }
    if (!sameParagraph(next, target)) {
      target = { section: next.section, paragraph: next.paragraph };
      committed = renderer.paragraph(next).text; input.value = committed;
    }
    setSelection(event.shiftKey && sameParagraph(anchor, next) ? anchor : next, next);
    input.disabled = false; input.readOnly = !controls.ready();
    input.focus({ preventScroll: true });
    drag = event.pointerId; canvas.setPointerCapture(drag); paint();
    if (!controls.ready() && !controls.busy()) { report("편집 세션을 여는 중…"); controls.request({ kind: "enable", origin: "canvas" }); }
  });
  const release = event => { if (drag === event.pointerId) { drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); paint(); } };
  listen(canvas, "pointerup", release); listen(canvas, "pointercancel", release);
  const travel = kind => {
    if (!["undo", "redo"].includes(kind)) return false;
    if (!historyAvailable) { report("이 문서 형식은 실행 취소/다시 실행을 아직 지원하지 않습니다."); return false; }
    if (composing || pending || historyPending || (target && input.value !== committed) || !controls.ready() || controls.busy()) { report("입력 반영이 끝난 뒤 실행 취소/다시 실행하세요."); return false; }
    historyPending = true; input.readOnly = true;
    if (!controls.request({ kind, origin: "canvas" })) { historyPending = false; input.readOnly = !controls.ready(); return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const split = () => {
    if (!structureAvailable) { report("이 문서 형식의 문단 분할은 아직 지원하지 않습니다."); return false; }
    if (!target || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) { report("입력 반영이 끝난 뒤 문단을 분할하세요."); return false; }
    const unit = snapUnit(committed, input.selectionStart);
    const end = snapUnit(committed, input.selectionEnd, true);
    const position = sourceTextChange({ startUnit: unit, endUnit: end, text: "" }, renderer.paragraph(target)?.sourceOffsets);
    splitTarget = { section: target.section, paragraph: target.paragraph + 1 };
    historyPending = true; input.readOnly = true;
    if (!controls.request({ kind: "split", origin: "canvas", ...target, atUnit: position.startUnit, endUnit: position.endUnit })) {
      splitTarget = null; historyPending = false; input.readOnly = !controls.ready(); return false;
    }
    input.setAttribute("aria-busy", "true"); return true;
  };
  listen(input, "beforeinput", event => {
    if (!target || !controls.ready() || historyPending) { event.preventDefault(); return; }
    if (["historyUndo", "historyRedo"].includes(event.inputType)) { event.preventDefault(); travel(event.inputType === "historyUndo" ? "undo" : "redo"); return; }
    if (["insertLineBreak", "insertParagraph"].includes(event.inputType)) { event.preventDefault(); split(); }
  });
  listen(input, "input", () => { if (!target) return; preview(); if (!composing) pump(); });
  listen(input, "compositionstart", () => { if (!target || !controls.ready()) return; composing = true; paint(); });
  listen(input, "compositionend", () => {
    if (!composing) return;
    composing = false; preview(); queueMicrotask(pump);
  });
  listen(input, "keydown", event => {
    if (!target || composing || event.isComposing || event.keyCode === 229) return;
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") {
      event.preventDefault(); setSelection({ ...target, unit: 0 }, { ...target, unit: input.value.length }); reveal(); return;
    }
    if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(key.toLowerCase())) { event.preventDefault(); travel(key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo"); return; }
    if (key === "Enter") { event.preventDefault(); split(); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key) || event.altKey) return;
    event.preventDefault();
    const next = navigateText(renderer.layout(), input.value, anchor, focus, key, { extend: event.shiftKey, paragraphEdge: event.ctrlKey || event.metaKey });
    if (!next) return;
    setSelection(next.anchor, next.focus);
    reveal();
  });
  listen(input, "keyup", sync); listen(input, "select", sync);
  listen(input, "focus", paint); listen(input, "blur", paint);
  return {
    settled: () => !composing && !pending && !historyPending && (!target || input.value === committed),
    canHistory: () => historyAvailable && !composing && !pending && !historyPending && (!target || input.value === committed) && controls.ready() && !controls.busy(),
    history: travel,
    reset() {
      if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
      composing = false; drag = null; target = null; pending = null; anchor = null; focus = null; committed = "";
      historyAvailable = false; historyPending = false; structureAvailable = false; splitTarget = null;
      input.value = ""; input.disabled = true; input.setAttribute("aria-busy", "false"); canvas.style.cursor = "default"; report(""); renderer.preview(null); paint();
    },
    external(message) {
      if (message.origin !== "canvas" && !["enable", "save"].includes(message.kind)) {
        const available = historyAvailable, structure = structureAvailable; this.reset(); historyAvailable = available; structureAvailable = structure;
      }
    },
    message(message) {
      if (message.kind === "save") { pump(); return; }
      if (message.applied && message.error) { this.reset(); return; }
      if (message.kind === "enable") { if (!message.error) { historyAvailable = message.historyAvailable === true; structureAvailable = message.structureAvailable === true; } input.readOnly = !controls.ready(); report(message.error ? `편집 시작 실패: ${message.error}` : "클릭·드래그 선택 후 입력하세요. 변경 후 재조판이 필요합니다."); pump(); return; }
      if (message.kind === "split" && message.origin === "canvas" && splitTarget) {
        const next = splitTarget; splitTarget = null; historyPending = false;
        input.readOnly = !controls.ready(); input.setAttribute("aria-busy", "false");
        if (message.error) { report(`문단 분할 실패: ${message.error}`); return; }
        const paragraph = renderer.paragraph(next);
        if (!paragraph?.editable) { this.reset(); report("문단 분할은 적용됐지만 표시 한도로 직접 입력을 중단했습니다."); return; }
        target = next; committed = paragraph.text; input.value = committed; renderer.preview(null);
        setSelection({ ...target, unit: 0 }, { ...target, unit: 0 }); reveal();
        report("문단 분할 적용 · 재조판 필요"); return;
      }
      if (["undo", "redo"].includes(message.kind) && message.origin === "canvas" && historyPending) {
        historyPending = false; input.readOnly = !controls.ready(); input.setAttribute("aria-busy", "false");
        if (message.error) { report(`실행 취소/다시 실행 실패: ${message.error}`); return; }
        if (!target) { report(message.changed ? "실행 취소/다시 실행 적용 · 재조판 필요" : "이동할 편집 이력이 없습니다."); return; }
        const paragraph = renderer.paragraph(target);
        if (!paragraph?.editable) { this.reset(); return; }
        const a = anchor?.unit ?? 0, f = focus?.unit ?? 0;
        committed = paragraph.text; input.value = committed; renderer.preview(null);
        setSelection({ ...target, unit: snapUnit(committed, Math.min(a, committed.length)) }, { ...target, unit: snapUnit(committed, Math.min(f, committed.length)) });
        report(message.changed ? "실행 취소/다시 실행 적용 · 재조판 필요" : "이동할 편집 이력이 없습니다."); return;
      }
      if (message.origin !== "canvas" || !pending || !target) return;
      const previous = pending; pending = null; input.setAttribute("aria-busy", "false");
      if (message.error) {
        input.value = committed; renderer.preview(null);
        setSelection({ ...target, unit: snapUnit(committed, previous.start) }, { ...target, unit: snapUnit(committed, previous.end, true) });
        report(`입력이 적용되지 않았습니다: ${message.error}`); return;
      }
      const paragraph = renderer.paragraph(target);
      if (!paragraph?.editable) { this.reset(); report("표시 한도에 도달해 직접 입력을 중단했습니다. 적용된 변경은 native 모델에 유지됩니다."); return; }
      committed = paragraph.text;
      report("변경 적용 · 재조판 필요"); preview(); pump();
    },
    close() { this.reset(); events.abort(); renderer.onGeometry(() => {}); },
  };
}
