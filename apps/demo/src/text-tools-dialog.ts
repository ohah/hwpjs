import { createDialogLayer } from "./dialog-layer.ts";
import "./text-tools-dialog.css";
let searchInstance = 0;
export type SearchDirection = "down" | "up" | "all";
export interface SearchDraft {
  query: string;
  replacement: string;
  direction: SearchDirection;
}
export function createTextToolsDialog(
  root: HTMLElement,
  options: {
    replace: boolean;
    draft: SearchDraft;
    onDismiss: () => void;
    onChange: () => void;
    onFind: (continuing?: boolean) => void;
    onReplace: () => void;
    onMode: (replace: boolean) => void;
  },
) {
  const doc = root.ownerDocument,
    layer = createDialogLayer(root, {
      role: "text-search",
      title: options.replace ? "찾아 바꾸기" : "찾기",
      mode: "modeless",
      onDismiss: options.onDismiss,
    });
  let replace = options.replace,
    busy = false;
  const tabs = doc.createElement("div");
  tabs.className = "hwp-search-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "찾기와 바꾸기");
  const findTab = doc.createElement("button"),
    replaceTab = doc.createElement("button");
  findTab.type = replaceTab.type = "button";
  findTab.textContent = "찾기";
  replaceTab.textContent = "바꾸기";
  findTab.setAttribute("role", "tab");
  replaceTab.setAttribute("role", "tab");
  findTab.dataset.role = "search-tab-find";
  replaceTab.dataset.role = "search-tab-replace";
  tabs.append(findTab, replaceTab);
  const grid = doc.createElement("div"),
    fields = doc.createElement("div"),
    actions = doc.createElement("div");
  grid.className = "hwp-search-grid";
  fields.className = "hwp-search-fields";
  actions.className = "hwp-search-actions";
  const row = (label: string, role: string) => {
    const wrap = doc.createElement("label"),
      text = doc.createElement("span"),
      input = doc.createElement("input");
    wrap.className = "hwp-search-field";
    text.textContent = label;
    input.type = "text";
    input.autocomplete = "off";
    input.setAttribute("aria-label", label);
    input.dataset.role = role;
    wrap.append(text, input);
    return { wrap, input };
  };
  const query = row("찾을 내용", "search-query"),
    replacement = row("바꿀 내용", "search-replacement");
  query.input.value = options.draft.query;
  replacement.input.value = options.draft.replacement;
  const directions = doc.createElement("fieldset"),
    legend = doc.createElement("legend");
  legend.textContent = "찾을 방향";
  directions.append(legend);
  const radios: HTMLInputElement[] = [];
  let direction = options.draft.direction;
  const directionName = "hwpjs-search-direction-" + ++searchInstance;
  for (const [value, label] of [
    ["down", "아래로"],
    ["up", "위로"],
    ["all", "문서 전체"],
  ] as const) {
    const wrap = doc.createElement("label"),
      radio = doc.createElement("input");
    radio.type = "radio";
    radio.name = directionName;
    radio.dataset.role = "search-direction-" + value;
    radio.value = value;
    radio.checked = value === direction;
    radio.addEventListener("change", () => {
      if (radio.checked) {
        direction = value;
        for (const other of radios) other.checked = other === radio;
        options.onChange();
      }
    });
    wrap.append(radio, doc.createTextNode(label));
    radios.push(radio);
    directions.append(wrap);
  }
  const button = (label: string, role: string, click: () => void) => {
    const node = doc.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.dataset.role = role;
    node.addEventListener("click", click);
    return node;
  };
  const next = button("다음 찾기", "find-next", () => options.onFind()),
    continuation = button("계속 찾기", "continue-search", () => options.onFind(true)),
    apply = button("선택 바꾸기", "replace-selection", options.onReplace),
    close = button("닫기", "close-text-tool", options.onDismiss);
  continuation.hidden = true;
  const message = doc.createElement("p");
  message.dataset.role = "search-status";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.className = "hwp-search-message";
  message.textContent = "현재 불러온 내용에서 찾습니다.";
  const limit = doc.createElement("p");
  limit.className = "hwp-search-limit";
  limit.textContent =
    "현재 불러온 표시 범위의 텍스트만 검색합니다. 전체 바꾸기는 지원하지 않습니다.";
  fields.append(query.wrap, replacement.wrap, directions);
  actions.append(next, apply, continuation, close);
  grid.append(fields, actions);
  layer.body.append(tabs, grid, message, limit);
  const changed = () => options.onChange();
  query.input.addEventListener("input", changed);
  replacement.input.addEventListener("input", changed);
  query.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      options.onFind();
    }
  });
  findTab.addEventListener("click", () => options.onMode(false));
  replaceTab.addEventListener("click", () => options.onMode(true));
  tabs.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      options.onMode(!replace);
      (replace ? replaceTab : findTab).focus();
    }
  });
  const refresh = () => {
    replacement.wrap.hidden = !replace;
    apply.hidden = !replace;
    layer.setTitle(replace ? "찾아 바꾸기" : "찾기");
    findTab.setAttribute("aria-selected", String(!replace));
    replaceTab.setAttribute("aria-selected", String(replace));
    findTab.tabIndex = replace ? -1 : 0;
    replaceTab.tabIndex = replace ? 0 : -1;
    for (const node of [query.input, replacement.input, ...radios, next, apply, continuation])
      node.disabled = busy;
    next.disabled = busy || !query.input.value;
  };
  query.input.addEventListener("input", refresh);
  refresh();
  return {
    element: layer.element,
    show() {
      layer.show(query.input);
    },
    focus() {
      query.input.focus();
    },
    setMode(value: boolean) {
      replace = value;
      refresh();
    },
    getDraft(): SearchDraft {
      return { query: query.input.value, replacement: replacement.input.value, direction };
    },
    setBusy(value: boolean) {
      busy = value;
      refresh();
    },
    setStatus(value: string) {
      message.textContent = value;
    },
    continueFromEnd(label?: string) {
      continuation.hidden = !label;
      if (label) continuation.textContent = label;
    },
    destroy() {
      layer.destroy();
    },
  };
}
