import { LINE_HEIGHT } from "./layout.mjs";
import { canvasDocumentPoint, canvasDocumentBounds, canvasCaretScrollLeft } from "./canvas-pointer-coordinates.mjs";
import { structureErrorMessage } from "./structure-error-message.mjs";
import { hitText, caretGeometry, sameParagraph, selectableText, paragraphTarget } from "./text-geometry.mjs";
import { textChange, snapUnit } from "./text-input.mjs";
import { navigateText, adjacentParagraphBoundary } from "./text-navigation.mjs";
import { sourceTextChange } from "./text-offsets.mjs";
import { normalizeParagraphReplacement } from "../../js/paragraph-replacement.mjs";
import { paragraphSelectionEdge, paragraphSelectionRanges } from "./paragraph-selection.mjs";
import { paragraphCompositionProjection } from "./paragraph-composition.mjs";
import { navigationIntent } from "./navigation-intent.mjs";
import { characterFontNameArgs } from "../../js/character-font-name-args.mjs";
import { characterShadeArgs } from "../../js/character-shade-args.mjs";
import { characterEffectArgs, characterEffectMode } from "../../js/character-effect-args.mjs";
import { hwp5CharacterOutlineArg } from "../../js/character-outline-args.mjs";
import { encodeCharacterRanges } from "../../js/character-range-batch.mjs";
import { characterTypingState, characterTypingSize, mergeTypingProperties, typingSourceSpan } from "./character-typing-properties.mjs";
import { createHistorySelectionStore } from "./history-selection.mjs";
import { hitDrawingBoundary } from "./drawing-boundary-hit.mjs";
import { hitTableBoundary } from "./table-boundary-geometry.mjs";
import { appendQueuedText } from "./queued-input.mjs";
import { createSelectionEditPermission } from "./selection-edit-permission.mjs";
import { pictureResizeTarget } from "./picture-resize-target.mjs";

