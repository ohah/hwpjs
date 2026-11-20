export class Element extends EventTarget {
  constructor(tagName: string, ownerDocument: Document);
  tagName: string;
  ownerDocument: Document;
  children: Element[];
  parentElement?: Element;
  dataset: Record<string, string>;
  value: string;
  disabled: boolean;
  hidden: boolean;
  open: boolean;
  textContent: string;
  readonly childElementCount: number;
  append(...nodes: Element[]): void;
  remove(): void;
  replaceChildren(...nodes: Element[]): void;
  setAttribute(key: string, value: string): void;
  getAttribute(key: string): string | null;
  removeAttribute(key: string): void;
  contains(node: Element): boolean;
  focus(): void;
}
export class Document extends EventTarget {
  activeElement: Element | null;
  createElement(tag: string): any;
  createElementNS(namespace: string, tag: string): any;
  createTextNode(text: string): any;
}
export function all(root: any, predicate: (node: any) => boolean): any[];
export function fire(node: EventTarget, name: string, props?: Record<string, unknown>): Event;
