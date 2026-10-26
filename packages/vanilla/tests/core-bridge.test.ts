import { test } from "node:test";
import assert from "node:assert/strict";
import { createControlBridge } from "../src/core-bridge.ts";
import { EditorState } from "../../core/src/state/editor-state.ts";

function setup() {
  let state = new EditorState({
    editorId: "e",
    documentId: "a",
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: "ready",
  });
  let active = true;
  let resolve!: (value: any) => void;
  const replies: any[] = [],
    calls: any[] = [];
  const bridge = createControlBridge({
    state: () => state,
    lease: {
      id: "lease",
      generation: 1,
      isActive: () => active,
      release() {
        active = false;
      },
      publishSelection: async () => state,
      request: (m, o) => {
        calls.push([m, o]);
        return new Promise((r) => {
          resolve = r;
        });
      },
    },
    acknowledge: (r) => replies.push(r),
    error: (e) => {
      throw e;
    },
  });
  return {
    bridge,
    replies,
    calls,
    resolve: (v: any) => resolve(v),
    change() {
      state = new EditorState({
        ...state.token,
        documentId: "b",
        generation: 2,
        stateVersion: 2,
        status: "ready",
      });
    },
  };
}
test("legacy payload is owned, admitted once, and forwarded without coordinate conversion", async () => {
  const s = setup(),
    message = { kind: "splice", startUnit: 23, text: "한글", reference: { node: 7 } };
  assert.equal(s.bridge.request(message), true);
  message.reference.node = 99;
  assert.equal(s.bridge.request({ kind: "undo" }), false);
  await Promise.resolve();
  assert.equal(s.calls[0][0].startUnit, 23);
  assert.equal(s.calls[0][0].reference.node, 7);
  assert.equal(s.calls[0][1].coordinates, "legacy-native");
  s.resolve({ kind: "splice", applied: false });
  await s.bridge.flush();
  assert.equal(s.replies.length, 1);
  assert.equal(s.bridge.busy(), false);
});
test("late old-document and detached replies do not acknowledge the controller", async () => {
  for (const detach of [false, true]) {
    const s = setup();
    s.bridge.request({ kind: "query-edit-range" });
    await Promise.resolve();
    if (detach) s.bridge.close();
    else s.change();
    s.resolve({ kind: "query-edit-range", allowed: true });
    await s.bridge.flush();
    assert.equal(s.replies.length, 0);
  }
});
test("two editor bridges have independent admission and cleanup", async () => {
  const a = setup(),
    b = setup();
  a.bridge.close();
  assert.equal(a.bridge.request({ kind: "splice" }), false);
  assert.equal(b.bridge.request({ kind: "splice" }), true);
  await Promise.resolve();
  b.resolve({ kind: "splice" });
  await b.bridge.flush();
  assert.equal(b.replies.length, 1);
});
test("surface import creates no DOM, Worker, or runtime", async () => {
  assert.equal(typeof globalThis.document, "undefined");
  const module = await import("../src/surface.ts");
  assert.equal(typeof module.createCanvasSurface, "function");
  assert.equal(typeof globalThis.document, "undefined");
});
