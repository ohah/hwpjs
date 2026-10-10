import { createRenderer } from "./renderer.mjs";
import { detectDocumentFormat } from "../../js/document-format.mjs";
import { createInspectorToggle } from "./inspector-toggle.mjs";
import { createFindControls } from "./find-controls.mjs";
import { createCharacterFontControls } from "./character-font-controls.mjs";
import { createCharacterFontNameControls } from "./character-font-name-controls.mjs";
import { createSystemFontControls } from "./system-font-controls.mjs";
import { createCharacterEffectControls } from "./character-effect-controls.mjs";
import { createCharacterOutlineControls } from "./character-outline-controls.mjs";
import { bindFileInput } from "./file-input-events.mjs";
import { createFixtureControls } from "./fixture-controls.mjs";
import { updateGroupedLayoutStatus } from "./grouped-layout-status.mjs";
import { updatePageLayoutStatus } from "./page-layout-status.mjs";
import { createPageStatusControls } from "./page-status-controls.mjs";
import { createDocumentMenuControls } from "./document-menu-controls.mjs";
import { createViewScaleControls } from "./view-scale-controls.mjs";
import { createDocumentWindowControls } from "./document-window-controls.mjs";
import { createPictureRequests } from "./picture-requests.mjs";
import { clipText } from "./content.mjs";
import { createEditorControls } from "./editor-controls.mjs";
import { createCanvasEditor } from "./canvas-editor.mjs";
import { downloadDocument } from "./document-download.mjs";
import { failureMessage } from "./failure-message.mjs";
import { guardGeneration } from "./worker-generation.mjs";
import { createHistoryControls } from "./history-controls.mjs";
import { createSaveControls } from "./save-controls.mjs";
import { createPasswordControls } from "./password-controls.mjs";
import { createCellSizeControls } from "./cell-size-controls.mjs";
import { createPictureSizeControls } from "./picture-size-controls.mjs";
import { createPictureResizeControls } from "./picture-resize-controls.mjs";
import { createFormulaControls } from "./formula-controls.mjs";
import { createCheckBoxCanvasControls } from "./checkbox-canvas-controls.mjs";
let formulaControls;
import { createCellResizeControls } from "./cell-resize-controls.mjs";
import { createParagraphFormatControls } from "./paragraph-format-controls.mjs";
import { createParagraphMarginControls } from "./paragraph-margin-controls.mjs";
let paragraphMarginControls;
import { createParagraphSpacingControls } from "./paragraph-spacing-controls.mjs";
import { createCharacterPropertyControls } from "./character-property-controls.mjs";
import { createUnderlineColorControls } from "./underline-color-controls.mjs";
import { createCharacterColorControls } from "./character-color-controls.mjs";
import { createCharacterShadeControls } from "./character-shade-controls.mjs";
let underlineColorControls;
let characterPropertyControls;
let paragraphSpacingControls;
const input = document.querySelector("#file"), status = document.querySelector("#status");
const accessible = document.querySelector("#accessible");
const inspector = createInspectorToggle({ button: document.querySelector("#inspector-toggle"), panel: document.querySelector("#document-inspector") });
let pageStatusControls, documentMenuControls, viewScaleControls, documentWindowControls;
const renderer = createRenderer(document.querySelector("#canvas"), document.querySelector("#viewport"), document.querySelector("#spacer"), layout => {
  document.querySelector("#limit").hidden = !layout.limited;
  const note = document.querySelector("#picture-status"), coverage = layout.pictureCoverage;
  note.hidden = !coverage?.total;
  note.textContent = coverage?.total ? `그림 배치 대상 ${coverage.eligible}/${coverage.total} · 보류 ${coverage.pending}개 · 이미지 해독 ${coverage.decoded}개 · 자원 실패 ${coverage.failed}개 · 대기 ${coverage.loading}개 (실제 표시 성공·원본 페이지 조판과는 별도입니다.)` : "";
  updateGroupedLayoutStatus(document.querySelector("#group-status"), layout);
  updatePageLayoutStatus(document.querySelector("#page-layout-status"), layout);
  pageStatusControls?.refresh();
});
pageStatusControls = createPageStatusControls({ node: document.querySelector("#visible-page-status"), viewport: document.querySelector("#viewport"), layout: () => renderer.layout(), resizeTarget: window, viewScale: () => renderer.viewScale() });
window.addEventListener("pagehide", event => { if (!event.persisted) pageStatusControls.close(); });
let worker, generation = 0, openedFormat = null, direct, historyControls, passwordControls, cellSizeControls, pictureSizeControls, pictureResizeControls, cellResizeControls, paragraphFormatControls;
const findControls = createFindControls({ form: document.querySelector("#find-form"), input: document.querySelector("#find-input"), note: document.querySelector("#find-status"), search: query => renderer.findText(query), select: range => { const selected = direct?.selectTextRange(range) === true; if (selected) updateSave(); return selected; }, replaceButton: document.querySelector("#replace-found"), replacement: document.querySelector("#replace-input"), replace: text => { const accepted = direct?.replaceSelectedText(text) === true; updateSave(); return accepted; }, shortcuts: window, scope: document.querySelector("#viewport") });
window.addEventListener("pagehide", event => { if (!event.persisted) findControls.close(); });
const pictureRequests = createPictureRequests(message => { if (!worker) throw new Error("PictureReadUnavailable"); worker.postMessage(message); });
renderer.pictureReader((section, node) => pictureRequests.read(section, node));
window.addEventListener("pagehide", event => { if (!event.persisted) pictureRequests.reset(); });
const download = document.querySelector("#download"), staleLayout = document.querySelector("#allow-stale-layout"), downloadStatus = document.querySelector("#download-status");
function updateSave() {
  const enabled = Boolean(worker) && controls.ready() && !controls.busy() && direct.settled();
  download.disabled = !enabled || passwordControls?.allowed() === false;
  staleLayout.disabled = !enabled || openedFormat === "hwpx";
  historyControls?.update();
  cellSizeControls?.update();
  pictureSizeControls?.update();
  formulaControls?.update();
  paragraphFormatControls?.update();
  paragraphMarginControls?.update();
  paragraphSpacingControls?.update();
  characterPropertyControls?.update();
  underlineColorControls?.update();
  documentMenuControls?.refresh();
  viewScaleControls?.refresh();
  documentWindowControls?.refresh();
}
const controls = createEditorControls(message => { direct.external(message); worker?.postMessage(message); updateSave(); }, { formatSelection: id => direct.formatSelection(id) });
direct = createCanvasEditor({ canvas: document.querySelector("#canvas"), viewport: document.querySelector("#viewport"), input: document.querySelector("#canvas-input"), renderer, controls, note: document.querySelector("#canvas-edit-status"), queryEditRange: message => worker?.postMessage(message), querySplitRange: message => worker?.postMessage(message) });
formulaControls = createFormulaControls({ form: document.querySelector("#formula-form"), fields: document.querySelector("#formula-fields"), choices: document.querySelector("#formula-choice"), input: document.querySelector("#formula-input"), note: document.querySelector("#formula-status"), ready: () => Boolean(worker) && controls.ready() && !controls.busy() && direct.settled(), request: message => controls.request(message) });
const checkBoxControls = createCheckBoxCanvasControls({ canvas: document.querySelector("#canvas"), viewport: document.querySelector("#viewport"), renderer, note: document.querySelector("#canvas-edit-status"), ready: () => Boolean(worker) && controls.ready() && !controls.busy() && direct.settled(), request: message => controls.request(message) });
const colorControls = [
  createCharacterOutlineControls({ kind: document.querySelector("#canvas-outline-kind"), apply: document.querySelector("#canvas-outline-apply"), current: document.querySelector("#canvas-outline-current"), note: document.querySelector("#canvas-outline-status"), selected: () => direct.selectedOutlineRanges(), selectedState: () => direct.selectedCharacterOutlineKind(), canRequestKind: kind => direct.characterOutlineKindAvailable(kind), request: kind => direct.setCharacterOutline(kind) }),
  createCharacterEffectControls({ buttons: document.querySelectorAll("[data-effect]"), note: document.querySelector("#canvas-effect-status"), selectedState: effect => direct.selectedCharacterEffect(effect), request: (effect, enabled) => direct.setCharacterEffect(effect, enabled, true), availability: "characterEffectExclusiveAvailable", rangesAvailability: "characterEffectRangesExclusiveAvailable", canRequest: () => direct.selectedEffectRanges(true)?.some(range => range.startUnit < range.endUnit) === true }),
  createSystemFontControls({ readButton: document.querySelector("#canvas-system-font-read"), select: document.querySelector("#canvas-system-font"), note: document.querySelector("#canvas-system-font-status"), read: window.isSecureContext && typeof window.queryLocalFonts === "function" ? () => window.queryLocalFonts() : undefined, choose: name => { const input = document.querySelector("#canvas-font-name"); input.value = name; input.dispatchEvent(new Event("input")); } }),
  createCharacterShadeControls({ input: document.querySelector("#canvas-shade-color"), apply: document.querySelector("#canvas-shade-apply"), remove: document.querySelector("#canvas-shade-remove"), note: document.querySelector("#canvas-shade-status"), current: document.querySelector("#canvas-shade-current"), selectedState: () => direct.selectedCharacterShade(), selected: () => direct.selectedShadeRanges(), request: color => direct.setCharacterShade(color) }),
  createCharacterFontControls({ language: document.querySelector("#canvas-font-language"), font: document.querySelector("#canvas-font"), apply: document.querySelector("#canvas-font-apply"), note: document.querySelector("#canvas-font-status"), category: document.querySelector("#canvas-font-category"), selectedIds: language => direct.selectedCharacterFontIds(language), selected: () => direct.selectedFontRanges(), request: (language, id) => direct.setCharacterFont(language, id) }),
  createCharacterFontNameControls({ language: document.querySelector("#canvas-font-language"), name: document.querySelector("#canvas-font-name"), apply: document.querySelector("#canvas-font-name-apply"), note: document.querySelector("#canvas-font-name-status"), selected: () => direct.selectedFontNameRanges(), request: (language, name) => direct.setCharacterFontName(language, name) }),
  createUnderlineColorControls({ input: document.querySelector("#canvas-underline-color"), apply: document.querySelector("#canvas-underline-color-apply"), note: document.querySelector("#canvas-underline-color-status"), selected: () => direct.selectedRange(), request: color => direct.setCharacterUnderlineColor(color) }),
  createCharacterColorControls({ input: document.querySelector("#canvas-text-color"), apply: document.querySelector("#canvas-text-color-apply"), note: document.querySelector("#canvas-text-color-status"), selected: () => direct.selectedTextColorRanges(), request: color => direct.setCharacterTextColor(color), availability: "characterTextColorAvailable", kind: "character-text-color", additionalKinds: ["character-text-color-ranges"], label: "글자색", success: "글자색 적용" }),
];
underlineColorControls = {
  update() { for (const controls of colorControls) controls.update(); },
  reset() { for (const controls of colorControls) controls.reset(); },
  message(message) { for (const controls of colorControls) controls.message(message); },
  close() { for (const controls of colorControls) controls.close(); },
};
paragraphFormatControls = createParagraphFormatControls({ form: document.querySelector("#paragraph-format-form"), fields: document.querySelector("#paragraph-format-fields"), id: document.querySelector("#paragraph-shape-id"), choices: document.querySelector("#paragraph-shape-select"), note: document.querySelector("#paragraph-format-status"), selected: () => direct.selectedParagraphFormat(), request: id => direct.setParagraphFormat(id), alignmentButtons: document.querySelectorAll("[data-alignment]"), requestAlignment: alignment => direct.setParagraphAlignment(alignment) });
paragraphMarginControls = createParagraphMarginControls({
  form: document.querySelector("#paragraph-margin-form"), fields: document.querySelector("#paragraph-margin-fields"),
  inputs: Object.fromEntries(["left", "right", "indent", "before", "after"].map(name => [name, document.querySelector(`#paragraph-margin-${name}`)])),
  note: document.querySelector("#paragraph-margin-status"), selected: () => direct.selectedParagraphFormat(), request: margins => direct.setParagraphMargins(margins),
});
paragraphSpacingControls = createParagraphSpacingControls({ form: document.querySelector("#paragraph-spacing-form"), fields: document.querySelector("#paragraph-spacing-fields"), type: document.querySelector("#paragraph-spacing-type"), value: document.querySelector("#paragraph-spacing-value"), note: document.querySelector("#paragraph-spacing-status"), selected: () => direct.selectedParagraphFormat(), request: (type, value) => direct.setParagraphSpacing(type, value) });
characterPropertyControls = createCharacterPropertyControls({ form: document.querySelector("#character-property-form"), fields: document.querySelector("#character-property-fields"), size: document.querySelector("#character-property-size"), bold: document.querySelector("#character-property-bold"), italic: document.querySelector("#character-property-italic"), note: document.querySelector("#character-property-status"), selected: () => direct.selectedRange(), selectedRanges: () => direct.selectedCharacterPropertyRanges(), request: properties => direct.setCharacterProperties(properties), boldToggle: document.querySelector("#canvas-bold-toggle"), italicToggle: document.querySelector("#canvas-italic-toggle"), underlineToggle: document.querySelector("#canvas-underline-toggle"), strikeToggle: document.querySelector("#canvas-strike-toggle"), selectedState: property => direct.selectedCharacterPropertyState(property), selectedSize: () => direct.selectedCharacterSize(), toggle: property => direct.toggleCharacterProperty(property), canType: () => direct.canSetTypingProperties() });
cellResizeControls = createCellResizeControls({ canvas: document.querySelector("#canvas"), viewport: document.querySelector("#viewport"), renderer,
  selected: () => direct.selectedCell(), request: (width, height) => direct.setCellSize(width, height), note: document.querySelector("#cell-size-status") });
