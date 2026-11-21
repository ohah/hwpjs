import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../web/preview/renderer.mjs';
import { pictureResizeBasis } from '../../web/preview/picture-resize-geometry.mjs';
const picture = () => ({
  section: 0,
  paragraph: 0,
  pictureNode: 1,
  anchorUnit: 0,
  state: 'located',
  transform: { identity: true },
  geometry: {
    treatAsCharacter: true,
    widthRelative: 4,
    heightRelative: 2,
    width: 3000,
    height: 1500,
  },
  crop: { clip: [0, 3000, 0, 1500], imageDimensions: [null, null] },
});
async function fixture(t, { output = false } = {}) {
  const frames = [],
    fills = [],
    calls = [],
    draws = [];
  let failLayout = false;
  const ctx = new Proxy(
    {
      measureText: (text) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
      fillRect(...r) {
        fills.push({ r, color: this.fillStyle });
      },
      drawImage(...args) {
        draws.push(args);
      },
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  const canvas = { width: 800, height: 600, style: {}, dataset: {}, getContext: () => ctx };
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
      if (failLayout) throw Error('PostLayoutAbort');
    },
    {
      requestFrame: (f) => (frames.push(f), frames.length),
      cancelFrame() {},
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      setInterval: () => 1,
      clearInterval() {},
    },
    null,
    output,
  );
  t.after(() => renderer.close());
  renderer.pictureReader(() => new Uint8Array([1]));
  renderer.pictureDecoder(async () => ({ width: 40, height: 20, close() {} }));
  const p = picture();
  renderer.show(
    {
      paragraphs: [{ section: 0, paragraph: 0, text: '\ufffcX', editable: true, selectable: true }],
      pictures: [p],
      limited: false,
    },
    { resourceDocument: 'p:1', resourceEpoch: 1 },
  );
  const paint = () => {
    let n = 0;
    while (frames.length) {
      assert(++n < 30);
      frames.shift()();
    }
  };
  if (!output) {
    paint();
    await new Promise((r) => setImmediate(r));
    paint();
    renderer.selectPicture(p);
    paint();
  } else await renderer.documentOutputPort.settleResources();
  const target = { kind: 'picture', section: 0, pictureNode: 1 },
    prior = renderer.paintedFrame();
  let admitted = true;
  const query = () => {
    const current = renderer.isPaintedFrameCurrent();
    const frame = renderer.paintedFrame();
    const acknowledged =
      current && renderer.canAcknowledgeObjectSelectionPaint(prior, frame, target);
    calls.push({ current, acknowledged, frame });
    if (!admitted || !current || !acknowledged) return null;
    return pictureResizeBasis(
      renderer.selectedPicturePaint(),
      { section: 0, pictureNode: 1, width: 3000, height: 1500 },
      { allowPartialHandles: true },
    );
  };
  return {
    renderer,
    canvas,
    ctx,
    frames,
    fills,
    calls,
    draws,
    paint,
    query,
    target,
    prior,
    deny: () => {
      admitted = false;
    },
    abortLayout: () => {
      failLayout = true;
    },
    blue: () =>
      fills.filter(
        (f) =>
          f.color === '#145b96' &&
          ((f.r[2] === 8 && f.r[3] === 8) || (f.r[2] === 6 && f.r[3] === 6)),
      ),
  };
}

const anchors = [
  ['top_left', 0, 0],
  ['top_center', 0.5, 0],
  ['top_right', 1, 0],
  ['center_left', 0, 0.5],
  ['center_right', 1, 0.5],
  ['bottom_left', 0, 1],
  ['bottom_center', 0.5, 1],
  ['bottom_right', 1, 1],
];
test('actual renderer anchored preview marks the dragged side for all eight fixed points', async (t) => {
  const h = await fixture(t);
  h.renderer.pictureResizeSelection(h.query);
  h.paint();
  const basis = h.query();
  assert(basis);
  const size = { width: 6000, height: 3000 };
  for (const [anchor, u, v] of anchors) {
    h.fills.length = 0;
    h.renderer.pictureResizeGuide({ basis, size, mode: 'anchored', anchor });
    h.paint();
    const markers = h.blue().filter((f) => f.r[2] === 6);
    assert.equal(markers.length, 1, anchor);
    // Direct source-space fixed-point equation, independent of guide helper.
    const expected = [0, 1].map(
      (axis) =>
        basis.origin[axis] +
        u * basis.x[axis] +
        v * basis.y[axis] +
        (1 - 2 * u) * 2 * basis.x[axis] +
        (1 - 2 * v) * 2 * basis.y[axis],
    );
    assert.deepEqual(markers[0].r, [expected[0] - 3, expected[1] - 3, 6, 6], anchor);
  }
});
test('actual renderer rejects unknown anchored guide metadata while keeping certified handles', async (t) => {
  const h = await fixture(t);
  h.renderer.pictureResizeSelection(h.query);
  h.paint();
  const basis = h.query();
  h.fills.length = 0;
  h.renderer.pictureResizeGuide({
    basis,
    size: { width: 6000, height: 3000 },
    mode: 'anchored',
    anchor: 'unknown',
  });
  h.paint();
  assert.equal(h.blue().filter((f) => f.r[2] === 6).length, 0);
  assert.equal(h.blue().filter((f) => f.r[2] === 8).length, 8);
});
