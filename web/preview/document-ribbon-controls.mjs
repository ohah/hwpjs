import { documentRibbonPages } from "./document-ribbon-pages.mjs";

/** Move existing controls, never clone or change their permission state. */
export function createDocumentRibbon(root) {
  if (!root?.ownerDocument) throw new Error("MissingDocumentRibbonRoot");
  const document = root.ownerDocument;
  const menus = root.querySelectorAll(".document-menu");
  if (menus.length !== 1) throw new Error("MissingDocumentRibbonMenu");
  const groups = documentRibbonPages.map(page => ({ ...page, nodes: page.selectors.map(selector => {
    const matches = root.querySelectorAll(selector);
    if (matches.length !== 1) throw new Error("InvalidDocumentRibbonGroup");
    return matches[0];
  }) }));
  const nodes = groups.flatMap(group => group.nodes);
  if (new Set(nodes).size !== nodes.length || nodes.some(node => nodes.some(other => other !== node && node.contains(other)))) throw new Error("NestedDocumentRibbonGroup");
  for (const id of ["document-ribbon-tabs", ...groups.flatMap(page => [`document-ribbon-tab-${page.id}`, `document-ribbon-panel-${page.id}`])]) {
    if (document.getElementById(id)) throw new Error("DuplicateDocumentRibbonId");
  }
  const list = document.createElement("div");
  list.id = "document-ribbon-tabs";
  list.className = "document-ribbon-tabs";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "문서 도구 탭");
  const restored = [];
  const pages = groups.map(group => {
    const tab = document.createElement("button"), panel = document.createElement("div");
    tab.type = "button";
    tab.id = `document-ribbon-tab-${group.id}`;
    tab.textContent = group.label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `document-ribbon-panel-${group.id}`);
    panel.id = `document-ribbon-panel-${group.id}`;
    panel.className = "document-ribbon-panel";
    panel.tabIndex = 0;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    if (group.emptyHint) {
      const hint = document.createElement("p");
      hint.className = "document-ribbon-empty-hint";
      hint.textContent = group.emptyHint;
      panel.append(hint);
    }
    for (const node of group.nodes) {
      const marker = document.createComment("document ribbon original position");
      node.parentNode.insertBefore(marker, node);
      restored.push({ node, marker });
      panel.append(node);
    }
    list.append(tab);
    return { tab, panel };
  });
  root.append(list, ...pages.map(page => page.panel));
  let closed = false;
  const select = (selected, focus = false, reveal = false) => {
    for (const page of pages) {
      const active = page === selected;
      page.tab.setAttribute("aria-selected", String(active));
      page.tab.tabIndex = active ? 0 : -1;
      page.panel.hidden = !active;
    }
    if (focus) selected.tab.focus();
    if (reveal) selected.panel.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const tabFrom = target => pages.find(page => page.tab === target || page.tab.contains(target));
  const onClick = event => {
    if (closed) return;
    const tab = event.target?.nodeType === 1 ? tabFrom(event.target) : null;
    if (tab) { select(tab, false, true); return; }
    // Menu delegation can click an existing control in an inactive panel.
    const owner = event.target?.nodeType === 1 && pages.find(page => page.panel.contains(event.target));
    if (owner) select(owner, false, owner.panel.hidden);
  };
  const onKey = event => {
    if (closed || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    const tab = event.target?.nodeType === 1 ? tabFrom(event.target) : null;
    if (!tab) return;
    const index = pages.indexOf(tab);
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % pages.length;
    else if (event.key === "ArrowLeft") next = (index + pages.length - 1) % pages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = pages.length - 1;
    else return;
    event.preventDefault();
    select(pages[next], true, true);
  };
  select(pages[0]);
  root.addEventListener("click", onClick, true);
  list.addEventListener("keydown", onKey);
  return { close() {
    if (closed) return;
    closed = true;
    root.removeEventListener("click", onClick, true);
    list.removeEventListener("keydown", onKey);
    for (const { node, marker } of restored) marker.replaceWith(node);
    list.remove();
    for (const page of pages) page.panel.remove();
  } };
}
