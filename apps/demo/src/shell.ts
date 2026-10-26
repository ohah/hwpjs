import {createDocumentOpenUI,exampleAvailability} from './document-open-ui.ts';
import {VIEW_ZOOM_LEVELS,isMenuZoomPercent} from './view-zoom.ts';
import {DocumentOpenCancelledError} from './document-open-consent.ts';
import type { DemoAction, DemoCommand, DemoFixture, DemoFramework, DemoShellOptions, DemoTraceEntry } from "./shell-contract.ts";
import { actionAvailability, demoRoute, fontSizePoints } from "./shell-model.ts";

const frameworks: readonly [DemoFramework, string][] = [["headless", "Headless"], ["vanilla", "Vanilla"], ["react", "React"], ["svelte", "Svelte"]];
const commands: readonly [DemoCommand, string, string][] = [
  ["save", "저장하기", "↓"], ["cut", "오려두기", "✂"], ["copy", "복사하기", "▤"], ["paste", "붙이기", "▣"],
  ["format-copy", "모양 복사", "◇"], ["find", "찾기", "⌕"], ["insert-shape", "도형", "△"], ["insert-image", "그림", "▧"],
  ["insert-table", "표", "▦"], ["insert-chart", "차트", "▥"], ["insert-footnote", "각주", "¹"], ["insert-endnote", "미주", "ⅰ"],
  ["insert-link", "하이퍼링크", "↗"], ["insert-symbol", "문자표", "Ω"], ["character-properties", "글자 모양", "가"],
  ["paragraph-properties", "문단 모양", "≡"], ["object-properties", "개체 속성", "□"], ["insert-header", "머리말", "⊤"],
  ["insert-footer", "꼬리말", "⊥"], ["toggle-marks", "조판 부호", "¶"], ["toggle-paragraph-marks", "문단 부호", "↵"], ["toggle-grid", "격자 보기", "▦"],
];
const menus: readonly [string, readonly DemoCommand[]][] = [
  ["파일", ["save"]], ["편집", ["undo", "redo", "cut", "copy", "paste", "format-copy", "find", "replace"]],
  ["보기", ["zoom-in", "zoom-out", "toggle-marks", "toggle-paragraph-marks", "toggle-grid"]], ["입력", ["insert-image", "insert-table", "insert-shape", "insert-link", "insert-symbol"]],
  ["서식", ["bold", "italic", "underline", "strike", "character-properties", "paragraph-properties"]],
  ["쪽", ["insert-header", "insert-footer"]], ["표", ["insert-table", "object-properties"]],
  ["검토", ["insert-comment"]], ["도구", ["word-count"]],
];
const labels = new Map<DemoCommand, string>([...commands.map(([id, label]) => [id, label] as [DemoCommand, string]),
  ["zoom-in", "확대"], ["zoom-out", "축소"], ["undo", "실행 취소"], ["redo", "다시 실행"], ["replace", "찾아 바꾸기"], ["bold", "굵게"], ["italic", "기울임"], ["underline", "밑줄"], ["strike", "취소선"], ["align-left", "왼쪽 정렬"], ["align-center", "가운데 정렬"], ["align-right", "오른쪽 정렬"], ["align-justify", "양쪽 정렬"], ["set-font-size", "글자 크기"], ["set-zoom", "확대"], ["insert-comment", "메모"], ["word-count", "문서 통계"]]);
let instance = 0;

/** Import is side-effect free. Call only at the platform mount boundary.
 * The returned surfaceMount is owned by the public vanilla/React/Svelte host.
 * The shell never creates Canvas/input/Worker, loads bytes, or stores selection.
 * Caller imports shell.css, injects the catalog, subscribes update() to core,
 * mounts the real host and detaches that host before destroy().
 */