cellSizeControls = createCellSizeControls({
  form: document.querySelector("#cell-size-form"), fields: document.querySelector("#cell-size-fields"),
  width: document.querySelector("#cell-width"), height: document.querySelector("#cell-height"), note: document.querySelector("#cell-size-status"),
  selected: () => direct.selectedCell(), request: (width, height) => direct.setCellSize(width, height),
});
pictureSizeControls = createPictureSizeControls({ form: document.querySelector("#picture-size-form"), fields: document.querySelector("#picture-size-fields"), width: document.querySelector("#picture-width"), height: document.querySelector("#picture-height"), note: document.querySelector("#picture-size-status"), active: () => controls.ready(), selected: () => direct.selectedPicture(), request: (width, height) => direct.resizePicture(width, height) });
pictureResizeControls = createPictureResizeControls({ canvas: document.querySelector("#canvas"), viewport: document.querySelector("#viewport"), renderer, selected: () => direct.selectedPicture(), request: (width, height) => direct.resizePicture(width, height), note: document.querySelector("#picture-size-status") });
for (const node of [document.querySelector("#canvas"), document.querySelector("#canvas-input")]) {
  for (const event of ["pointerup", "keyup"]) node.addEventListener(event, () => pictureSizeControls.update());
    for (const event of ["pointerup", "keyup"]) node.addEventListener(event, () => { formulaControls.selectCanvas(direct.selectedFormula()); cellSizeControls.update(); paragraphFormatControls.update(); paragraphMarginControls.update(); paragraphSpacingControls.update(); characterPropertyControls.update(); underlineColorControls.update(); });
}
historyControls = createHistoryControls({ undo: document.querySelector("#undo"), redo: document.querySelector("#redo"), canRequest: () => Boolean(worker) && direct.canHistory(), request: kind => direct.history(kind) });
controls.reset();
direct.reset();
underlineColorControls.reset();
const saveControls = createSaveControls({
  button: download, keyboard: window, active: () => Boolean(worker),
  canRequest: () => { updateSave(); return !download.disabled; },
  request: () => {
    const sent = controls.request({ kind: "save", origin: "download", allowStaleLayout: staleLayout.checked, allowUnprotectedOutput: document.querySelector("#allow-unprotected-output").checked });
    if (sent) downloadStatus.textContent = "저장 중…";
    return sent;
  },
  reportBlocked: () => { downloadStatus.textContent = passwordControls?.allowed() === false ? "비밀번호 보호 해제 다운로드에 동의한 뒤 저장하세요." : "편집 세션과 입력 처리가 준비된 뒤 저장하세요."; },
});
passwordControls = createPasswordControls({
  form: document.querySelector("#password-form"), input: document.querySelector("#document-password"),
  submit: document.querySelector("#password-submit"), cancel: document.querySelector("#password-cancel"), note: document.querySelector("#password-status"),
  consentPanel: document.querySelector("#password-output-consent"), consent: document.querySelector("#allow-unprotected-output"), update: updateSave,
  request: message => { try { if (!worker) throw new Error("PasswordDocumentNotLoaded"); worker.postMessage(message); } finally { delete message.password; } },
onCancel: () => { generation++; pictureRequests.reset(); worker?.terminate(); worker = null; input.value = ""; controls.reset(); direct.reset(); formulaControls.reset(); cellSizeControls.reset(); cellResizeControls.reset(); paragraphFormatControls.reset(); paragraphMarginControls.reset(); paragraphSpacingControls.reset(); characterPropertyControls.reset(); underlineColorControls.reset(); renderer.clear(); accessible.value = ""; status.textContent = "비밀번호 입력을 취소했습니다."; updateSave(); },
});
for (const event of ["input", "compositionstart", "compositionend"]) document.querySelector("#canvas-input").addEventListener(event, updateSave);
async function openSelectedFile(selected) {
  const epoch = ++generation;
  findControls.reset();
  pictureRequests.reset();
  worker?.terminate(); worker = null; openedFormat = null;
  documentWindowControls?.reset();
  direct.reset();
  renderer.clear(); accessible.value = "";
  controls.reset();
  cellSizeControls.reset();
  pictureSizeControls.reset();
  pictureResizeControls.reset();
  formulaControls.reset();
  cellResizeControls.reset();
  paragraphFormatControls.reset();
  paragraphMarginControls.reset();
  paragraphSpacingControls.reset();
  characterPropertyControls.reset();
  underlineColorControls.reset();
  passwordControls.reset();
  staleLayout.checked = false; updateSave(); downloadStatus.textContent = "편집 세션을 연 뒤 다운로드할 수 있습니다.";
  if (!selected) { status.textContent = "파일을 선택하세요."; return; }
  if (selected.size > 64 * 1024 * 1024) { status.textContent = "오류: 파일은 64 MiB 이하여야 합니다."; return; }
  status.textContent = `${selected.name} 읽는 중…`;
  try {
    const bytes = await selected.arrayBuffer();
    if (epoch !== generation) return;
    const format = detectDocumentFormat(bytes);
    openedFormat = format;
    const job = new Worker(new URL("./reader-worker.mjs", import.meta.url), { type: "module" });
    worker = job;
    const fail = message => { if (epoch !== generation) return; pictureRequests.reset(); direct.reset(); controls.reset(); formulaControls.reset(); cellSizeControls.reset(); cellResizeControls.reset(); paragraphFormatControls.reset(); paragraphMarginControls.reset(); paragraphSpacingControls.reset(); characterPropertyControls.reset(); underlineColorControls.reset(); renderer.clear(); accessible.value = ""; status.textContent = `오류: ${message}`; job.terminate(); worker = null; generation++; updateSave(); };
    job.onerror = guardGeneration(() => generation, epoch, event => { fail(event.message || "읽기 worker 오류"); });
    job.onmessage = guardGeneration(() => generation, epoch, event => {
      // Window queries are not full editable document responses.
      // Navigation must consume them explicitly before replacing Canvas state.
      if (["query-window", "query-edit-window"].includes(event.data.kind)) return;
      documentWindowControls?.message(event.data);
      if (["query-edit-range", "query-split-range"].includes(event.data.kind)) { direct.message(event.data); return; }
      if (pictureRequests.message(event.data)) return;
      cellResizeControls.message(event.data);
      formulaControls.message(event.data);
      checkBoxControls.message(event.data);
      paragraphFormatControls.message(event.data);
      paragraphMarginControls.message(event.data);
      paragraphSpacingControls.message(event.data);
      characterPropertyControls.message(event.data);
      underlineColorControls.message(event.data);
      queueMicrotask(updateSave);
      passwordControls.message(event.data);
      if (event.data.kind !== "load" && event.data.kind !== "unlock") controls.message(event.data);
      if (event.data.kind === "save") {
        if (event.data.error) downloadStatus.textContent = `저장 실패: ${event.data.error}`;
        else {
          try { downloadDocument(event.data, selected.name); downloadStatus.textContent = `편집본 다운로드 요청 완료${event.data.passwordProtectionRemoved ? " · 비밀번호 보호 없음" : ""} · 원본 조판 정보는 재계산되지 않았습니다.`; }
          catch (error) { downloadStatus.textContent = `다운로드 실패: ${failureMessage(error)}`; }
        }
        direct.message(event.data);
        return;
      }
      if (event.data.error) {
        direct.message(event.data);
        cellSizeControls.message(event.data);
        pictureSizeControls.message(event.data);
        pictureResizeControls.message(event.data);
        paragraphFormatControls.update();
        if (event.data.kind === "load" && event.data.passwordRequired) { status.textContent = `${selected.name} · 문서 비밀번호가 필요합니다.`; passwordControls.required(); }
        else if (event.data.kind === "load") fail(event.data.error);
        else if (event.data.applied) { renderer.clear(); accessible.value = ""; }
        return;
      }
      if (!event.data.content) { direct.message(event.data); cellSizeControls.message(event.data); pictureSizeControls.message(event.data); pictureResizeControls.message(event.data); paragraphFormatControls.update(); return; }
      try {
        const initial = event.data.kind === "load" || event.data.kind === "unlock";
        const content = event.data.content, layout = renderer.show(content, { preserveScroll: !initial && event.data.kind !== "set-edit-window" });
        accessible.value = clipText(content.paragraphs.map(p => `${p.label}\n${p.text}`).join("\n\n"), 50000);
        const formatLabel = content.format === "hwpx" ? `HWPX · ${content.readOnly ? "읽기 전용" : "제한적 텍스트 편집 실험"}` : `HWP ${content.version}${content.readOnly ? " · 배포용 읽기 전용" : ""}`;
        status.textContent = `${selected.name} · ${formatLabel}${content.passwordProtectionRemoved ? " · 비밀번호로 열림 (저장은 보호 해제)" : ""} · ${content.totalParagraphs}문단 · 텍스트 미리보기${layout.limited ? " · 표시 한도에 도달해 일부만 표시" : ""}`;
        if (initial) passwordControls.loaded(content);
        if (initial && (!content.readOnly || content.distributionEditingAvailable)) controls.loaded({ distribution: content.distributionEditingAvailable === true });
        if (event.data.kind === "load" && content.primarySource === "distribution_viewtext") downloadStatus.textContent = content.distributionEditingAvailable ? "배포용 문서입니다. 편집 시작 버튼으로 제한적 편집을 선택할 수 있으며 저장 시 배포 플래그와 재조판 경고를 유지합니다." : "배포용 문서는 이 WASM에서 읽기 전용입니다.";
        direct.message(event.data);
        cellSizeControls.message(event.data);
        pictureSizeControls.message(event.data);
        pictureResizeControls.message(event.data);
        paragraphFormatControls.update();
      } catch (error) { fail(failureMessage(error)); }
    });
    job.postMessage({ kind: "load", format, bytes }, [bytes]);
  } catch (error) { if (epoch === generation) status.textContent = `오류: ${failureMessage(error)}`; }
}
bindFileInput(input, () => openSelectedFile(input.files[0]));
const fixtureControls = createFixtureControls({ select: document.querySelector("#demo-fixture"), button: document.querySelector("#demo-fixture-open"), open: selected => openSelectedFile(selected) });
window.addEventListener("pagehide", event => { if (!event.persisted) { fixtureControls.close(); generation++; worker?.terminate(); inspector.close(); passwordControls.close(); saveControls.close(); historyControls.close(); cellSizeControls.close(); cellResizeControls.close(); paragraphMarginControls.close(); paragraphSpacingControls.close(); characterPropertyControls.close(); underlineColorControls.close(); direct.close(); renderer.close(); } });
viewScaleControls = createViewScaleControls({ node: document.querySelector("#view-scale"), renderer, ready: () => Boolean(worker) && openedFormat !== null && !controls.busy() && direct.settled() });
window.addEventListener("pagehide", event => { if (!event.persisted) viewScaleControls.close(); });
documentWindowControls = createDocumentWindowControls({
  form: document.querySelector("#document-window-form"), start: document.querySelector("#document-window-start"),
  count: document.querySelector("#document-window-count"), apply: document.querySelector("#document-window-apply"),
  restore: document.querySelector("#document-window-restore"), note: document.querySelector("#document-window-status"),
  ready: () => Boolean(worker) && openedFormat === "hwpx" && controls.ready() && !controls.busy() && direct.settled(),
  request: message => controls.request(message),
});
window.addEventListener("pagehide", event => { if (!event.persisted) documentWindowControls.close(); });
documentMenuControls = createDocumentMenuControls([
  { button: document.querySelector("#menu-open"), target: input },
  { button: document.querySelector("#menu-save"), target: download },
  { button: document.querySelector("#menu-undo"), target: document.querySelector("#undo") },
  { button: document.querySelector("#menu-redo"), target: document.querySelector("#redo") },
  { button: document.querySelector("#menu-properties"), target: document.querySelector("#inspector-toggle") },
  { button: document.querySelector("#menu-bold"), target: document.querySelector("#canvas-bold-toggle") },
  { button: document.querySelector("#menu-italic"), target: document.querySelector("#canvas-italic-toggle") },
  { button: document.querySelector("#menu-underline"), target: document.querySelector("#canvas-underline-toggle") },
  { button: document.querySelector("#menu-strike"), target: document.querySelector("#canvas-strike-toggle") },
]);
window.addEventListener("pagehide", event => { if (!event.persisted) { checkBoxControls.close(); pictureResizeControls.close(); pictureSizeControls.close(); documentMenuControls.close(); } });
