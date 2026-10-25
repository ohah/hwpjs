// Minimal host fixture for REAL ReactDOM effect/ref tests. No Canvas/layout/IME
// emulation. These tests verify adapter ownership, not vanilla rendering.
class Node extends EventTarget {
  constructor(name, document, type = 1) {
    super(); this.nodeName = name.toUpperCase(); this.tagName = this.nodeName;
    this.ownerDocument = document; this.nodeType = type; this.childNodes = [];
    this.parentNode = null; this.namespaceURI = "http://www.w3.org/1999/xhtml";
    this.attributes = new Map(); this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
    this._text = "";
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get nextSibling() { const siblings = this.parentNode?.childNodes ?? []; return siblings[siblings.indexOf(this) + 1] ?? null; }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); this.childNodes.push(node); node.parentNode = this; return node; }
  insertBefore(node, anchor) { if (node.parentNode) node.parentNode.removeChild(node); this.childNodes.splice(this.childNodes.indexOf(anchor), 0, node); node.parentNode = this; return node; }
  removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  get textContent() { return this._text + this.childNodes.map(node => node.textContent).join(""); }
  set textContent(value) { this._text = String(value); for (const node of this.childNodes) node.parentNode = null; this.childNodes = []; }
  get innerHTML() { return this.textContent; }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
}
export function installDOM() {
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const document = new Node("#document", null, 9); document.ownerDocument = document;
  document.createElement = name => new Node(name, document);
  document.createElementNS = (_, name) => document.createElement(name);
  document.createTextNode = text => { const node = new Node("#text", document, 3); node.nodeValue = text; node.textContent = text; return node; };
  document.documentElement = document.createElement("html"); document.body = document.createElement("body");
  document.documentElement.appendChild(document.body); document.appendChild(document.documentElement);
  document.activeElement = document.body;
  const window = { document, Node, HTMLElement: Node, HTMLIFrameElement: class {}, event: undefined, location: { protocol: "http:" } };
  document.defaultView = window;
  for (const [name, value] of Object.entries({ window, document, Node, HTMLElement: Node, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const container = document.createElement("div"); document.body.appendChild(container);
  return { document, container, restore() {
    for (const name of ["window", "document", "Node", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name];
    }
  } };
}
