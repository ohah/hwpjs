// Event/ownership fixture only. Not browser layout, native IME or trusted-focus proof.
export class Element extends EventTarget {
  children: Element[] = [];
  parentElement?: Element;
  dataset: any = {};
  attributes = new Map<string, string>();
  style: any = {};
  className = "";
  textContent = "";
  value = "";
  disabled = false;
  hidden = false;
  open = false;
  modal = false;
  tabIndex = 0;
  classList = {
    add: (name: string) => {
      this.className += " " + name;
    },
  };
  constructor(
    readonly ownerDocument: any,
    readonly tagName: string,
  ) {
    super();
  }
  append(...nodes: Element[]) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((n) => n !== this);
    this.parentElement = undefined;
  }
  setAttribute(k: string, v: string) {
    this.attributes.set(k, v);
  }
  getAttribute(k: string) {
    return this.attributes.get(k) ?? null;
  }
  contains(node: any): boolean {
    return node === this || this.children.some((c) => c.contains(node));
  }
  focus() {
    if (!this.disabled) this.ownerDocument.activeElement = this;
  }
  show() {
    this.open = true;
  }
  showModal() {
    this.open = true;
    this.modal = true;
  }
  close() {
    this.open = false;
    this.modal = false;
  }
  getClientRects(): any[] {
    for (let node: Element | undefined = this; node; node = node.parentElement)
      if (node.hidden) return [];
    return [{}];
  }
  querySelector(selector: string): any {
    if (selector === "dialog:modal")
      return all(this).find((n) => n.tagName === "DIALOG" && n.open && n.modal) ?? null;
    const match = /data-role=([^\]]+)/.exec(selector);
    return match ? (all(this).find((n) => n.dataset.role === match[1]) ?? null) : null;
  }
  querySelectorAll(_selector: string): any[] {
    return all(this).filter(
      (n) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(n.tagName) && !n.disabled,
    );
  }
}
export const all = (node: Element): Element[] => [node, ...node.children.flatMap(all)];
export function documentFixture() {
  const doc: any = { activeElement: null };
  doc.createElement = (name: string) => new Element(doc, name.toUpperCase());
  doc.createTextNode = (text: string) => {
    const n = new Element(doc, "TEXT");
    n.textContent = text;
    return n;
  };
  const root = new Element(doc, "MAIN");
  doc.querySelector = (s: string) => root.querySelector(s);
  return {
    doc,
    root,
    role: (name: string) => all(root).find((n) => n.dataset.role === name)!,
    text: () =>
      all(root)
        .map((n) => n.textContent)
        .join(" "),
  };
}
export function fire(node: EventTarget, type: string, values: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, values);
  node.dispatchEvent(event);
  return event;
}
