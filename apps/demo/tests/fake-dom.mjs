// Minimal DOM event/ownership fixture for unit tests; not a browser/layout oracle.
export class Element extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this._text = '';
    this.open = false;
  }
  get childElementCount() {
    return this.children.length;
  }
  set textContent(value) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = String(value);
  }
  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }
  append(...nodes) {
    for (const child of nodes) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
      if (this.tagName === 'SELECT' && this.children.length === 1) this.value = child.value;
    }
  }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  replaceChildren(...nodes) {
    this.textContent = '';
    this.append(...nodes);
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  removeAttribute(key) {
    this.attributes.delete(key);
  }
  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
}
export class Document extends EventTarget {
  constructor() {
    super();
    this.activeElement = null;
  }
  createElementNS(ns, tag) {
    const node = new Element(tag, this);
    node.namespaceURI = ns;
    return node;
  }
  createElement(tag) {
    return new Element(tag, this);
  }
  createTextNode(text) {
    const node = new Element('#text', this);
    node.textContent = text;
    return node;
  }
}
export function all(node, predicate) {
  return [node, ...node.children.flatMap((child) => all(child, () => true))].filter(predicate);
}
export function fire(node, name, props = {}) {
  const event = new Event(name, { cancelable: true });
  Object.assign(event, props);
  node.dispatchEvent(event);
  return event;
}
