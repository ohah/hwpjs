// Minimal ownership/event double, not a browser or CSS implementation.
export class RibbonNode extends EventTarget {
  constructor(document, type = 1) {
    super(); this.ownerDocument = document; this.nodeType = type;
    this.childNodes = []; this.parentNode = null; this.attributes = new Map();
    this.hidden = false; this.disabled = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get nextSibling() { const siblings = this.parentNode?.childNodes; return siblings?.[siblings.indexOf(this) + 1] ?? null; }
  contains(node) {
    if (!node?.nodeType) throw new TypeError("ExpectedNode");
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  remove() { if (this.parentNode) { const siblings = this.parentNode.childNodes; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; } }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.childNodes.push(node); } }
  prepend(node) { node.remove(); node.parentNode = this; this.childNodes.unshift(node); }
  insertBefore(node, reference) {
    if (reference === null) { this.append(node); return; }
    const index = this.childNodes.indexOf(reference);
    if (index < 0) throw new Error("MissingReference");
    node.remove(); node.parentNode = this; this.childNodes.splice(index, 0, node);
  }
  replaceWith(node) { this.parentNode.insertBefore(node, this); this.remove(); }
  querySelectorAll(selector) { return descendants(this).filter(node => node.selector === selector); }
  focus() { for (let node = this; node; node = node.parentNode) if (node.hidden) return; this.ownerDocument.activeElement = this; }
  scrollIntoView(options) { this.lastScroll = options; }
}
function descendants(node) { return node.childNodes.flatMap(child => [child, ...descendants(child)]); }
export function ribbonFixture() {
  const document = {
    createElement: () => new RibbonNode(document),
    createComment: () => new RibbonNode(document, 8),
    getElementById: id => descendants(root).find(node => node.id === id) ?? null,
  };
  const root = new RibbonNode(document), quick = new RibbonNode(document);
  const menu = Object.assign(new RibbonNode(document), { selector: ".document-menu" });
  const selectors = [
    '.toolbar-group[aria-label="선택 글자 강조"]', '.toolbar-group[aria-label="기존 글자 서식"]',
    ".style-toolbar", "#table-creation-form", ".view-toolbar", "#document-window-options", "#paragraph-break-tools",
  ];
  const groups = selectors.map(selector => Object.assign(new RibbonNode(document), { selector }));
  root.append(menu, quick, ...groups.slice(2)); quick.append(...groups.slice(0, 2));
  return { root, document, groups, quick };
}
export function emit(target, type, source, properties = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), properties);
  Object.defineProperty(event, "target", { value: source });
  target.dispatchEvent(event); return event;
}
