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
test('actual renderer requests resize overlay only after completed current stamp and private picture receipt', async (t) => {
  const h = await fixture(t);
  h.renderer.pictureResizeSelection(h.query);
  h.paint();
  assert(h.calls.length > 0);
  assert(
    h.calls.every((c) => c.current && c.acknowledged),
    'ResizeQueryBeforeCompletedReceipt',
  );
  assert.equal(h.blue().filter((f) => f.r[2] === 8).length, 3);
  h.fills.length = 0;
  h.renderer.select({ active: false });
  h.paint();
  assert.equal(h.blue().filter((f) => f.r[2] === 8).length, 3);
});
test('invalid current scope suppresses both old guide and handles without admitting stale coordinates', async (t) => {
  const h = await fixture(t);
  const basis = pictureResizeBasis(
    h.renderer.selectedPicturePaint(),
    { section: 0, pictureNode: 1, width: 3000, height: 1500 },
    { allowPartialHandles: true },
  );
  assert(basis);
  h.renderer.pictureResizeSelection(h.query);
  h.renderer.pictureResizeGuide({ basis, size: { width: 6000, height: 3000 } });
  h.deny();
  h.fills.length = 0;
  h.paint();
  assert.equal(h.blue().length, 0);
});
test('document output never queries host resize scope or paints handles or preview guide', async (t) => {
  const h = await fixture(t, { output: true });
  let queries = 0;
  const basis = {
    origin: [0, 0],
    x: [40, 0],
    y: [0, 20],
    corner: [40, 20],
    width: 3000,
    height: 1500,
    determinant: 800,
  };
  h.renderer.pictureResizeSelection(() => {
    queries++;
    return basis;
  });
  h.renderer.pictureResizeGuide({ basis, size: { width: 6000, height: 3000 } });
  const page = {
    ordinal: 0,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    pixelWidth: 800,
    pixelHeight: 600,
  };
  const output = h.renderer.documentOutputPort.preparePages([page]).paintPage(page, h.ctx);
  assert(output.pictures.has('0:1'));
  assert(h.draws.length > 0, 'ActualOutputPicturePaintRequired');
  assert.equal(queries, 0);
  assert.equal(h.blue().length, 0);
});
test('failed post-layout frame cannot invoke resize scope or decorate a partial frame', async (t) => {
  const h = await fixture(t);
  h.renderer.pictureResizeSelection(h.query);
  h.abortLayout();
  h.fills.length = 0;
  assert.throws(() => h.paint(), /PostLayoutAbort/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.blue().length, 0);
});
