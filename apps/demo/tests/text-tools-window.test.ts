import test from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "@hwpjs/core";
import { createTextToolsBridge } from "../src/text-tools-bridge.ts";
// Minimal event/ownership fixture, not browser focus, layout or trusted-input evidence.
class Element extends EventTarget {
  children: Element[] = [];
  parentElement?: Element;
  dataset: any = {};
  attributes = new Map();
  value = "";
  disabled = false;
  hidden = false;
  open = false;
  textContent = "";
  constructor(readonly ownerDocument: any) {
    super();
  }
  append(...nodes: Element[]) {
    for (const n of nodes) {
      n.remove();
      n.parentElement = this;
      this.children.push(n);
    }
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((n) => n !== this);
  }
  setAttribute(k: string, v: string) {
    this.attributes.set(k, v);
  }
  getAttribute(k: string) {
    return this.attributes.get(k);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  contains(n: any): boolean {
    return n === this || this.children.some((c) => c.contains(n));
  }
  show() {
    this.open = true;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}
function fire(node: EventTarget, kind: string, values: any = {}) {
  const e = new Event(kind, { cancelable: true });
  Object.assign(e, values);
  node.dispatchEvent(e);
  return e;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture() {
  const content = {
      format: "hwpx",
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: "AB AB",
          editable: true,
          selectionOwner: "section:0:body",
        },
      ],
    },
    e = createEditor({
      runtimeFactory: () => ({
        async request(m: any) {
          return {
            kind: m.kind,
            content,
            ...(["load", "enable"].includes(m.kind)
              ? {}
              : { meta: { application: "applied" as const, changed: true } }),
          };
        },
        dispose() {},
      }),
    });
  await e.load(new Uint8Array([1]), { format: "hwpx" });
  const doc: any = { activeElement: null };
  doc.createElement = () => new Element(doc);
  doc.createTextNode = (text: string) => {
    const n = new Element(doc);
    n.textContent = text;
    return n;
  };
  const root = new Element(doc);
  let focuses = 0;
  const bridge = createTextToolsBridge({
      editor: e,
      root: root as any,
      onStatus() {},
      onClose: () => {
        focuses++;
      },
    }),
    all = (n: Element): Element[] => [n, ...n.children.flatMap(all)],
    role = (value: string) => all(root).find((n) => n.dataset.role === value)!;
  await bridge.action({ command: "replace" });
  role("search-query").value = "AB";
  role("search-replacement").value = "Z";
  return {
    e,
    root,
    bridge,
    role,
    get focuses() {
      return focuses;
    },
    async done() {
      bridge.dispose();
      await e.dispose();
    },
  };
}
test("modal statistics blocks retained F3 search", async () => {
  const f = await fixture();
  try {
    fire(f.role("close-text-tool"), "click");
    await f.bridge.action({ command: "word-count" });
    const v = f.e.getEditorState().stateVersion;
    fire(f.root, "keydown", { code: "F3" });
    await tick();
    await tick();
    assert.equal(f.e.getEditorState().stateVersion, v);
    assert.equal(f.role("document-statistics").open, true);
  } finally {
    await f.done();
  }
});
test("F3 sequential search excludes repeat and composition", async () => {
  const f = await fixture();
  try {
    fire(f.role("close-text-tool"), "click");
    const v = f.e.getEditorState().stateVersion;
    for (const patch of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }])
      fire(f.root, "keydown", { code: "F3", ...patch });
    await tick();
    assert.equal(f.e.getEditorState().stateVersion, v);
    for (const start of [0, 3]) {
      fire(f.root, "keydown", { code: "F3" });
      await tick();
      await tick();
      assert.equal((f.e.getEditorState().selection as any).startUnit, start);
    }
  } finally {
    await f.done();
  }
});
test("IME Enter does not start a search", async () => {
  const f = await fixture();
  try {
    const v = f.e.getEditorState().stateVersion;
    for (const patch of [{ isComposing: true }, { keyCode: 229 }])
      fire(f.role("search-query"), "keydown", { key: "Enter", ...patch });
    await tick();
    assert.equal(f.e.getEditorState().stateVersion, v);
  } finally {
    await f.done();
  }
});
test("IME Escape does not dismiss; ordinary Escape restores public focus once", async () => {
  const f = await fixture();
  try {
    const dialog = f.role("text-search");
    for (const patch of [{ isComposing: true }, { keyCode: 229 }])
      fire(dialog, "keydown", { key: "Escape", ...patch });
    assert.equal(f.role("text-search"), dialog);
    assert.equal(f.focuses, 0);
    fire(dialog, "keydown", { key: "Escape" });
    assert.equal(f.focuses, 1);
  } finally {
    await f.done();
  }
});
test("find/replace reuse the window and preserve both drafts", async () => {
  const f = await fixture();
  try {
    const dialog = f.role("text-search"),
      q = f.role("search-query"),
      r = f.role("search-replacement");
    await f.bridge.action({ command: "find" });
    assert.equal(f.role("text-search"), dialog);
    assert.equal(q.value, "AB");
    assert.equal(r.value, "Z");
    assert.equal(r.parentElement!.hidden, true);
    await f.bridge.action({ command: "replace" });
    assert.equal(r.parentElement!.hidden, false);
  } finally {
    await f.done();
  }
});