/** DOM draft and interaction only. Native acknowledgements own committed text. */
export function createCanvasEditor({ canvas, viewport, input, renderer, controls, note, queryEditRange = null, querySplitRange = null, platform = globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? "" }) {
  const events = new AbortController(), listen = (node, type, fn) => node.addEventListener(type, fn, { signal: events.signal });
  const hostControls = controls;
  controls = {
    ready: () => !events.signal.aborted && hostControls.ready(),
    busy: () => events.signal.aborted || hostControls.busy(),
    request: message => !events.signal.aborted && hostControls.request(message),
  };
  let target = null, committed = "", anchor = null, focus = null, pending = null, composing = false, drag = null;
  let preferredX = null, dragScale = 1;
  const viewScale = () => renderer.viewScale?.() ?? 1;
  let pictureResizeAvailable = false;
  let typingFont = null;
  let typingProperties = null;
  let multiComposition = null;
  let draftSelection = null;
  const historySelections = createHistorySelectionStore();
  let historyRevision = null;
  let historyAvailable = false, historyPending = false, structureAvailable = false, mergeAvailable = false, structureTarget = null;
  let splitQueryAvailable = false;
  const multipleParagraphs = () => Boolean(anchor && focus && !sameParagraph(anchor, focus));
  const rangePermission = createSelectionEditPermission();
  const splitPermission = createSelectionEditPermission({ kind: "query-split-range" });
  const wholeTextEditable = () => Boolean(target) && !multipleParagraphs() && renderer.paragraph(target)?.editable === true;
  const editRange = () => {
    if (!target || !anchor || !focus || multipleParagraphs()) return null;
    const change = input.value !== committed ? textChange(committed, input.value) : null;
    const range = change ?? { startUnit: Math.min(anchor.unit, focus.unit), endUnit: Math.max(anchor.unit, focus.unit), text: "" };
    const source = sourceTextChange(range, renderer.paragraph(target)?.sourceOffsets);
    return { section: target.section, paragraph: target.paragraph, startUnit: source.startUnit, endUnit: source.endUnit };
  };
  const textEditable = () => wholeTextEditable() || Boolean(editRange() && rangePermission.allowed(editRange()));
  const multiCompositionAvailable = () => {
    if (!multipleParagraphs() || renderer.paragraphReplacementAvailable?.() !== true) return false;
    const ranges = renderer.replacementRanges?.(anchor, focus);
    return Boolean(ranges?.length && ranges.every(range => renderer.paragraph(range)?.editable === true));
  };
  const updateReadOnly = () => {
    input.readOnly = !controls.ready() || (!textEditable() && !multiCompositionAvailable());
    if (typeof queryEditRange === "function" && controls.ready() && !pending && !historyPending && target && !wholeTextEditable() && renderer.paragraph(target)?.selectable && editRange()) {
      const request = rangePermission.request(editRange());
      if (request) queryEditRange(request);
    }
    if (typeof querySplitRange === "function" && splitQueryAvailable && controls.ready() && structureAvailable && !pending && !historyPending && target && !wholeTextEditable() && renderer.paragraph(target)?.selectable && editRange() && input.value === committed) {
      const request = splitPermission.request(editRange());
      if (request) querySplitRange(request);
    }
  };
  const report = text => { note.textContent = text; };
  const compositionProjection = () => {
    if (!multiComposition) return null;
    const start = paragraphSelectionEdge(multiComposition.anchor, multiComposition.focus);
    return paragraphCompositionProjection(renderer.paragraph(start), start, input.value);
  };
  const extendedNavigation = (key, paragraphEdge, extend = true, word = false) => {
    if (pending || historyPending || composing || input.value !== committed || !controls.ready() || controls.busy()) return null;
    const paragraph = renderer.paragraph(focus);
    if (!paragraph) return null;
    // 선택을 접는 좌우 이동은 기존 선택의 끝점에서 멈춘다.
    if (!extend && anchor.unit !== focus.unit && ["ArrowLeft", "ArrowRight"].includes(key)) {
      return navigateText(renderer.layout(), paragraph.text, anchor, focus, key);
    }
    let next = navigateText(renderer.layout(), paragraph.text, anchor, focus, key, { extend: true, paragraphEdge, crossParagraph: true, preferredX, word });
    if ((!paragraphEdge || word) && next?.focus.unit === focus.unit && ["ArrowLeft", "ArrowRight"].includes(key)) {
      const point = adjacentParagraphBoundary(renderer.layout(), focus, key);
      if (point) next = { anchor, focus: point };
    }
    if (!next) return null;
    if (!sameParagraph(next.anchor, next.focus) && !renderer.selectionRanges?.(next.anchor, next.focus)) return null;
    if (!extend) next = { ...next, anchor: next.focus };
    return next;
  };
  const place = () => {
    const caret = caretGeometry(renderer.layout(), compositionProjection()?.composition.focus ?? focus);
    if (!caret) return;
    const bounds = canvasDocumentBounds(caret.screenBounds ?? caret, viewScale());
    if (!bounds) return;
    // Keep the real IME target at the painted caret, not far offscreen.
    const left = viewport.scrollLeft ?? 0;
    input.style.left = `${Math.max(left, Math.min(bounds.x, left + viewport.clientWidth - 2))}px`;
    input.style.height = `${bounds.height}px`;
    input.style.top = `${Math.max(viewport.scrollTop, Math.min(bounds.y, viewport.scrollTop + viewport.clientHeight - bounds.height))}px`;
  };
  renderer.onGeometry(place);
  const paint = () => {
    let composition;
    if (multiComposition) composition = compositionProjection()?.composition;
    const change = composing && !multiComposition && textChange(committed, input.value);
    if (change) composition = { anchor: { ...target, unit: change.startUnit }, focus: { ...target, unit: change.startUnit + change.text.length } };
    renderer.select({ anchor, focus, active: document.activeElement === input || drag !== null, composition });
    canvas.dataset.caret = focus ? `${focus.section}:${focus.paragraph}:${focus.unit}` : "";
    canvas.dataset.selection = anchor && focus ? `${anchor.unit}:${focus.unit}` : "";
    canvas.dataset.composing = String(composing);
    place();
  };
  const sync = () => {
    if (!target || multipleParagraphs()) return;
    const backward = input.selectionDirection === "backward";
    const start = snapUnit(input.value, input.selectionStart), end = snapUnit(input.value, input.selectionEnd, true);
    const anchorUnit = backward ? end : start, focusUnit = backward ? start : end;
    if (anchor?.unit !== anchorUnit || focus?.unit !== focusUnit) preferredX = null;
    anchor = { ...target, unit: anchorUnit, affinity: anchor?.unit === anchorUnit ? anchor.affinity : "forward" };
    focus = { ...target, unit: focusUnit, affinity: focus?.unit === focusUnit ? focus.affinity : "forward" };
    updateReadOnly();
    paint();
  };
  const setSelection = (a, f, nextX = null) => {
    if (draftSelection && !sameParagraph(draftSelection.focus, f)) draftSelection = null;
    if (typingFont && !sameParagraph(typingFont, f)) typingFont = null;
    if (typingProperties && !sameParagraph(typingProperties, f)) typingProperties = null;
    preferredX = nextX;
    anchor = a; focus = f;
    if (sameParagraph(a, f)) input.setSelectionRange(Math.min(a.unit, f.unit), Math.max(a.unit, f.unit), a.unit > f.unit ? "backward" : "forward");
    updateReadOnly();
    paint();
  };
  const pump = (requestedChange = null) => {
    if (!target || composing || pending || historyPending || !controls.ready() || controls.busy()) return;
    const sourceRange = requestedChange && sourceTextChange(requestedChange, renderer.paragraph(target)?.sourceOffsets);
    const permitted = requestedChange ? wholeTextEditable() || rangePermission.allowed({ ...target, startUnit: sourceRange.startUnit, endUnit: sourceRange.endUnit }) : textEditable();
    if (!permitted) return;
    const change = requestedChange ?? textChange(committed, input.value);
    if (!change) { draftSelection = null; return; }
    preferredX = null;
    const font = change.text && typingFont && sameParagraph(typingFont, target) ? typingFont : null;
    const properties = change.text && typingProperties && sameParagraph(typingProperties, target) ? { ...typingProperties.properties } : null;
    pending = { kind: font ? "splice-font-name" : properties ? "splice-character-properties" : "splice", start: change.startUnit, end: change.endUnit,
      beforeSelection: draftSelection ?? { anchor: { ...target, unit: change.startUnit }, focus: { ...target, unit: change.endUnit } } };
    draftSelection = null;
    const command = sourceRange ?? sourceTextChange(change, renderer.paragraph(target)?.sourceOffsets);
    if (!controls.request({ kind: pending.kind, origin: "canvas", section: target.section, paragraph: target.paragraph, ...command, ...(font ? { language: font.language, name: font.name } : {}), ...(properties ? { properties } : {}) })) pending = null;
    input.setAttribute("aria-busy", String(Boolean(pending)));
  };
  const reveal = () => {
    const caret = caretGeometry(renderer.layout(), focus);
    if (!caret || document.activeElement !== input) return;
    const bounds = canvasDocumentBounds(caret.screenBounds ?? caret, viewScale());
    if (!bounds) return;
    const left = canvasCaretScrollLeft(bounds.x, viewport.scrollLeft ?? 0, viewport.clientWidth);
    if (left !== null) viewport.scrollLeft = left;
    if (bounds.y < viewport.scrollTop) viewport.scrollTop = bounds.y;
    else if (bounds.y + bounds.height > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bounds.y + bounds.height - viewport.clientHeight;
    place(); input.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const preview = () => { renderer.preview({ ...target, text: input.value }); sync(); reveal(); };
  const coordinates = event => {
    const box = canvas.getBoundingClientRect();
    return canvasDocumentPoint(event, box, viewport.scrollTop, viewScale(), viewport.scrollLeft ?? 0);
  };
  const point = (event, constrained = null) => { const { x, y } = coordinates(event); const layout = renderer.layout(); return hitTableBoundary(layout, x, y, target => renderer.paragraph(target), constrained) ?? hitDrawingBoundary(layout, x, y, constrained) ?? hitText(layout, x, y, constrained); };
  listen(canvas, "pointermove", event => {
    canvas.style.cursor = point(event) ? "text" : "default";
    if (drag !== event.pointerId || !target) return;
    if (dragScale !== viewScale()) { release(event); return; }
    const box = viewport.getBoundingClientRect();
    if (event.clientY < box.top || event.clientY > box.bottom) viewport.scrollTop += event.clientY < box.top ? -LINE_HEIGHT : LINE_HEIGHT;
    if (Number.isFinite(box.left) && Number.isFinite(box.right)) {
      if (event.clientX < box.left) viewport.scrollLeft = Math.max(0, (viewport.scrollLeft ?? 0) - LINE_HEIGHT);
      else if (event.clientX > box.right) viewport.scrollLeft = (viewport.scrollLeft ?? 0) + LINE_HEIGHT;
    }
    const free = !pending && !composing && !historyPending && input.value === committed ? point(event) : null;
    const ranges = free ? renderer.selectionRanges?.(anchor, free) : null;
    const next = ranges ? free : point(event, target);
    if (next) setSelection(anchor, next);
  });
  listen(canvas, "pointerdown", event => {
    if (event.button !== 0) return;
    const location = coordinates(event);
    const picture = !event.shiftKey && !event.metaKey && !event.ctrlKey ? renderer.pictureAtLogicalPoint?.(location.x, location.y, { includeBehind: event.altKey === true }) : null;
    if (picture) {
      event.preventDefault();
      if (historyPending || composing || pending || input.value !== committed || controls.busy()) { report("입력 반영 중에는 그림 선택을 변경할 수 없습니다."); return; }
      if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
      rangePermission.invalidate(); splitPermission.invalidate();
      typingFont = null; typingProperties = null; draftSelection = null;
      anchor = null; focus = null; target = null; drag = null;
      input.blur(); input.value = ""; committed = ""; input.disabled = true;
      renderer.selectPicture?.(picture.picture);
      paint();
      report("그림을 선택했습니다. 지원되는 그림은 크기를 입력해 변경할 수 있습니다.");
      if (!controls.ready() && !controls.busy()) controls.request({ kind: "enable", origin: "canvas" });
      return;
    }
    const next = point(event);
    if (!next) { renderer.selectPicture?.(null); input.blur(); return; }
    event.preventDefault();
    if (historyPending || composing || ((pending || input.value !== committed) && !sameParagraph(next, target))) { report("입력 반영 중입니다. 같은 문단에서 이어서 입력하거나 잠시 기다리세요."); return; }
    renderer.selectPicture?.(null);
    const extended = event.shiftKey && anchor && (sameParagraph(anchor, next) || renderer.selectionRanges?.(anchor, next)) ? anchor : next;
    if (!sameParagraph(next, target)) {
      target = { section: next.section, paragraph: next.paragraph };
      committed = renderer.paragraph(next).text; input.value = committed;
    }
    target = paragraphTarget(next);
    setSelection(extended, next);
    input.disabled = false; updateReadOnly();
    input.focus({ preventScroll: true });
    drag = event.pointerId; dragScale = viewScale(); canvas.setPointerCapture(drag); paint();
    if (!controls.ready() && !controls.busy()) { report("편집 세션을 여는 중…"); controls.request({ kind: "enable", origin: "canvas" }); }
  });
  const release = event => { if (drag === event.pointerId) { drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); paint(); } };
  listen(canvas, "pointerup", release); listen(canvas, "pointercancel", release); listen(canvas, "lostpointercapture", release);
  const travel = kind => {
    if (!["undo", "redo"].includes(kind)) return false;
    if (!historyAvailable) { report("이 문서 형식은 실행 취소/다시 실행을 아직 지원하지 않습니다."); return false; }
    if (composing || pending || historyPending || (target && input.value !== committed) || !controls.ready() || controls.busy()) { report("입력 반영이 끝난 뒤 실행 취소/다시 실행하세요."); return false; }
    historyPending = true; input.readOnly = true;
    if (historyRevision !== null && anchor && focus) historySelections.remember(historyRevision, { anchor, focus });
    if (!controls.request({ kind, origin: "canvas" })) { historyPending = false; updateReadOnly(); return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const split = () => {
    if (!textEditable() && !(splitQueryAvailable && editRange() && splitPermission.allowed(editRange()))) {
      if (splitQueryAvailable && editRange()) report(splitPermission.pending(editRange()) ? "문단 분할 범위를 확인 중입니다. 확인 후 Enter를 다시 누르세요." : "이 범위는 문단을 분할할 수 없습니다.");
      return false;
    }
    if (!structureAvailable) { report("이 문서 형식의 문단 분할은 아직 지원하지 않습니다."); return false; }
    if (!target || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) { report("입력 반영이 끝난 뒤 문단을 분할하세요."); return false; }
    const unit = snapUnit(committed, input.selectionStart);
    const end = snapUnit(committed, input.selectionEnd, true);
    const position = sourceTextChange({ startUnit: unit, endUnit: end, text: "" }, renderer.paragraph(target)?.sourceOffsets);
    structureTarget = { kind: "split", ...paragraphTarget(target), paragraph: target.paragraph + 1 };
    historyPending = true; input.readOnly = false;
    const anchored = renderer.paragraph(target)?.anchoredSplitAvailable === true ? { anchored: true } : {};
    if (!controls.request({ kind: "split", origin: "canvas", ...target, ...anchored, atUnit: position.startUnit, endUnit: position.endUnit })) {
      structureTarget = null; historyPending = false; updateReadOnly(); return false;
    }
    input.setAttribute("aria-busy", "true"); return true;
  };
  const selectedCharacterPropertyRanges = () => {
    if (!multipleParagraphs() || renderer.characterPropertyRangesAvailable?.() !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const setCharacterProperties = properties => {
    if (multipleParagraphs()) {
      const ranges = selectedCharacterPropertyRanges();
      if (!ranges?.length) return false;
      pending = { kind: "character-properties-ranges", anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, properties: { ...properties } })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true"); return true;
    }
    const range = selectedRange();
    if (!range) return false;
    if (range.startUnit === range.endUnit) {
      if (!canSetTypingProperties()) return false;
      const previous = typingProperties && sameParagraph(typingProperties, target) ? typingProperties.properties : {};
      let merged;
      try { merged = mergeTypingProperties(previous, properties); } catch { return false; }
      typingProperties = { ...target, properties: merged };
      report("다음 입력의 글자 속성을 지정했습니다. 입력 전에는 문서가 변경되지 않습니다.");
      return true;
    }
    pending = { kind: "character-properties", start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind: "character-properties", origin: "canvas", ...range, properties: { ...properties } })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const replaceSelection = text => {
    if (!target || !anchor || !focus || typeof text !== "string" || !text.isWellFormed() || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return false;
    if (renderer.paragraphReplacementAvailable?.() === false) { report("현재 WASM은 문단 교체를 지원하지 않습니다."); return false; }
    const ranges = renderer.replacementRanges?.(anchor, focus);
    if (!ranges?.length || ranges.some(range => renderer.paragraph(range)?.editable !== true)) return false;
    const start = paragraphSelectionEdge(anchor, focus);
    const lines = normalizeParagraphReplacement(text).split("\n");
    const font = typingFont && sameParagraph(typingFont, target) ? typingFont : null;
    const properties = typingProperties && sameParagraph(typingProperties, target) ? { ...typingProperties.properties } : null;
    if (font && renderer.namedFontReplacementAvailable?.() !== true) { report("현재 WASM은 지정 글꼴의 문단 교체를 지원하지 않습니다."); return false; }
    if (properties && (font ? renderer.namedFontPropertyReplacementAvailable?.() : renderer.characterPropertyReplacementAvailable?.()) !== true) { report("현재 WASM은 입력 속성을 포함한 문단 교체를 지원하지 않습니다."); return false; }
    pending = { kind: "replace-paragraph-ranges", font, properties, anchor: { ...anchor }, focus: { ...focus }, target: { section: start.section, paragraph: start.paragraph + lines.length - 1 }, unit: lines.length === 1 ? start.unit + text.length : lines.at(-1).length };
    if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, text, ...(font ? { language: font.language, name: font.name } : {}), ...(properties ? { properties: { ...properties } } : {}) })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true"); return true;
  };
  // 후속 입력은 교체 성공 위치에만 적용하며 native 문서 값을 복제하지 않는다.
  const queueReplacementTyping = text => {
    if (pending?.kind !== "replace-paragraph-ranges") return false;
    return queueTyping(pending, text);
  };
  const queueTyping = (request, text) => {
    const queued = appendQueuedText(request.queuedText ?? "", text);
    if (!queued.accepted) return false;
    if (queued.overflow) { report("대기 입력 한도에 도달했습니다. 반영 후 다시 입력하세요."); return true; }
    request.queuedText = queued.text;
    return true;
  };
  const queueSplitTyping = text => structureTarget?.kind === "split" && historyPending && queueTyping(structureTarget, text);
  const selectedCharacterPropertyState = property => {
    if (multipleParagraphs()) {
      if (!["bold", "italic", "underline", "strike"].includes(property) || (property === "strike" && renderer.characterStrikeRangesAvailable?.() !== true) || (property === "underline" && renderer.characterUnderlineRangesAvailable?.() !== true) || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      return renderer.selectionCharacterState?.(anchor, focus, property) ?? null;
    }
    if (!selectedRange()) return null;
    if (property === "strike" && input.selectionStart === input.selectionEnd) return null;
    if (input.selectionStart === input.selectionEnd) {
      if (!canSetTypingProperties()) return null;
      const properties = typingProperties && sameParagraph(typingProperties, target) ? typingProperties.properties : null;
      return characterTypingState(committed, input.selectionStart, property, properties, (start, end, key) => renderer.characterState?.(target, start, end, key));
    }
    return renderer.characterState?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true), property) ?? null;
  };
  const setCharacterUnderline = underlineKind => {
    if (multipleParagraphs()) {
      if (renderer.characterUnderlineRangesAvailable?.() !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return false;
      const ranges = renderer.selectionRanges?.(anchor, focus);
      if (!ranges?.length) return false;
      pending = { kind: "character-underline-ranges", anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, underlineKind })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    }
    const range = selectedRange();
    if (!range || range.startUnit === range.endUnit) return false;
    pending = { kind: "character-underline", start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind: "character-underline", origin: "canvas", ...range, underlineKind })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const toggleCharacterProperty = property => {
    if (property === "strike") {
      if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return false;
      if (multipleParagraphs()) {
        if (renderer.characterStrikeRangesAvailable?.() !== true) return false;
        const state = selectedCharacterPropertyState(property);
        const ranges = renderer.selectionRanges?.(anchor, focus);
        if (state === null || !ranges?.length) return false;
        pending = { kind: "character-strike-ranges", anchor: { ...anchor }, focus: { ...focus } };
        if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, enabled: state !== true })) { pending = null; return false; }
        input.setAttribute("aria-busy", "true");
        return true;
      }
      const range = selectedRange();
      if (!range || range.startUnit === range.endUnit) return false;
      const state = selectedCharacterPropertyState(property);
      if (state === null) return false;
      pending = { kind: "character-strike", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ...range, enabled: state !== true })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    }
    if (multipleParagraphs()) {
      const state = selectedCharacterPropertyState(property);
      return state === null ? false : property === "underline" ? setCharacterUnderline(state === true ? "none" : "bottom") : setCharacterProperties({ [property]: state !== true });
    }
    if (!selectedRange()) return false;
    if (input.selectionStart === input.selectionEnd && ["bold", "italic"].includes(property)) {
      const state = selectedCharacterPropertyState(property);
      return state === null ? false : setCharacterProperties({ [property]: !state });
    }
    const properties = renderer.characterToggle?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true), property);
    if (!properties) return false;
    return property === "underline" ? setCharacterUnderline(properties.underline ? "bottom" : "none") : setCharacterProperties(properties);
  };
  const setCharacterColor = (kind, color) => {
    const range = selectedRange();
    if (!range || range.startUnit === range.endUnit) return false;
    pending = { kind, start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind, origin: "canvas", ...range, color })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const setCharacterUnderlineColor = color => setCharacterColor("character-underline-color", color);
  const selectedShadeRanges = () => {
    if (!multipleParagraphs()) { const range = selectedRange(); return range ? [range] : null; }
    if (renderer.characterShadeRangesAvailable?.() !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const selectedOutlineRanges = () => {
    if (!multipleParagraphs()) { const range = renderer.characterOutlineAvailable?.() === true ? selectedRange() : null; return range ? [range] : null; }
    if (renderer.characterOutlineRangesAvailable?.() !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    const ranges = renderer.selectionRanges?.(anchor, focus);
    try { encodeCharacterRanges(ranges); } catch { return null; }
    return ranges;
  };
  const selectedOutlineValue = (named = false) => {
    if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    if (multipleParagraphs()) return selectedOutlineRanges() ? renderer[named ? "characterOutlineKindState" : "characterOutlineState"]?.(anchor, focus) ?? null : null;
    if (!selectedRange() || input.selectionStart === input.selectionEnd) return null;
    return renderer[named ? "characterOutlineKind" : "characterOutline"]?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true)) ?? null;
  };
  const characterOutlineKindAvailable = kind => {
    let value;
    try { value = hwp5CharacterOutlineArg(kind); } catch { return false; }
    if (!selectedOutlineRanges()?.some(range => range.startUnit < range.endUnit)) return false;
    return value <= 1 || (multipleParagraphs() ? renderer.characterOutlineRangesExtendedAvailable?.() : renderer.characterOutlineExtendedAvailable?.()) === true;
  };
  const selectedEffectRanges = (exclusive = false) => {
    try { characterEffectMode(exclusive); } catch { return null; }
    if (multipleParagraphs()) {
      const available = exclusive ? renderer.characterEffectRangesExclusiveAvailable?.() : renderer.characterEffectRangesAvailable?.();
      if (available !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      const ranges = renderer.selectionRanges?.(anchor, focus);
      try { encodeCharacterRanges(ranges); } catch { return null; }
      return ranges;
    }
    if ((exclusive ? renderer.characterEffectExclusiveAvailable?.() : renderer.characterEffectAvailable?.()) !== true) return null;
    const range = selectedRange(); return range ? [range] : null;
  };
  const setCharacterShade = color => {
    if (renderer.characterShadeAvailable?.() !== true) return false;
    try { characterShadeArgs(color); } catch { return false; }
    if (multipleParagraphs()) {
      if (renderer.characterShadeRangesAvailable?.() !== true) return false;
      const ranges = selectedShadeRanges();
      if (!ranges?.some(range => range.startUnit < range.endUnit)) return false;
      pending = { kind: "character-shade-ranges", anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, color })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true"); return true;
    }
    return setCharacterColor("character-shade", color);
  };
  const setCharacterFont = (language, fontId) => {
    if (multipleParagraphs()) {
      const ranges = selectedFontRanges();
      if (!ranges?.some(range => range.startUnit < range.endUnit)) return false;
      pending = { kind: "character-font-ranges", anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, language, fontId })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    }
    if (renderer.characterFontAvailable?.() !== true) return false;
    const range = selectedRange();
    if (!range || range.startUnit === range.endUnit) return false;
    pending = { kind: "character-font", start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind: "character-font", origin: "canvas", ...range, language, fontId })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const setCharacterFontName = (language, name) => {
    if (multipleParagraphs()) {
      const ranges = selectedFontNameRanges();
      if (!ranges?.some(range => range.startUnit < range.endUnit)) return false;
      pending = { kind: "character-font-name-ranges", anchor: { ...anchor }, focus: { ...focus } };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, language, name })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    }
    const range = selectedRange();
    if (!range) return false;
    if (range.startUnit === range.endUnit) {
      if (renderer.namedFontTextAvailable?.() !== true || !textEditable()) return false;
      if (typingProperties && renderer.namedFontPropertyTextAvailable?.() !== true) return false;
      try { characterFontNameArgs(language, name); } catch { return false; }
      typingFont = { ...target, language, name };
      report("다음 입력의 글꼴을 지정했습니다. 입력 전에는 문서가 변경되지 않습니다.");
      return true;
    }
    if (renderer.characterFontNameAvailable?.() !== true) return false;
    pending = { kind: "character-font-name", start: input.selectionStart, end: input.selectionEnd };
    if (!controls.request({ kind: pending.kind, origin: "canvas", ...range, language, name })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true");
    return true;
  };
  const selectedFontRanges = () => {
    if (!multipleParagraphs()) { const range = selectedRange(); return range ? [range] : null; }
    if (renderer.characterFontRangesAvailable?.() !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const selectedFontNameRanges = () => {
    if (!multipleParagraphs()) {
      const range = selectedRange();
      if (range?.startUnit === range?.endUnit && !textEditable()) return null;
      return range;
    }
    if (renderer.characterFontNameRangesAvailable?.() !== true || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const selectedTextColorRanges = () => {
    if (!multipleParagraphs()) { const range = selectedRange(); return range ? [range] : null; }
    if (renderer.textColorRangesAvailable?.() === false) return null;
    if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
    return renderer.selectionRanges?.(anchor, focus) ?? null;
  };
  const setCharacterTextColor = color => {
    if (!multipleParagraphs()) return setCharacterColor("character-text-color", color);
    const ranges = selectedTextColorRanges();
    if (!ranges?.some(range => range.startUnit < range.endUnit)) return false;
    pending = { kind: "character-text-color-ranges", anchor: { ...anchor }, focus: { ...focus } };
    if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, color })) { pending = null; return false; }
    input.setAttribute("aria-busy", "true"); return true;
  };
  const mergeBoundary = backward => {
    if (!textEditable()) return false;
    if (!target || input.selectionStart !== input.selectionEnd || input.selectionStart !== (backward ? 0 : input.value.length)) return false;
    if (!mergeAvailable) return false;
    if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return true;
    const current = renderer.paragraph(target);
    const neighbor = backward ? current?.previousMergeParagraph : current?.nextMergeParagraph;
    if (neighbor === null) return true;
    const explicit = Number.isInteger(neighbor);
    const left = { ...paragraphTarget(target), paragraph: backward ? (explicit ? neighbor : target.paragraph - 1) : target.paragraph };
    const rightParagraph = backward ? target.paragraph : (explicit ? neighbor : target.paragraph + 1);
    const paragraph = renderer.paragraph(left);
    if (!paragraph || !renderer.paragraph({ ...left, paragraph: rightParagraph })) return true;
    structureTarget = { kind: "merge", ...left, unit: paragraph.text.length };
    historyPending = true; input.readOnly = true;
    if (!controls.request({ kind: "merge", origin: "canvas", ...left, ...(explicit ? { rightParagraph } : {}) })) {
      structureTarget = null; historyPending = false; updateReadOnly();
    } else input.setAttribute("aria-busy", "true");
    return true;
  };
  listen(input, "beforeinput", event => {
    if (structureTarget?.kind === "split" && historyPending) {
      event.preventDefault();
      if (!event.isComposing && !composing && ["insertText", "insertReplacementText"].includes(event.inputType)) queueSplitTyping(event.data);
      return;
    }
    if (!target || !controls.ready() || historyPending) { event.preventDefault(); return; }
    if (["historyUndo", "historyRedo"].includes(event.inputType)) { event.preventDefault(); travel(event.inputType === "historyUndo" ? "undo" : "redo"); return; }
    if (pending?.kind === "replace-paragraph-ranges" && !multipleParagraphs()) {
      event.preventDefault();
      if (!event.isComposing && !composing && event.inputType === "insertText") queueReplacementTyping(event.data);
      return;
    }
    if (multipleParagraphs()) {
      if (multiComposition && composing) return;
      event.preventDefault();
      if (event.isComposing || composing) return;
      if (["insertText", "insertReplacementText", "insertFromPaste"].includes(event.inputType) && typeof event.data === "string") {
        if (event.inputType !== "insertText" || !queueReplacementTyping(event.data)) replaceSelection(event.data);
      }
      else if (["insertLineBreak", "insertParagraph"].includes(event.inputType)) replaceSelection("\n");
      else if (["deleteContentBackward", "deleteContentForward", "deleteByCut"].includes(event.inputType)) replaceSelection("");
      return;
    }
    if (event.inputType === "insertFromPaste" && typeof event.data === "string" && /[\r\n]/.test(event.data)) {
      event.preventDefault(); sync(); replaceSelection(event.data); return;
    }
    if (["insertLineBreak", "insertParagraph"].includes(event.inputType)) { event.preventDefault(); split(); return; }
    if (!textEditable()) { event.preventDefault(); return; }
    if (!pending && !composing && input.value === committed) {
      sync(); draftSelection = { anchor: { ...anchor }, focus: { ...focus } };
    }
    if (["deleteContentBackward", "deleteContentForward"].includes(event.inputType) && mergeBoundary(event.inputType === "deleteContentBackward")) { event.preventDefault(); return; }
    if (["insertLineBreak", "insertParagraph"].includes(event.inputType)) { event.preventDefault(); split(); }
  });
  listen(input, "input", () => {
    if (!target) return;
    if (multiComposition && composing) {
      const projected = compositionProjection();
      if (!projected) { report("조합 문자열의 표시 경계를 확인할 수 없습니다."); return; }
      renderer.preview(projected.draft);
      paint(); return;
    }
    if (!textEditable()) {
      if (typeof queryEditRange === "function" && renderer.paragraph(target)?.selectable && !multipleParagraphs()) { updateReadOnly(); return; }
      input.value = committed; sync(); return;
    }
    preview(); if (!composing) pump();
  });
  listen(input, "compositionstart", () => {
    if (!target || !controls.ready()) return;
    if (historyPending) { input.readOnly = true; report("문단 변경 반영 뒤 조합 입력을 시작하세요."); return; }
    if (multipleParagraphs()) {
      if (!multiCompositionAvailable() || pending || historyPending || controls.busy() || input.value !== committed) return;
      multiComposition = { anchor: { ...anchor }, focus: { ...focus } };
      input.value = ""; input.setSelectionRange(0, 0); composing = true; paint(); return;
    }
    if (!textEditable()) return;
    if (!pending && input.value === committed) {
      sync(); draftSelection = { anchor: { ...anchor }, focus: { ...focus } };
    }
    composing = true; paint();
  });
  listen(input, "compositionend", event => {
    if (!composing) return;
    if (multiComposition) {
      const selected = multiComposition;
      const text = typeof event.data === "string" ? event.data : input.value;
      multiComposition = null; composing = false; input.value = committed; renderer.preview(null);
      setSelection(selected.anchor, selected.focus);
      if (text) replaceSelection(text);
      return;
    }
    composing = false; preview(); queueMicrotask(pump);
  });
  listen(input, "keydown", event => {
    if (!target || composing || event.isComposing || event.keyCode === 229) return;
    const navigation = navigationIntent(event, platform);
    const key = navigation?.key ?? event.key;
    if (structureTarget?.kind === "split" && historyPending && !event.metaKey && !event.ctrlKey && !event.altKey && Array.from(key).length === 1 && key.isWellFormed()) {
      event.preventDefault(); queueSplitTyping(key); return;
    }
    if ((multipleParagraphs() || pending?.kind === "replace-paragraph-ranges") && !event.metaKey && !event.ctrlKey && !event.altKey && Array.from(key).length === 1 && key.isWellFormed()) {
      event.preventDefault(); if (!queueReplacementTyping(key)) replaceSelection(key); return;
    }
    if (multipleParagraphs() && !event.metaKey && !event.ctrlKey && !event.altKey && ["Backspace", "Delete"].includes(key)) {
      event.preventDefault(); replaceSelection(""); return;
    }
    if (multipleParagraphs() && (event.metaKey || event.ctrlKey) && !event.altKey && ["c", "x"].includes(key.toLowerCase())) {
      event.preventDefault();
      const text = renderer.selectionText?.(anchor, focus);
      if (typeof text !== "string" || pending || historyPending || input.value !== committed) return;
      if (!globalThis.navigator?.clipboard?.writeText) { report("이 환경에서는 시스템 클립보드를 사용할 수 없습니다."); return; }
      const a = anchor, f = focus;
      navigator.clipboard.writeText(text).then(() => {
        if (anchor !== a || focus !== f) return;
        if (key.toLowerCase() === "x") replaceSelection("");
        else report("여러 문단 선택 복사 완료");
      }, () => report("클립보드 쓰기가 거부되었습니다."));
      return;
    }
    if (multipleParagraphs() && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
      if (!navigation) return;
      event.preventDefault();
      if (pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return;
      if (event.shiftKey) {
        const paragraph = renderer.paragraph(focus);
        if (!paragraph || !navigation) return;
        const next = extendedNavigation(key, navigation.paragraphEdge, true, navigation.word);
        if (next && renderer.selectionRanges?.(next.anchor, next.focus)) {
          setSelection(next.anchor, next.focus, next.preferredX); reveal();
        }
        return;
      }
      const point = key === "ArrowLeft" || key === "ArrowRight" ? paragraphSelectionEdge(anchor, focus, key === "ArrowRight") : focus;
      if (!point || !renderer.paragraph(point)) return;
      target = paragraphTarget(point);
      committed = renderer.paragraph(target).text; input.value = committed;
      setSelection(point, point);
      if (key !== event.key) {
        const next = extendedNavigation(key, navigation.paragraphEdge, false, navigation.word);
        if (next) setSelection(next.anchor, next.focus, next.preferredX);
      }
      reveal(); return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && !event.defaultPrevented && ["b", "i", "u"].includes(key.toLowerCase())) {
      event.preventDefault();
      if (event.repeat) return;
      toggleCharacterProperty({ b: "bold", i: "italic", u: "underline" }[key.toLowerCase()]);
      return;
    }
    if (key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey && renderer.paragraph(target)?.tableCell) {
      if (pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) { event.preventDefault(); report("입력 반영이 끝난 뒤 셀을 이동하세요."); return; }
      const next = renderer.adjacentCell?.(target, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      target = paragraphTarget(next);
      committed = renderer.paragraph(target).text; input.value = committed;
      updateReadOnly(); setSelection(next, next); reveal(); return;
    }
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") {
      event.preventDefault(); setSelection({ ...target, unit: 0 }, { ...target, unit: input.value.length }); reveal(); return;
    }
    if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(key.toLowerCase())) { event.preventDefault(); travel(key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo"); return; }
    if (key === "Enter") { event.preventDefault(); if (multipleParagraphs()) replaceSelection("\n"); else split(); return; }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && ["Backspace", "Delete"].includes(key) && mergeBoundary(key === "Backspace")) { event.preventDefault(); return; }
    if (!navigation) return;
    event.preventDefault();
    const next = extendedNavigation(key, navigation.paragraphEdge, event.shiftKey === true, navigation.word);
    if (!next) return;
    if (!event.shiftKey && !sameParagraph(target, next.focus)) {
      target = paragraphTarget(next.focus);
      committed = renderer.paragraph(target).text; input.value = committed;
    }
    setSelection(next.anchor, next.focus, next.preferredX);
    reveal();
  });
  listen(input, "keyup", sync); listen(input, "select", sync);
  for (const kind of ["copy", "cut"]) listen(input, kind, event => {
    if (!multipleParagraphs()) return;
    event.preventDefault();
    const text = renderer.selectionText?.(anchor, focus);
    if (typeof text !== "string" || !event.clipboardData || pending || composing || historyPending || input.value !== committed) return;
    event.clipboardData.setData("text/plain", text);
    if (kind === "cut") replaceSelection("");
  });
  listen(input, "paste", event => {
    const text = event.clipboardData?.getData("text/plain");
    if (structureTarget?.kind === "split" && historyPending) { event.preventDefault(); if (!queueSplitTyping(text)) report("문단 분할 반영 뒤 여러 줄을 붙여넣으세요."); return; }
    if (!multipleParagraphs() && (typeof text !== "string" || !/[\r\n]/.test(text))) return;
    event.preventDefault();
    if (!multipleParagraphs()) sync();
    if (typeof text === "string") replaceSelection(text);
  });
  listen(input, "focus", paint); listen(input, "blur", paint);
  const selectedRange = () => {
      if (!target || multipleParagraphs() || composing || pending || historyPending || !controls.ready() || controls.busy() || input.value !== committed) return null;
      const startUnit = snapUnit(committed, input.selectionStart);
      const endUnit = snapUnit(committed, input.selectionEnd, true);
      const range = sourceTextChange({ startUnit, endUnit, text: "" }, renderer.paragraph(target)?.sourceOffsets);
      return { section: target.section, paragraph: target.paragraph, startUnit: range.startUnit, endUnit: range.endUnit };
  };
  const canSetTypingProperties = () => Boolean(selectedRange()) && input.selectionStart === input.selectionEnd && textEditable() && renderer.characterPropertyTextAvailable?.() === true && (!typingFont || renderer.namedFontPropertyTextAvailable?.() === true);
  const resetExternalSelection = controller => {
    if (historyRevision !== null && anchor && focus) historySelections.remember(historyRevision, { anchor, focus });
    const available = historyAvailable, structure = structureAvailable, merge = mergeAvailable, splitQuery = splitQueryAvailable;
    controller.reset({ preserveHistory: true });
    historyAvailable = available; structureAvailable = structure; mergeAvailable = merge; splitQueryAvailable = splitQuery;
  };
  return {
    selectTextRange({ section, paragraph, startUnit, endUnit }) {
      if (composing || pending || historyPending || drag !== null || input.value !== committed || controls.busy()) return false;
      const next = { section, paragraph }, row = renderer.paragraph(next);
      if (!row || row.clipped || !selectableText(row) || ![startUnit, endUnit].every(Number.isInteger) || startUnit < 0 || endUnit < startUnit || endUnit > row.text.length) return false;
      if (snapUnit(row.text, startUnit) !== startUnit || snapUnit(row.text, endUnit) !== endUnit) return false;
      if (!caretGeometry(renderer.layout(), { ...next, unit: startUnit })) return false;
      target = next; committed = row.text; input.value = committed; input.disabled = false;
      setSelection({ ...next, unit: startUnit }, { ...next, unit: endUnit });
      input.focus({ preventScroll: true }); paint(); reveal();
      return true;
    },
    replaceSelection,
    replaceSelectedText(text) {
      if (typeof text !== "string" || !text.isWellFormed()) return false;
      if (/[\r\n]/.test(text) || multipleParagraphs()) return replaceSelection(text);
      if (!target || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy() || !textEditable()) return false;
      const start = snapUnit(committed, input.selectionStart), end = snapUnit(committed, input.selectionEnd, true);
      const next = committed.slice(0, start) + text + committed.slice(end);
      if (next === committed) return true;
      const previous = { anchor: { ...anchor }, focus: { ...focus } };
      draftSelection = previous;
      input.value = next;
      input.setSelectionRange(start + text.length, start + text.length);
      pump({ startUnit: start, endUnit: end, text });
      if (!pending) { input.value = committed; draftSelection = null; setSelection(previous.anchor, previous.focus); return false; }
      preview();
      return true;
    },
    selectedRange,
    selectedCharacterPropertyState,
    selectedCharacterPropertyRanges,
    selectedCharacterSize() {
      if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      if (multipleParagraphs()) return renderer.selectionCharacterSize?.(anchor, focus) ?? null;
      if (!selectedRange()) return null;
      if (input.selectionStart === input.selectionEnd) {
        const properties = typingProperties && sameParagraph(typingProperties, target) ? typingProperties.properties : null;
        return characterTypingSize(committed, input.selectionStart, properties, (start, end) => renderer.characterSize?.(target, start, end));
      }
      return renderer.characterSize?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true)) ?? null;
    },
    canSetTypingProperties,
    toggleCharacterProperty,
    selectedParagraphFormat() {
      if (!target || multipleParagraphs() || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      const paragraph = renderer.paragraph(target);
      return !paragraph?.clipped && Number.isInteger(paragraph?.paraShapeId) ? { ...target, paraShapeId: paragraph.paraShapeId, paragraphShape: paragraph.paragraphShape ? { ...paragraph.paragraphShape } : undefined } : null;
    },
    setParagraphFormat(paraShapeId) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: "paragraph-format", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: "paragraph-format", origin: "canvas", section: paragraph.section, paragraph: paragraph.paragraph, paraShapeId })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    setParagraphAlignment(alignment) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: "paragraph-alignment", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: "paragraph-alignment", origin: "canvas", section: paragraph.section, paragraph: paragraph.paragraph, alignment })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    setParagraphSpacing(type, value) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: "paragraph-spacing", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: "paragraph-spacing", origin: "canvas", section: paragraph.section, paragraph: paragraph.paragraph, type, value })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    setParagraphMargins(margins) {
      const paragraph = this.selectedParagraphFormat();
      if (!paragraph) return false;
      pending = { kind: "paragraph-margins", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: "paragraph-margins", origin: "canvas", section: paragraph.section, paragraph: paragraph.paragraph, margins })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    formatSelection(charShapeId) {
      const range = selectedRange();
      if (!range || range.startUnit === range.endUnit) return false;
      pending = { kind: "format", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: "format", origin: "canvas", ...range, charShapeId })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    setCharacterProperties,
    setCharacterUnderline,
    setCharacterUnderlineColor,
    setCharacterShade,
    setCharacterOutline(kind) {
      if (!characterOutlineKindAvailable(kind)) return false;
      if (multipleParagraphs()) {
        const ranges = selectedOutlineRanges();
        if (!ranges?.some(range => range.startUnit < range.endUnit)) return false;
        pending = { kind: "character-outline-ranges", anchor: { ...anchor }, focus: { ...focus } };
        if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, outlineKind: kind })) { pending = null; return false; }
        input.setAttribute("aria-busy", "true"); return true;
      }
      if (renderer.characterOutlineAvailable?.() !== true) return false;
      const range = selectedRange();
      if (!range || range.startUnit === range.endUnit) return false;
      pending = { kind: "character-outline", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ...range, outlineKind: kind })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true"); return true;
    },
    selectedCharacterOutline: () => selectedOutlineValue(),
    selectedCharacterOutlineKind: () => selectedOutlineValue(true),
    selectedOutlineRanges,
    characterOutlineKindAvailable,
    setCharacterEffect(effect, enabled, exclusive = false) {
      try { characterEffectArgs(effect, enabled); characterEffectMode(exclusive); } catch { return false; }
      const ranges = selectedEffectRanges(exclusive);
      if (!ranges?.some(range => range.startUnit < range.endUnit)) return false;
      if (multipleParagraphs()) {
        pending = { kind: "character-effect-ranges", anchor: { ...anchor }, focus: { ...focus } };
        if (!controls.request({ kind: pending.kind, origin: "canvas", ranges, effect, enabled, ...(exclusive ? { exclusive: true } : {}) })) { pending = null; return false; }
        input.setAttribute("aria-busy", "true"); return true;
      }
      const range = ranges[0];
      pending = { kind: "character-effect", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: pending.kind, origin: "canvas", ...range, effect, enabled, ...(exclusive ? { exclusive: true } : {}) })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true"); return true;
    },
    selectedEffectRanges,
    selectedCharacterEffect(effect) {
      if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      if (multipleParagraphs()) return renderer.characterEffectState?.(anchor, focus, effect) ?? null;
      if (!selectedRange() || input.selectionStart === input.selectionEnd) return null;
      return renderer.characterEffect?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true), effect) ?? null;
    },
    selectedShadeRanges,
    selectedCharacterFontIds(language) {
      if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      if (multipleParagraphs()) return renderer.selectionFontIds?.(anchor, focus, language) ?? null;
      if (!selectedRange()) return null;
      if (input.selectionStart === input.selectionEnd) {
        if (typingFont && sameParagraph(typingFont, target)) return null;
        const span = typingSourceSpan(committed, input.selectionStart);
        return span ? renderer.characterFontIds?.(target, span.start, span.end, language) ?? null : null;
      }
      return renderer.characterFontIds?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true), language) ?? null;
    },
    selectedCharacterShade() {
      if (composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      if (multipleParagraphs()) return renderer.characterShadeState?.(anchor, focus) ?? null;
      if (!selectedRange() || input.selectionStart === input.selectionEnd) return null;
      return renderer.characterShade?.(target, snapUnit(committed, input.selectionStart), snapUnit(committed, input.selectionEnd, true)) ?? null;
    },
    setCharacterFont,
    setCharacterFontName,
    selectedCharacterRange: selectedRange,
    selectedFontRanges,
    selectedFontNameRanges,
    setCharacterTextColor,
    selectedTextColorRanges,
    selectedCell() {
      if (!target || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      return renderer.cell?.(target) ?? null;
    },
    selectedFormula() {
      if (!target || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      return renderer.formula?.(target) ?? null;
    },
    setCellSize(width, height) {
      const cell = this.selectedCell();
      if (!cell) return false;
      pending = { kind: "cell-size", start: input.selectionStart, end: input.selectionEnd };
      if (!controls.request({ kind: "cell-size", origin: "canvas", section: cell.section, listNode: cell.listNode, width, height })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    selectedPicture() {
      if (!pictureResizeAvailable || composing || pending || historyPending || input.value !== committed || !controls.ready() || controls.busy()) return null;
      return pictureResizeTarget(renderer.selectedPicture?.());
    },
    resizePicture(width, height) {
      const picture = this.selectedPicture();
      if (!picture || ![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 0xffffffff)) return false;
      pending = { kind: "picture-resize" };
      if (!controls.request({ kind: "picture-resize", origin: "canvas", section: picture.section, pictureNode: picture.resizeRecordNode ?? picture.pictureNode, width, height })) { pending = null; return false; }
      input.setAttribute("aria-busy", "true");
      return true;
    },
    settled: () => !composing && !pending && !historyPending && (!target || input.value === committed),
    canHistory: () => historyAvailable && !composing && !pending && !historyPending && (!target || input.value === committed) && controls.ready() && !controls.busy(),
    history: travel,
    reset({ preserveHistory = false } = {}) {
      if (events.signal.aborted) return;
      if (!preserveHistory) pictureResizeAvailable = false;
      renderer.selectPicture?.(null);
      rangePermission.invalidate();
      splitPermission.invalidate();
      typingFont = null;
      typingProperties = null;
      draftSelection = null;
      if (drag !== null && canvas.hasPointerCapture(drag)) canvas.releasePointerCapture(drag);
      composing = false; multiComposition = null; drag = null; target = null; pending = null; anchor = null; focus = null; committed = ""; preferredX = null;
      historyAvailable = false; historyPending = false; structureAvailable = false; mergeAvailable = false; structureTarget = null;
      splitQueryAvailable = false;
      if (!preserveHistory) { historyRevision = null; historySelections.reset(); }
      input.value = ""; input.disabled = true; input.setAttribute("aria-busy", "false"); canvas.style.cursor = "default"; report(""); renderer.preview(null); paint();
    },
    external(message) {
      if (events.signal.aborted) return;
      if (message.kind === "set-edit-window") return;
      if (message.origin !== "canvas" && !["enable", "save"].includes(message.kind)) {
        resetExternalSelection(this);
      }
    },
    message(message) {
      if (events.signal.aborted) return;
      if (message.kind === "set-edit-window") {
        if (!message.error) resetExternalSelection(this);
        return;
      }
      if (message.kind === "enable" && !message.error) pictureResizeAvailable = message.pictureResizeAvailable === true;
      if (message.kind === "query-split-range") {
        if (!splitPermission.accept(message) && !splitPermission.reject(message)) return;
        if (message.error) report(`문단 분할 범위를 확인하지 못했습니다: ${message.error}`);
        updateReadOnly();
        return;
      }
      if (message.kind === "query-edit-range") {
        if (!rangePermission.accept(message) && !rangePermission.reject(message)) return;
        if ((!message.allowed || message.error) && input.value !== committed) { input.value = committed; sync(); report("이 범위는 편집할 수 없습니다."); }
        if (message.error) report(`입력 범위를 확인하지 못했습니다: ${message.error}`);
        updateReadOnly();
        if (message.allowed && !message.error && input.value !== committed) { preview(); pump(); }
        return;
      }
      if (message.kind !== "save") rangePermission.invalidate();
      if (message.kind !== "save") splitPermission.invalidate();
      const revision = message.historyRevision;
      const versioned = Number.isInteger(revision) && revision >= 0 && revision < 0xffffffff;
      const travelMessage = ["undo", "redo"].includes(message.kind);
      const revisionChanged = versioned && revision !== historyRevision;
      if (versioned && !message.error && !travelMessage && historyRevision !== null && revisionChanged && anchor && focus) {
        historySelections.remember(historyRevision, pending?.beforeSelection ?? (pending?.anchor ? { anchor: pending.anchor, focus: pending.focus } : { anchor, focus }));
      }
      try {
      if (["undo", "redo", "merge"].includes(message.kind)) { typingFont = null; typingProperties = null; }
      if (message.kind === "save") { pump(); return; }
      if (message.applied && message.error) { this.reset(); return; }
      if (message.origin === "canvas" && message.kind === "picture-resize" && pending?.kind === "picture-resize") {
        pending = null; input.setAttribute("aria-busy", "false");
        report(message.error ? `그림 크기 변경 실패: ${message.error}` : "그림 크기를 변경했습니다.");
        return;
      }
      if (message.kind === "enable") { if (!message.error) { historyAvailable = message.historyAvailable === true; structureAvailable = message.structureAvailable === true; splitQueryAvailable = message.splitQueryAvailable === true; mergeAvailable = message.mergeAvailable === true; } updateReadOnly(); report(message.error ? `편집 시작 실패: ${message.error}` : "클릭·드래그 선택 후 입력하세요. 변경 후 재조판이 필요합니다."); pump(); return; }
      if (message.origin === "canvas" && structureTarget && message.kind === structureTarget.kind) {
        const queued = structureTarget.queuedText ?? "";
        const next = message.kind === "split" && message.splitTarget ? { ...structureTarget, ...message.splitTarget } : structureTarget; structureTarget = null; historyPending = false;
        updateReadOnly(); input.setAttribute("aria-busy", "false");
        const operation = message.kind === "merge" ? "병합" : "분할";
        if (message.error) { report(structureErrorMessage(operation, message.error) + (queued ? " · 대기 입력은 적용되지 않았습니다." : "")); return; }
        if (message.kind === "split" && Object.hasOwn(message, "splitTarget") && (!message.splitTarget || message.splitTarget.section !== target.section || !Number.isInteger(message.splitTarget.paragraph) || message.splitTarget.paragraph <= target.paragraph)) {
          this.reset(); report("문단 분할은 적용됐지만 새 문단 위치를 확인할 수 없어 직접 입력을 중단했습니다." + (queued ? " 대기 입력은 적용되지 않았습니다." : "")); return;
        }
        const paragraph = renderer.paragraph(next);
        if (!paragraph?.editable && !paragraph?.selectable) { this.reset(); report(`문단 ${operation}은 적용됐지만 표시 한도로 직접 입력을 중단했습니다.${queued ? " 대기 입력은 적용되지 않았습니다." : ""}`); return; }
        if (message.kind === "split" && typingFont && sameParagraph(typingFont, target)) typingFont = { ...paragraphTarget(next), language: typingFont.language, name: typingFont.name };
        if (message.kind === "split" && typingProperties && sameParagraph(typingProperties, target)) typingProperties = { ...paragraphTarget(next), properties: { ...typingProperties.properties } };
        target = paragraphTarget(next); committed = paragraph.text; input.value = committed; renderer.preview(null);
        const unit = snapUnit(committed, Math.min(next.unit ?? 0, committed.length));
        setSelection({ ...target, unit }, { ...target, unit }); reveal();
        if (queued && textEditable()) {
          input.value = committed.slice(0, unit) + queued + committed.slice(unit);
          input.setSelectionRange(unit + queued.length, unit + queued.length);
          preview(); pump();
        }
        report(`문단 ${operation} 적용 · 재조판 필요${queued && !textEditable() ? " · 보호된 문단의 대기 입력은 적용되지 않았습니다." : ""}`); return;
      }
      if (["undo", "redo"].includes(message.kind) && message.origin === "canvas" && historyPending) {
        historyPending = false; updateReadOnly(); input.setAttribute("aria-busy", "false");
        if (message.error) { report(`실행 취소/다시 실행 실패: ${message.error}`); return; }
        const restored = versioned && message.changed ? historySelections.selection(revision) : null;
        const restoredParagraph = restored && renderer.paragraph(restored.focus);
        const restoredRanges = restored && (sameParagraph(restored.anchor, restored.focus)
          ? paragraphSelectionRanges([restoredParagraph], restored.anchor, restored.focus, () => "single", { sourcePositions: false, includeEmpty: true })
          : renderer.selectionRanges?.(restored.anchor, restored.focus));
        if (restored && selectableText(restoredParagraph) && restoredRanges && caretGeometry(renderer.layout(), restored.anchor) && caretGeometry(renderer.layout(), restored.focus)) {
          target = paragraphTarget(restored.focus);
          committed = renderer.paragraph(target).text; input.value = committed; renderer.preview(null);
          setSelection(restored.anchor, restored.focus); reveal();
          report("실행 취소/다시 실행 적용 · 재조판 필요"); return;
        }
        if (versioned && message.changed) {
          const available = historyAvailable, structure = structureAvailable, merge = mergeAvailable, splitQuery = splitQueryAvailable;
          this.reset({ preserveHistory: true });
          historyAvailable = available; structureAvailable = structure; mergeAvailable = merge; splitQueryAvailable = splitQuery;
          report("이력은 적용됐지만 원래 선택 위치를 확인할 수 없습니다. 문단을 클릭해 입력을 이어가세요."); return;
        }
        if (!target) { report(message.changed ? "실행 취소/다시 실행 적용 · 재조판 필요" : "이동할 편집 이력이 없습니다."); return; }
        const paragraph = renderer.paragraph(target);
        if (!selectableText(paragraph)) { this.reset(); return; }
        const a = anchor?.unit ?? 0, f = focus?.unit ?? 0;
        const multi = multipleParagraphs() ? { anchor: { ...anchor }, focus: { ...focus } } : null;
        committed = paragraph.text; input.value = committed; renderer.preview(null);
        if (multi && renderer.selectionRanges?.(multi.anchor, multi.focus)) setSelection(multi.anchor, multi.focus);
        else setSelection({ ...target, unit: snapUnit(committed, Math.min(a, committed.length)) }, { ...target, unit: snapUnit(committed, Math.min(f, committed.length)) });
        report(message.changed ? "실행 취소/다시 실행 적용 · 재조판 필요" : "이동할 편집 이력이 없습니다."); return;
      }
      if (message.origin !== "canvas" || !pending || !target || message.kind !== pending.kind) return;
      const previous = pending; pending = null; input.setAttribute("aria-busy", "false");
      if (previous.kind === "replace-paragraph-ranges") {
        if (message.error) { setSelection(previous.anchor, previous.focus); report(`교체 실패: ${message.error}${previous.queuedText ? " · 대기 입력도 적용되지 않았습니다." : ""}`); return; }
        const paragraph = renderer.paragraph(previous.target);
        if (!paragraph?.editable || paragraph.clipped) { this.reset(); report("교체는 적용됐지만 표시 범위에서 입력을 계속할 수 없습니다."); return; }
        typingFont = previous.font ? { ...previous.target, language: previous.font.language, name: previous.font.name } : null;
        typingProperties = previous.properties ? { ...previous.target, properties: { ...previous.properties } } : null;
        target = previous.target; committed = paragraph.text; input.value = committed; renderer.preview(null);
        const unit = snapUnit(committed, Math.min(previous.unit, committed.length));
        setSelection({ ...target, unit }, { ...target, unit }); reveal();
        report("선택 교체 적용 · 재조판 필요");
        if (previous.queuedText) {
          input.value = committed.slice(0, unit) + previous.queuedText + committed.slice(unit);
          input.setSelectionRange(unit + previous.queuedText.length, unit + previous.queuedText.length);
          preview(); pump();
        }
        return;
      }
      if (["character-properties-ranges", "character-outline-ranges", "character-effect-ranges", "character-strike-ranges", "character-underline-ranges", "character-text-color-ranges", "character-shade-ranges", "character-font-ranges", "character-font-name-ranges"].includes(previous.kind)) {
        setSelection(previous.anchor, previous.focus);
        report(message.error ? `서식은 적용되지 않았습니다: ${message.error}` : "여러 문단 서식 적용 · 재조판 필요");
        return;
      }
      if (message.error) {
        if (previous.kind === "splice-font-name") typingFont = null;
        if (["splice-font-name", "splice-character-properties"].includes(previous.kind)) typingProperties = null;
        if (["format", "character-properties", "character-outline", "character-effect", "character-strike", "character-underline", "character-underline-color", "character-text-color", "character-shade", "character-font", "character-font-name"].includes(previous.kind) && input.value !== committed) {
          report(`서식은 적용되지 않았습니다: ${message.error}`);
          preview(); pump(); return;
        }
        input.value = committed; renderer.preview(null);
        const restored = previous.beforeSelection;
        setSelection(restored?.anchor ?? { ...target, unit: snapUnit(committed, previous.start) }, restored?.focus ?? { ...target, unit: snapUnit(committed, previous.end, true) });
        report(`입력이 적용되지 않았습니다: ${message.error}`); return;
      }
      const paragraph = renderer.paragraph(target);
      if (!selectableText(paragraph)) { this.reset(); report("표시 한도에 도달해 직접 입력을 중단했습니다. 적용된 변경은 native 모델에 유지됩니다."); return; }
      committed = paragraph.text;
      report("변경 적용 · 재조판 필요"); preview(); pump();
      } finally {
        if (versioned && !message.error) {
          historyRevision = revision;
          if (message.historyRevisions !== undefined) {
            try { historySelections.retain(message.historyRevisions, revision); }
            catch {
              const available = historyAvailable, structure = structureAvailable, merge = mergeAvailable, splitQuery = splitQueryAvailable;
              this.reset(); historyAvailable = available; structureAvailable = structure; mergeAvailable = merge; splitQueryAvailable = splitQuery;
              report("문서 이력 응답의 선택 정보를 확인할 수 없습니다. 문단을 다시 선택하세요.");
              return;
            }
          }
          if (revisionChanged && !travelMessage) historySelections.remember(revision, anchor && focus ? { anchor, focus } : null);
        }
      }
    },
    close() { if (events.signal.aborted) return; this.reset(); events.abort(); renderer.onGeometry(() => {}); },
  };
}