export function createDemoShell(root: HTMLElement, options: DemoShellOptions) {
  // Validate before touching the host DOM.
  const routes = frameworks.map(([id, label]) => ({ id, label, href: demoRoute(options.routes[id]) }));
  exampleAvailability(options.fixtures); // Validate before touching host DOM.
  const doc = root.ownerDocument, prefix = `hwp-demo-${++instance}`;
  let closed = false;
  const removals: (() => void)[] = [];
  const listen = (node: EventTarget, type: string, handler: (event: Event) => void) => {
    node.addEventListener(type, handler); removals.push(() => node.removeEventListener(type, handler));
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node;
  };
  const shell = el("section", "hwp-demo"); shell.setAttribute("aria-label", "HWP 문서 편집기 데모");
  shell.dataset.framework = options.framework;
  const titlebar = el("header", "hwp-demo-titlebar");
  const brand = el("span", "hwp-demo-brand", "H"); brand.setAttribute("aria-hidden", "true");
  const title = el("h1", "hwp-demo-title");
  const frameworkNav = el("nav", "hwp-demo-frameworks"); frameworkNav.setAttribute("aria-label", "실제 프레임워크 예제");
  for (const route of routes) {
    const link = el("a", "", route.label); link.href = route.href;
    if (route.id === options.framework) link.setAttribute("aria-current", "page");
    frameworkNav.append(link);
  }
  titlebar.append(brand, title, frameworkNav);
  const reason = el("p", "hwp-demo-reason"); reason.id = `${prefix}-reason`; reason.setAttribute("role", "status"); reason.setAttribute("aria-live", "polite");
  const announce = (text: string) => { if (!closed) reason.textContent = text; };
  const reportError = (error: unknown) => {
    if (closed) return;
    announce(error instanceof DocumentOpenCancelledError?"":"요청을 완료하지 못했습니다. 문서 상태를 확인하세요.");
    // An error reporter must not turn an asynchronous UI intent into an
    // unhandled rejection or recursively notify itself.
    try { options.onError?.(error); } catch { /* Reporter failure is contained. */ }
  };
  const invoke = (callback: () => void | Promise<void>) => {
    if (closed) return;
    try {
      const result = callback();
      if (result && typeof result.then === "function") result.catch(reportError);
    } catch (error) { reportError(error); }
  };
  const availabilityNodes: { command: DemoCommand; node: HTMLButtonElement | HTMLInputElement | HTMLSelectElement; description: HTMLElement }[] = [];
  const bindCommand = (node: HTMLButtonElement | HTMLInputElement | HTMLSelectElement, command: DemoCommand) => {
    const description = el("span", "hwp-demo-sr"); description.id = `${prefix}-command-${availabilityNodes.length}`;
    node.setAttribute("aria-describedby", description.id); node.dataset.command = command;
    availabilityNodes.push({ node, command, description }); return description;
  };
  const dispatch = (action: DemoAction) => invoke(() => {
    const available = actionAvailability(options.getState(), action.command, Boolean(options.onAction));
    if (closed) return;
    if (!available.enabled) { announce(available.reason || "현재 사용할 수 없습니다."); return; }
    return options.onAction?.(action);
  });
  const commandButton = (command: DemoCommand, label = labels.get(command) || command, icon?: string) => {
    const node = el("button", icon ? "hwp-demo-tool" : "hwp-demo-button"); node.type = "button";
    node.setAttribute("aria-label", label);
    if (icon) { const symbol = el("span", "hwp-demo-symbol", icon); symbol.setAttribute("aria-hidden", "true"); node.append(symbol); }
    node.append(el("span", "", label));
    const description = bindCommand(node, command);
    // Pointer toolbar interaction retains the host's selection/focus. Keyboard
    // activation is still a normal button click; the bridge revalidates tokens.
    listen(node, "pointerdown", event => { if ((event as PointerEvent).button === 0 && !node.disabled) event.preventDefault(); });
    listen(node, "click", () => dispatch({ command } as DemoAction));
    return { node, description };
  };
  const menuNav = el("nav", "hwp-demo-menus"); menuNav.setAttribute("aria-label", "문서 메뉴");
  const zoomChoices: {node:HTMLButtonElement;percent:number}[] = [];
  const disclosures: { details: HTMLDetailsElement; summary: HTMLElement; popup: HTMLElement }[] = [];
  for (const [label, items] of menus) {
    const details = el("details", "hwp-demo-menu"), summary = el("summary", "", label), popup = el("div", "hwp-demo-popup");
    popup.id = `${prefix}-menu-${disclosures.length}`; summary.setAttribute("aria-controls", popup.id);
    for (const id of items) { const button = commandButton(id); popup.append(button.node, button.description); listen(button.node, "click", () => { details.open = false; }); }
    if (label === "보기") {
      const scales=el("details","hwp-demo-zoom-menu"),heading=el("summary","","배율"),choices=el("div","hwp-demo-zoom-choices");
      for(const percent of VIEW_ZOOM_LEVELS){const button=el("button","hwp-demo-button",`${percent}%`);button.type="button";button.dataset.zoomPercent=String(percent);const description=bindCommand(button,"set-zoom");zoomChoices.push({node:button,percent});listen(button,"click",()=>{details.open=false;dispatch({command:"set-zoom",percent});});choices.append(button,description);}
      scales.append(heading,choices);popup.append(scales);
    }
    details.append(summary, popup); disclosures.push({ details, summary, popup }); menuNav.append(details);
    listen(details, "toggle", () => { summary.setAttribute("aria-expanded", String(details.open)); if (details.open) for (const row of disclosures) if (row.details !== details) row.details.open = false; });
    summary.setAttribute("aria-expanded", "false");
    listen(details, "keydown", event => { if ((event as KeyboardEvent).key === "Escape") { event.preventDefault(); details.open = false; summary.focus(); } });
  }
  listen(doc, "pointerdown", event => { if (!menuNav.contains(event.target as Node)&&!openUI.containsExampleTarget(event.target as Node)) for (const row of disclosures) row.details.open = false; });
  const toolbar = el("div", "hwp-demo-tools"); toolbar.setAttribute("role", "group"); toolbar.setAttribute("aria-label", "문서 도구");
  for (const [id, label, icon] of commands) { const item = commandButton(id, label, icon); toolbar.append(item.node, item.description); }
  const formatbar = el("div", "hwp-demo-formatbar"); formatbar.setAttribute("role", "group"); formatbar.setAttribute("aria-label", "글자와 문단 서식");
  for (const id of ["undo", "redo"] as const) { const item = commandButton(id); formatbar.append(item.node, item.description); }
  const style = el("output", "hwp-demo-format-label"), font = el("output", "hwp-demo-format-label");
  style.setAttribute("aria-label", "현재 스타일"); font.setAttribute("aria-label", "현재 글꼴");
  const sizeForm = el("form", "hwp-demo-size"), sizeLabel = el("label", "", "크기 (pt)"), size = el("input");
  size.type = "text"; size.inputMode = "decimal"; size.maxLength = 12; size.id = `${prefix}-font-size`; sizeLabel.htmlFor = size.id;
  size.setAttribute("aria-label", "글자 크기 (pt)");
  const applySize = el("button", "hwp-demo-button", "적용"); applySize.type = "submit";
  const sizeDescription = bindCommand(size, "set-font-size"), applyDescription = bindCommand(applySize, "set-font-size");
  sizeForm.append(sizeLabel, size, applySize, sizeDescription, applyDescription);
  listen(sizeForm, "submit", event => { event.preventDefault(); if (closed) return; const points = fontSizePoints(size.value); if (points === null) { announce("글자 크기는 0보다 크고 4096 이하인 pt 값으로 소수 둘째 자리까지 입력하세요."); return; } dispatch({ command: "set-font-size", points }); });
  formatbar.append(style, font, sizeForm);
  for (const [id, label] of [["bold", "굵게"], ["italic", "기울임"], ["underline", "밑줄"], ["strike", "취소선"], ["align-left", "왼쪽 정렬"], ["align-center", "가운데 정렬"], ["align-right", "오른쪽 정렬"], ["align-justify", "양쪽 정렬"]] as const) {
    const item = commandButton(id, label); formatbar.append(item.node, item.description);
  }
  const picker=el('div','hwp-demo-file-options');picker.dataset.role='save-options-mount';
  const openUI=createDocumentOpenUI(shell,{id:prefix,fixtures:options.fixtures,getState:options.getState,
    fileConnected:Boolean(options.onOpenFile),fixtureConnected:Boolean(options.onOpenFixture),
    onSelected:()=>{disclosures[0].details.open=false;disclosures[0].summary.focus();},
    onFile:file=>invoke(()=>options.onOpenFile?.(file)),onFixture:id=>invoke(()=>options.onOpenFixture?.(id))});
  const fileActions=el('div','hwp-demo-file-actions');fileActions.append(openUI.fileAction,openUI.examplesAction,openUI.fileReason);
  disclosures[0].popup.className+=' hwp-demo-file-popup';disclosures[0].popup.append(fileActions,picker);
  shell.append(openUI.file);
  const support=el('details','hwp-demo-support'),supportTitle=el('summary','','도구 지원 안내'),supportList=el('ul');support.append(supportTitle,supportList);
  disclosures.at(-1)!.popup.className+=' hwp-demo-tools-popup';disclosures.at(-1)!.popup.append(support);
  const workspace = el("main", "hwp-demo-workspace"); workspace.id = `${prefix}-workspace`;
  const surfaceMount = options.framework === "headless" ? null : el("div", "hwp-demo-surface");
  const headlessMount = options.framework === "headless" ? el("div", "hwp-demo-headless-controls") : null;
  if (headlessMount) { headlessMount.setAttribute("aria-label", "헤드리스 명령 예제"); workspace.append(headlessMount); }
  const ruler = el("div", "hwp-demo-ruler"); ruler.setAttribute("aria-hidden", "true");
  // Decorative scale only. Drag handles/precise document units belong to the host.
  for (let i = 0; i <= 18; i++) ruler.append(el("span", "", String(i)));
  const empty = el("p", "hwp-demo-empty", options.framework === "headless" ? "문서를 열고 headless 콜백 흐름을 확인하세요." : "파일이나 예제를 열어 문서 편집을 시작하세요.");
  if (surfaceMount) { surfaceMount.dataset.role = "surface-mount"; surfaceMount.setAttribute("aria-label", "문서 Canvas 호스트"); workspace.append(ruler, empty, surfaceMount); }
  else workspace.append(empty);
  const tracePanel = el("section", "hwp-demo-trace"), traceTitle = el("h2", "", "콜백 기록"), trace = el("ol");
  trace.setAttribute("aria-label", "Headless 콜백 기록"); tracePanel.append(traceTitle, trace); tracePanel.hidden = options.framework !== "headless";
  workspace.append(tracePanel);
  const statusbar = el("footer", "hwp-demo-statusbar"), status = el("output"), page = el("span"), selection = el("span"), zoomLabel = el("label", "", "확대"), zoom = el("select");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); page.setAttribute("aria-label", "문서 쪽"); selection.setAttribute("aria-label", "선택 상태");
  zoom.id = `${prefix}-zoom`; zoomLabel.htmlFor = zoom.id;
  for (const percent of VIEW_ZOOM_LEVELS) { const option = el("option", "", `${percent}%`); option.value = String(percent); zoom.append(option); }
  const zoomDescription = bindCommand(zoom, "set-zoom");
  listen(zoom, "change", () => { if (closed) return; const percent = Number(zoom.value); if (isMenuZoomPercent(percent)) dispatch({ command: "set-zoom", percent }); });
  statusbar.append(page, selection, status, zoomLabel, zoom, zoomDescription);
  shell.append(titlebar, menuNav, toolbar, formatbar, reason, workspace, statusbar);
  root.append(shell);
  const update = ({ resetFormatDraft = false }: { resetFormatDraft?: boolean } = {}) => {
    if (closed) return;
    const state = options.getState();
    if (closed) return;
    title.textContent = state.title || "문서 편집기"; status.textContent = state.status;
    page.textContent = state.pageLabel || "쪽 정보 없음"; selection.textContent = state.selectionLabel || "선택 없음";
    style.textContent = state.styleLabel || "스타일 정보 없음"; font.textContent = state.fontName || "글꼴 정보 없음";
    // Only an ordinary toolbar draft; never write into the host's input/selection.
    if (resetFormatDraft || doc.activeElement !== size) size.value = state.fontSizePoints == null ? "" : String(state.fontSizePoints);
    zoom.value = state.zoomPercent == null ? "" : String(state.zoomPercent);
    shell.setAttribute("aria-busy", String(state.busy === true));
    for (const { node, command, description } of availabilityNodes) {
      const value = actionAvailability(state, command, Boolean(options.onAction)); node.disabled = !value.enabled;
      const label = node.getAttribute("aria-label") || node.textContent || "";
      description.textContent = value.enabled ? "" : value.reason || "현재 사용할 수 없습니다.";
      node.title = value.enabled ? label : `${label} — ${description.textContent}`;
      if (value.pressed !== undefined) node.setAttribute("aria-pressed", String(value.pressed)); else node.removeAttribute("aria-pressed");
    }
    for(const {node,percent} of zoomChoices)node.setAttribute("aria-pressed",String(percent===(state.zoomPercent??100)));
    supportList.replaceChildren();
    const supportedList = new Set<DemoCommand>();
    for (const { command } of availabilityNodes) {
      if (supportedList.has(command)) continue;
      supportedList.add(command);
      const available = actionAvailability(state, command, Boolean(options.onAction));
      if (!available.enabled) supportList.append(el("li", "", `${labels.get(command) || command}: ${available.reason}`));
    }
    supportTitle.textContent = `도구 지원 안내 (${supportList.childElementCount})`;
    openUI.update();
    empty.hidden = Boolean(state.documentLabel); // Placeholder is a sibling, not host content.
  };
  const destroy = () => { if (closed) return; closed = true; openUI.destroy(); for (const remove of removals.splice(0)) remove(); shell.remove(); };
  try { update(); } catch (error) { destroy(); throw error; }
  return {
    element: shell, surfaceMount, headlessMount, saveOptionsMount: picker, update, destroy,
    /** Preserve an available selection; never touch the document/host subtree. */
    setFixtures(entries: readonly DemoFixture[]) {
      if (closed) return;
      openUI.setFixtures(entries); update();
    },
    /** Caller passes a bounded, already redacted trace projection from callbacks. */
    setTrace(entries: readonly DemoTraceEntry[]) {
      if (closed) return;
      trace.replaceChildren();
      for (const entry of entries.slice(-100)) { const row = el("li"); row.append(el("strong", "", entry.event), doc.createTextNode(` ${entry.detail}`)); trace.append(row); }
    },
  };
}
