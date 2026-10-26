import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, createEditor } from "@hwpjs/core";
import { createCanvasSurface } from "../src/surface.ts";
// Controlled projection callbacks test the ownership boundary; actual Canvas evidence is separate.
function fixture(realEditor?: any, rejectFirst = false) {
  const witness: any = { frames: [], emit: undefined };
  (globalThis as any).__surfaceOwnerWitness = witness;
  let state = new EditorState({
      editorId: "e",
      documentId: "d",
      generation: 1,
      operationRevision: 1,
      viewRevision: 1,
      stateVersion: 1,
      status: "ready",
      content: { format: "hwpx", paragraphs: [] },
    }),
    listener: any,
    active = false,
    released = 0;
  const publications: any[] = [];
  const doc: any = {
    defaultView: {
      navigator: { platform: "MacIntel" },
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
    },
  };
  class Element {
    ownerDocument = doc;
    children: any[] = [];
    style: any = {};
    dataset: any = {};
    clientWidth = 800;
    clientHeight = 600;
    append(...nodes: any[]) {
      this.children.push(...nodes);
      for (const n of nodes) n.parent = this;
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((n: any) => n !== this);
    }
    parent: any;
    setAttribute() {}
  }
  doc.createElement = () => new Element();
  const root = new Element();
  const install = (selection: any, revision = false, documentId = state.documentId) => {
    state = new EditorState({
      ...state.token,
      documentId,
      stateVersion: state.stateVersion + 1,
      operationRevision: state.operationRevision + Number(revision),
      viewRevision: state.viewRevision + Number(revision),
      status: "ready",
      content: state.content,
      selection,
    });
    listener?.(state);
    return state;
  };
  const editor: any = realEditor
    ? {
        ...realEditor,
        acquireInputSurface(hooks: any) {
          const lease = realEditor.acquireInputSurface(hooks);
          return {
            ...lease,
            publishSelection(value: any) {
              publications.push(value);
              if (rejectFirst && publications.length === 1)
                return Promise.reject(Error("ControlledSelectionReject"));
              return lease.publishSelection(value);
            },
            release() {
              released++;
              lease.release();
            },
          };
        },
      }
    : {
        getEditorState: () => state,
        registerStateListener: (fn: any) => {
          listener = fn;
          return () => {
            listener = undefined;
          };
        },
        acquireInputSurface() {
          active = true;
          return {
            isActive: () => active,
            publishSelection: async (value: any) => {
              publications.push(value);
              return install(value);
            },
            request: async () => {
              throw Error("UnexpectedNative");
            },
            release() {
              active = false;
              released++;
            },
          };
        },
        readResource: async () => {
          throw Error("UnexpectedResource");
        },
      };
  const surface = createCanvasSurface({ root: root as any, editor });
  const point = {
    anchor: { section: 0, paragraph: 0, unit: 0 },
    focus: { section: 0, paragraph: 0, unit: 1 },
  };
  return {
    surface,
    witness,
    publications,
    point,
    install,
    get state() {
      return realEditor ? realEditor.getEditorState() : state;
    },
    get released() {
      return released;
    },
  };
}
test("own ACK projection echo does not add stateVersion, including delayed paint", async () => {
  const f = fixture();
  try {
    f.witness.emit(f.point);
    const expected = f.state.stateVersion + 1;
    f.install(undefined, true);
    assert.equal(f.state.stateVersion, expected);
    const count = f.publications.length;
    for (const frame of f.witness.frames.splice(0)) frame();
    assert.equal(f.state.stateVersion, expected);
    assert.equal(f.publications.length, count);
  } finally {
    await f.surface.dispose();
  }
});
test("selected to null user clear publishes exactly once; repeat null deduplicates", async () => {
  const f = fixture();
  try {
    f.witness.emit(f.point);
    const count = f.publications.length;
    f.witness.emit(null);
    assert.equal(f.publications.length, count + 1);
    assert.equal(f.state.selection, null);
    f.witness.emit(null);
    assert.equal(f.publications.length, count + 1);
  } finally {
    await f.surface.dispose();
  }
});
test("first user clear while undefined remains an explicit clear, not projection echo", async () => {
  const f = fixture();
  try {
    assert.equal(f.state.selection, undefined);
    f.witness.emit(null);
    assert.equal(f.publications.length, 1);
    assert.equal(f.state.selection, null);
  } finally {
    await f.surface.dispose();
  }
});
test("nonnull reselection after empty core is published normally", async () => {
  const f = fixture();
  try {
    f.install(undefined, true);
    const count = f.publications.length;
    f.witness.emit(f.point);
    assert.equal(f.publications.length, count + 1);
    assert.equal((f.state.selection as any).endUnit, 1);
  } finally {
    await f.surface.dispose();
  }
});
test("new document projection stays local; dispose/release stays one and rejects old callback", async () => {
  const f = fixture();
  f.witness.emit(f.point);
  const count = f.publications.length;
  f.install(undefined, true, "another");
  for (const frame of f.witness.frames.splice(0)) frame();
  assert.equal(f.publications.length, count);
  await f.surface.dispose();
  assert.equal(f.released, 1);
  f.witness.emit(null);
  assert.equal(f.publications.length, count);
});

async function realCore() {
  return createEditor({
    runtimeFactory: () => ({
      async request(m: any) {
        return { kind: m.kind, content: { format: "hwpx", paragraphs: [] } };
      },
      dispose() {},
    }),
  });
}
test("real async surface lease accepts same-stack explicit clear once", async () => {
  const e = await realCore();
  await e.load(new Uint8Array([1]), { format: "hwpx" });
  const f = fixture(e);
  try {
    const version = e.getEditorState().stateVersion;
    f.witness.emit(null);
    f.witness.emit(null);
    assert.equal(f.publications.length, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(e.getEditorState().selection, null);
    assert.equal(e.getEditorState().stateVersion, version + 1);
  } finally {
    await f.surface.dispose();
    await e.dispose();
  }
});
test("rejected explicit clear releases its own pending identity and can retry", async () => {
  const e = await realCore();
  await e.load(new Uint8Array([1]), { format: "hwpx" });
  const f = fixture(e, true);
  try {
    f.witness.emit(null);
    f.witness.emit(null);
    assert.equal(f.publications.length, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(e.getEditorState().selection, undefined);
    f.witness.emit(null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.publications.length, 2);
    assert.equal(e.getEditorState().selection, null);
  } finally {
    await f.surface.dispose();
    await e.dispose();
  }
});
