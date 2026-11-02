import assert from 'node:assert/strict';
import { createRenderer } from '../../../web/preview/renderer.mjs';
export function harness(t) {
  const frames = [],
    fonts = new EventTarget();
  let resize,
    ratio = 1,
    layouts = 0,
    measurements = 0;
  const ctx = new Proxy(
    {
      measureText: (text) => (
        measurements++,
        { width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }
      ),
    },
    { get: (o, key) => o[key] ?? (() => {}) },
  );
  const canvas = {
    width: 300,
    height: 150,
    style: {},
    dataset: {},
    ownerDocument: { fonts },
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      width: parseFloat(canvas.style.width),
      height: parseFloat(canvas.style.height),
    }),
  };
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const renderer = createRenderer(
    canvas,
    viewport,
    { style: {} },
    () => {
      layouts++;
    },
    {
      devicePixelRatio: () => ratio,
      requestFrame: (f) => (frames.push(f), frames.length),
      cancelFrame() {},
      ResizeObserver: class {
        constructor(f) {
          resize = f;
        }
        observe() {}
        disconnect() {}
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    },
  );
  t.after(() => renderer.close());
  return {
    renderer,
    canvas,
    viewport,
    fonts,
    get layouts() {
      return layouts;
    },
    get measurements() {
      return measurements;
    },
    resize: () => resize(),
    ratio: (v) => (ratio = v),
    paint() {
      let n = 0;
      while (frames.length) {
        assert(++n < 30);
        frames.shift()();
      }
    },
  };
}
export const source = (text) => ({
  format: 'hwp5',
  paragraphs: Object.freeze([
    Object.freeze({
      section: 0,
      paragraph: 0,
      label: '문단',
      text,
      editable: true,
      selectable: true,
    }),
  ]),
  limited: false,
});
export const show = (h, text, extra = {}) =>
  h.renderer.show(source(text), {
    resourceDocument: 'one',
    resourceEpoch: text,
    preserveScroll: true,
    ...extra,
  });
