import {
  createEditor,
  createParagraphSelection,
  createReaderRuntimeFactory,
  wasmModule,
  inputBytes,
} from './shape-copy-native-fixture.mjs';
import { createShapeCopyTool } from '../src/shape-copy-tool.ts';
export function dom() {
  const doc = new EventTarget();
  doc.defaultView = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 600 });
  doc.activeElement = null;
  class Element extends EventTarget {
    children = [];
    dataset = {};
    style = {};
    attrs = {};
    open = false;
    hidden = false;
    disabled = false;
    checked = false;
    value = '';
    isConnected = false;
    parentElement = null;
    textContent = '';
    tagName;
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.ownerDocument = doc;
    }
    append(...nodes) {
      for (const n of nodes) {
        n.parentElement = this;
        n.isConnected = this.isConnected;
        this.children.push(n);
      }
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter((n) => n !== this);
      this.parentElement = null;
      this.isConnected = false;
    }
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
    getAttribute(k) {
      return this.attrs[k];
    }
    showModal() {
      this.open = true;
    }
    show() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    focus() {
      doc.activeElement = this;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 400, height: 400 };
    }
    getClientRects() {
      return [{}];
    }
    querySelectorAll() {
      return all(this).filter(
        (n) => ['BUTTON', 'INPUT', 'SELECT'].includes(n.tagName) && !n.disabled,
      );
    }
    querySelector() {
      return null;
    }
  }
  const all = (n) => [n, ...n.children.flatMap(all)];
  doc.createElement = (t) => new Element(t);
  doc.createTextNode = (t) => Object.assign(new Element('#text'), { textContent: t });
  const root = new Element('main');
  root.isConnected = true;
  doc.querySelector = (q) =>
    q === 'dialog:modal' ? (all(root).find((n) => n.tagName === 'DIALOG' && n.open) ?? null) : null;
  const send = (node, type, extra = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, extra);
    node.dispatchEvent(e);
    return e;
  };
  return {
    root,
    doc,
    all: () => all(root),
    send,
    role: (r) => all(root).find((n) => n.dataset.role === r),
    field: (id) => all(root).find((n) => n.dataset.shapeCopyField === id),
  };
}
export async function setup(format = 'hwp5', overrides = {}) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
  const original = await inputBytes(format);
  await e.load(original, { format, editable: true });
  const rows = e
    .getEditorState()
    .content.paragraphs.filter(
      (r) => !r.tableCell && !r.drawingText && !r.drawingCaption && r.text.length > 4,
    );
  const select = async (row, start, end) =>
    e.setSelection(
      createParagraphSelection(e.getEditorState(), {
        section: row.section,
        paragraph: row.paragraph,
        startUnit: start,
        endUnit: end,
      }),
    );
  await select(rows[0], 1, 1);
  const d = dom(),
    status = [];
  let focus = 0,
    presentations = 0;
  const tool = createShapeCopyTool({
    root: d.root,
    editor: new Proxy(
      {},
      {
        get(_target, key) {
          return overrides[key] ?? (typeof e[key] === 'function' ? e[key].bind(e) : e[key]);
        },
      },
    ),
    onStatus: (t) => status.push(t),
    onClose: () => focus++,
    onPresentationChange() {
      presentations++;
    },
  });
  return {
    e,
    tool,
    d,
    rows,
    select,
    status,
    focus: () => focus,
    presentations: () => presentations,
    close: async () => {
      tool.dispose();
      await e.dispose();
    },
  };
}
