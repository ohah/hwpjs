import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRenderer } from "../../web/preview/renderer.mjs";
import { createCanvasEditor } from "../../web/preview/canvas-editor.mjs";
let sequence = 0;
export function dispatchCanvasEvent(node, type, values = {}) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, values); node.dispatchEvent(event); return event;
}

// Shared HWP5/HWPX modules and Worker/WASM with simulated DOM; not browser E2E.
export async function workerCanvasHarness(t, { paintFrames = false, bitmapSize = null, rangeQueries = false } = {}) {
  const keys = ["self", "fetch", "document", "window", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "createImageBitmap"];
  const globals = new Map(keys.map(key => [key, { present: Object.hasOwn(globalThis, key), value: globalThis[key] }]));
  const replies = [], queue = [], requests = [], document = { activeElement: null };
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  globalThis.self = { postMessage: message => replies.push(message) };
  globalThis.fetch = async () => new Response(wasm);
  globalThis.document = document; globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  const frames = [];
  globalThis.requestAnimationFrame = callback => { if (paintFrames) frames.push(callback); return 1; }; globalThis.cancelAnimationFrame = () => {};
  if (bitmapSize) globalThis.createImageBitmap = async () => ({ width: bitmapSize[0], height: bitmapSize[1], close() {} });
  class Node extends EventTarget {
    captureEvents = new EventTarget();
    addEventListener(type, callback, options) {
      if (paintFrames && options?.capture) this.captureEvents.addEventListener(type, callback, options);
      else super.addEventListener(type, callback, options);
    }
    removeEventListener(type, callback, options) {
      if (paintFrames && options?.capture) this.captureEvents.removeEventListener(type, callback, options);
      else super.removeEventListener(type, callback, options);
    }
    dispatchEvent(event) {
      if (!paintFrames) return super.dispatchEvent(event);
      let stopped = false;
      const own = Object.hasOwn(event, "stopImmediatePropagation"), previous = event.stopImmediatePropagation;
      event.stopImmediatePropagation = function () { stopped = true; return previous.call(this); };
      try {
        this.captureEvents.dispatchEvent(event);
        return stopped ? !event.defaultPrevented : super.dispatchEvent(event);
      } finally {
        if (own) event.stopImmediatePropagation = previous; else delete event.stopImmediatePropagation;
      }
    }
    style = {}; dataset = {}; value = ""; selectionStart = 0; selectionEnd = 0; selectionDirection = "forward";
    setAttribute() {}
    setSelectionRange(start, end, direction = "forward") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
    focus() { document.activeElement = this; dispatchCanvasEvent(this, "focus"); }
    blur() { document.activeElement = null; dispatchCanvasEvent(this, "blur"); }
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 900 }; }
    setPointerCapture(id) { this.captured = id; } hasPointerCapture(id) { return paintFrames && this.captured === id; } releasePointerCapture() { this.captured = null; }
    scrollIntoView() {}
  }
  const canvas = new Node(), input = new Node(), viewport = new Node();
  Object.assign(viewport, { scrollTop: 0, clientWidth: 1200, clientHeight: 900 });
  const context = new Proxy({ measureText: text => ({ width: text.length * 8, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }) }, { get: (target, key) => target[key] ?? (() => {}) });
  canvas.getContext = () => context;
  let busy = false, ready = false, renderer, controller;
  const send = async (message, publish = true) => {
    if (publish && message.kind === "load") {
      assert.equal(queue.length, 0);
      ready = false; busy = false; controller.reset(); renderer.clear();
    }
    await self.onmessage({ data: message }); assert.equal(replies.length, 1);
    const reply = replies.shift();
    if (publish) {
      busy = false;
      if (reply.kind === "enable" && !reply.error) ready = true;
      if (reply.content) renderer.show(reply.content, { preserveScroll: reply.kind !== "load" });
      controller.message(reply);
    }
    return reply;
  };
  const controls = { ready: () => ready, busy: () => busy, request(message) {
    if (busy || !ready) return false;
    busy = true; requests.push(message); queue.push(message); return true;
  } };
  t.after(async () => {
    controller?.close(); renderer?.close();
    try { if (globalThis.self?.onmessage) await send({ kind: "load", format: "test-close", bytes: [] }, false); }
    finally { for (const [key, old] of globals) { if (old.present) globalThis[key] = old.value; else delete globalThis[key]; } }
  });
  await import(`../../web/preview/reader-worker.mjs?canvas-worker=${++sequence}`);
  const spacer = { style: {} };
  renderer = createRenderer(canvas, viewport, spacer);
  controller = createCanvasEditor({ canvas, viewport, input, renderer, controls, note: { textContent: "" }, platform: "", queryEditRange: rangeQueries ? message => controls.request(message) : null });
  controller.reset();
  return { canvas, input, viewport, spacer, renderer, controller, requests, send, request: message => controls.request(message),
    paint() { let count = 0; while (frames.length) { assert(++count <= 100, "UnexpectedAnimationLoop"); frames.shift()(); } },
    async flush() { assert.equal(queue.length, 1); return send(queue.shift()); },
    async flushQueries() {
      let count = 0;
      while (queue[0]?.kind === "query-edit-range") {
        assert(++count <= 100, "UnexpectedPermissionQueryLoop");
        const reply = await send(queue.shift());
        assert.equal(reply.error, undefined);
      }
    },
  };
}
