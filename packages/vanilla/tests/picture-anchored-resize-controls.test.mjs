import test from 'node:test';
import { capturePictureSelection } from '../../../web/preview/picture-selection-capture.mjs';
import assert from 'node:assert/strict';
import { createSurfacePictureResizeControls } from '../src/picture-resize-controls.ts';
import { createObjectPropertiesPort } from '../../../apps/demo/src/object-properties-port.ts';
import {
  anchoredPictureResizeDisplayTarget,
  anchoredPictureResizeSelector,
  pictureResizeTarget,
} from '../../../web/preview/picture-resize-target.mjs';

// Deterministic DOM capture/bubble replay. Real shared drag code and selection
// transport run; the certified Surface scope and Native request endpoint are controlled.
class Target {
  parent = null;
  listeners = new Map();
  style = {};
  captured = null;
  scrollTop = 0;
  scrollLeft = 0;
  addEventListener(type, fn, options = {}) {
    const item = { fn, capture: options === true || options.capture === true };
    const rows = this.listeners.get(type) ?? [];
    rows.push(item);
    this.listeners.set(type, rows);
    options.signal?.addEventListener('abort', () => this.removeEventListener(type, fn));
  }
  removeEventListener(type, fn) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((x) => x.fn !== fn),
    );
  }
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
  setPointerCapture(id) {
    this.captured = id;
  }
  hasPointerCapture(id) {
    return this.captured === id;
  }
  releasePointerCapture(id) {
    if (this.captured === id) {
      this.captured = null;
      this.send('lostpointercapture', { pointerId: id });
    }
  }
  send(type, delta = {}) {
    const path = [];
    for (let node = this; node; node = node.parent) path.push(node);
    const event = {
      type,
      target: this,
      isTrusted: true,
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: 96,
      clientY: 48,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.immediate = true;
        this.stopped = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      composedPath: () => path,
      ...delta,
    };
    const invoke = (node, capture) => {
      event.immediate = false;
      for (const row of (node.listeners.get(type) ?? []).slice()) {
        if (row.capture !== capture) continue;
        row.fn(event);
        if (event.immediate) break;
      }
    };
    for (const node of [...path].reverse()) {
      invoke(node, true);
      if (event.stopped) return event;
    }
    for (const node of path) {
      invoke(node, false);
      if (event.stopped) return event;
    }
    return event;
  }
}
function fixture(format = 'hwpx', config = {}) {
  const window = new Target(),
    document = new Target(),
    viewport = new Target(),
    canvas = new Target(),
    input = new Target();
  document.parent = window;
  viewport.parent = document;
  canvas.parent = viewport;
  input.parent = viewport;
  let counter = 0,
    allowed = true,
    scale = 1,
    x = 0;
  let state = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    status: 'ready',
    capabilities: { pictureResizeAvailable: true },
  };
  state.token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
  };
  const picture = {
    section: 0,
    pictureNode: 9,
    ...(format === 'hwp5' ? { resizeRecordNode: 77 } : {}),
    geometry: { width: 7200, height: 3600, widthRelative: 4, heightRelative: 2 },
  };
  state.content = { format, limited: false, pictures: [picture] };
  let lease = {},
    source = state.content,
    selection = { target: { kind: 'picture', section: 0, pictureNode: 9 } },
    modalRevision = 0;
  const issued = Object.freeze({});
  const queries = [],
    anchoredRequests = [];
  const requests = [],
    guides = [],
    note = { textContent: '' };
  let selectionBasis;
  const renderer = {
    viewScale: () => scale,
    selectedPicturePaint: () => ({ x, y: 0, width: 96, height: 48, paintPlan: { state: 'plain' } }),
    pictureResizeGuide: (v) => guides.push(v),
    pictureResizeSelection: (v) => {
      selectionBasis = v;
    },
  };
  const capture = () => {
    const target = pictureResizeTarget(picture);
    return allowed && target
      ? {
          state,
          lease,
          source,
          selection,
          modalRevision,
          target,
          legacyAvailable: config.legacyAvailable,
          ...(config.anchorCurrent ? { anchoredCurrent: config.anchorCurrent } : {}),
        }
      : null;
  };
  const controls = createSurfacePictureResizeControls({
    canvas,
    viewport,
    window,
    renderer,
    capture,
    note,
    async queryAnchored(scope) {
      const selector = anchoredPictureResizeSelector(scope.target, format);
      queries.push(selector);
      if (config.query) return config.query(scope, selector, issued);
      return {
        state: 'available',
        target: issued,
        observation: {
          profileVersion: 1,
          format,
          ...selector,
          width: scope.target.width,
          height: scope.target.height,
          horizontalOffset: 100,
          verticalOffset: 200,
          historyRevision: 1,
        },
      };
    },
    requestAnchored(target, width, height, anchor, scope) {
      anchoredRequests.push({ target, width, height, anchor, scope });
      return config.commit ? config.commit() : true;
    },
    request(width, height) {
      const target = capture()?.target;
      if (!target) return false;
      requests.push({
        kind: 'picture-resize',
        section: target.section,
        pictureNode: target.resizeRecordNode ?? target.pictureNode,
        width,
        height,
      });
      return true;
    },
  });
  controls.observeState(state);
  const editor = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    requestExperimental: async (message) => {
      requests.push(message);
      return { status: 'committed-with-snapshot', state };
    },
  };
  const port = createObjectPropertiesPort(editor, () => ({
    getContextPicture: () => ({ ...state.token, section: 0, pictureNode: 9 }),
  }));
  return {
    window,
    document,
    viewport,
    canvas,
    input,
    renderer,
    controls,
    queries,
    issued,
    anchoredRequests,
    requests,
    guides,
    note,
    picture,
    port,
    scope: capture,
    basis: () => selectionBasis?.() ?? null,
    setAllowed(v) {
      allowed = v;
    },
    setScale(v) {
      scale = v;
    },
    setX(v) {
      x = v;
    },
    change(kind) {
      if (kind === 'state' || kind === 'token' || kind === 'document') {
        state = {
          ...state,
          stateVersion: ++counter,
          token: {
            ...state.token,
            ...(kind === 'document' ? { documentId: 'other' } : { operationRevision: counter + 1 }),
          },
        };
      } else if (kind === 'lease') lease = {};
      else if (kind === 'source') source = {};
      else if (kind === 'selection') selection = { ...selection };
      else if (kind === 'modal') modalRevision++;
      else allowed = false;
    },
    observe() {
      controls.observeState(state);
    },
    state: () => state,
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function ready(f) {
  f.basis();
  await tick();
}
const points = [
  [-1, -1, 'bottom_right'],
  [0, -1, 'bottom_center'],
  [1, -1, 'bottom_left'],
  [-1, 0, 'center_right'],
  [1, 0, 'center_left'],
  [-1, 1, 'top_right'],
  [0, 1, 'top_center'],
  [1, 1, 'top_left'],
];
for (const format of ['hwp5', 'hwpx'])
  test(`${format} eight anchored pointer gestures retain issued target and exact physical query selector`, async () => {
    for (const [xSide, ySide, anchor] of points) {
      const f = fixture(format);
      await ready(f);
      assert.deepEqual(f.queries, [{ section: 0, pictureNode: format === 'hwp5' ? 77 : 9 }]);
      const down = { clientX: (xSide + 1) * 48, clientY: (ySide + 1) * 24 };
      const end = { clientX: down.clientX + xSide * 48, clientY: down.clientY + ySide * 24 };
      f.canvas.send('pointerdown', down);
      f.canvas.send('pointermove', end);
      assert(f.guides.some((g) => g?.mode === 'anchored' && g.anchor === anchor));
      f.canvas.send('pointerup', end);
      f.canvas.send('pointerup', end);
      assert.equal(f.anchoredRequests.length, 1);
      const applied = f.anchoredRequests[0];
      assert.equal(applied.target, f.issued);
      assert.equal(applied.anchor, anchor);
      assert.equal(applied.width, xSide ? 10800 : 7200);
      assert.equal(applied.height, ySide ? 5400 : 3600);
      assert.deepEqual(f.requests, []);
      assert.equal(f.canvas.captured, null);
      assert.equal(f.guides.at(-1), null);
      f.controls.close();
    }
  });
test('pending prefetch cannot start a drag or resume that gesture after response', async () => {
  let resolve;
  const f = fixture('hwpx', {
    query: (scope, selector, issued) =>
      new Promise((done) => {
        resolve = () =>
          done({
            state: 'available',
            target: issued,
            observation: {
              profileVersion: 1,
              format: 'hwpx',
              ...selector,
              width: 7200,
              height: 3600,
              horizontalOffset: 0,
              verticalOffset: 0,
              historyRevision: 1,
            },
          });
      }),
  });
  f.basis();
  await tick();
  f.canvas.send('pointerdown');
  assert.equal(f.canvas.captured, null);
  resolve();
  await tick();
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.deepEqual(f.anchoredRequests, []);
  assert.deepEqual(f.requests, []);
  f.controls.close();
});
test('stale async query on every scope axis cannot arm a later gesture', async () => {
  for (const axis of [
    'state',
    'token',
    'document',
    'lease',
    'source',
    'selection',
    'modal',
    'focus',
  ]) {
    let resolve;
    const f = fixture('hwpx', {
      query: (scope, selector, target) =>
        new Promise((done) => {
          resolve = () =>
            done({
              state: 'available',
              target,
              observation: {
                profileVersion: 1,
                format: 'hwpx',
                ...selector,
                width: 7200,
                height: 3600,
                horizontalOffset: 0,
                verticalOffset: 0,
                historyRevision: 1,
              },
            });
        }),
    });
    f.basis();
    await tick();
    f.change(axis);
    resolve();
    await tick();
    f.canvas.send('pointerdown');
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.anchoredRequests.length, 0, axis);
    assert.equal(f.requests.length, 0, axis);
    f.controls.close();
  }
});
test('anchored drag rejects changed certified scope without legacy fallback', async () => {
  for (const axis of [
    'state',
    'token',
    'document',
    'lease',
    'source',
    'selection',
    'modal',
    'focus',
  ]) {
    const f = fixture();
    await ready(f);
    f.canvas.send('pointerdown');
    f.change(axis);
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.anchoredRequests.length, 0, axis);
    assert.equal(f.requests.length, 0, axis);
    assert.equal(f.canvas.captured, null);
    f.controls.close();
  }
});
test('explicit unavailable observation alone permits unchanged legacy route', async () => {
  const f = fixture('hwp5', {
    query: async () => ({ state: 'unavailable', reason: 'InlinePicture' }),
  });
  await ready(f);
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.anchoredRequests, []);
  f.controls.close();
});
test('query failure and mismatched Native observations block instead of selecting legacy', async () => {
  for (const wrong of [
    'reject',
    'format',
    'pictureNode',
    'width',
    'historyRevision',
    'horizontalOffset',
  ]) {
    const f = fixture('hwp5', {
      query: async (scope, selector, target) => {
        if (wrong === 'reject') throw Error('NativeQueryFailure');
        const observation = {
          profileVersion: 1,
          format: 'hwp5',
          ...selector,
          width: 7200,
          height: 3600,
          horizontalOffset: 0,
          verticalOffset: 0,
          historyRevision: 1,
        };
        observation[wrong] =
          wrong === 'format'
            ? 'hwpx'
            : wrong === 'historyRevision'
              ? 1.5
              : wrong === 'horizontalOffset'
                ? 0x80000000
                : -1;
        return { state: 'available', target, observation };
      },
    });
    await ready(f);
    f.canvas.send('pointerdown');
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.requests.length, 0, wrong);
    assert.equal(f.anchoredRequests.length, 0, wrong);
    f.controls.close();
  }
});
test('midpoint anchors reject odd offset deltas and accept exact shifted aspect ratio sizes', async () => {
  for (const width of [7201, 7204]) {
    const f = fixture();
    await ready(f);
    f.canvas.send('pointerdown', { clientX: 96, clientY: 24 });
    const end = { clientX: (96 * width) / 7200, clientY: 24, shiftKey: true };
    f.canvas.send('pointermove', end);
    f.canvas.send('pointerup', end);
    assert.equal(f.requests.length, 0);
    assert.equal(f.anchoredRequests.length, width === 7201 ? 0 : 1);
    if (width === 7204)
      assert.deepEqual(
        [f.anchoredRequests[0].width, f.anchoredRequests[0].height, f.anchoredRequests[0].anchor],
        [7204, 3602, 'center_left'],
      );
    assert.equal(f.guides.at(-1), null);
    assert.equal(f.canvas.captured, null);
    f.controls.close();
  }
});
test('commit refusal throw and async rejection never replay legacy after provisional cleanup', async () => {
  for (const kind of ['false', 'throw', 'reject']) {
    const f = fixture('hwpx', {
      commit: () => {
        if (kind === 'throw') throw Error('CommitFailure');
        return kind === 'false' ? false : Promise.reject(Error('CommitFailure'));
      },
    });
    await ready(f);
    f.canvas.send('pointerdown');
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    await tick();
    assert.equal(f.anchoredRequests.length, 1);
    assert.equal(f.requests.length, 0);
    assert.equal(f.canvas.captured, null);
    assert.equal(f.guides.at(-1), null);
    f.canvas.send('pointercancel');
    f.canvas.send('pointerup', { clientX: 240, clientY: 120 });
    assert.equal(f.anchoredRequests.length, 1);
    f.controls.close();
  }
});
test('in-flight command prevents duplicate gesture while normal capture cleanup retains the issued target', async () => {
  let finish;
  const f = fixture('hwpx', {
    commit: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await ready(f);
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.anchoredRequests[0].target, f.issued);
  assert.equal(f.canvas.captured, null);
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 144, clientY: 72 });
  assert.equal(f.anchoredRequests.length, 1);
  finish();
  await tick();
  await ready(f);
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 144, clientY: 72 });
  assert.equal(f.anchoredRequests.length, 2);
  finish();
  await tick();
  f.controls.close();
});
test('escape blur scroll cancellation and disposal cannot restore stale prefetched authority', async () => {
  for (const kind of ['Escape', 'blur', 'scroll', 'close', 'pointercancel', 'lostpointercapture']) {
    const f = fixture();
    await ready(f);
    f.canvas.send('pointerdown');
    if (kind === 'Escape') f.canvas.send('keydown', { key: 'Escape' });
    else if (kind === 'blur') f.window.send('blur');
    else if (kind === 'scroll') f.viewport.send('scroll');
    else if (kind === 'close') f.controls.close();
    else f.canvas.send(kind);
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.anchoredRequests.length, 0, kind);
    assert.equal(f.requests.length, 0, kind);
    assert.equal(f.canvas.captured, null);
    assert.equal(f.guides.at(-1), null);
    f.controls.close();
  }
});
test('physical selectors never substitute H5 component identity or use HX resizeRecordNode', () => {
  assert.equal(anchoredPictureResizeSelector({ section: 0, pictureNode: 9 }, 'hwp5'), null);
  assert.deepEqual(
    anchoredPictureResizeSelector({ section: 0, pictureNode: 9, resizeRecordNode: 77 }, 'hwp5'),
    { section: 0, pictureNode: 77 },
  );
  assert.deepEqual(
    anchoredPictureResizeSelector({ section: 0, pictureNode: 9, resizeRecordNode: 77 }, 'hwpx'),
    { section: 0, pictureNode: 9 },
  );
});

test('pointer capture failure cleans the provisional gesture and next prefetched drag remains usable', async () => {
  const f = fixture();
  await ready(f);
  const acquire = f.canvas.setPointerCapture;
  f.canvas.setPointerCapture = () => {
    throw Error('CaptureUnavailable');
  };
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.anchoredRequests.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.canvas.captured, null);
  assert.equal(f.guides.at(-1), null);
  f.canvas.setPointerCapture = acquire;
  await ready(f);
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 144, clientY: 72 });
  assert.equal(f.anchoredRequests.length, 1);
  f.controls.close();
});

test('H5 floating PAGE/PAGE metadata uses geometry when resizeGeometry is null and selects physical11', () => {
  const picture = {
    section: 0,
    pictureNode: 10,
    resizeRecordNode: 11,
    recordNode: 11,
    geometry: {
      width: 7200,
      height: 3600,
      widthRelative: 4,
      heightRelative: 2,
      treatAsCharacter: false,
    },
    resizeGeometry: null,
    position: { relations: [0, 0, 0, 0] },
    source: { component_node: 10, picture_node: 11 },
  };
  const legacy = pictureResizeTarget(picture);
  assert(legacy);
  assert.deepEqual(anchoredPictureResizeSelector(legacy, 'hwp5'), { section: 0, pictureNode: 11 });
  let receipt = {};
  const source = { format: 'hwp5', pictures: [picture] };
  const witness = capturePictureSelection(() => ({ picture, receipt, source, epoch: 1 }));
  assert(witness);
  assert.deepEqual(anchoredPictureResizeDisplayTarget(picture, 'hwp5', witness), legacy);
  assert.equal(anchoredPictureResizeDisplayTarget(picture, 'hwp5', null), null);
  assert.equal(
    anchoredPictureResizeDisplayTarget({ ...picture, resizeRecordNode: 10 }, 'hwp5', witness),
    null,
  );
  receipt = {};
  assert.equal(anchoredPictureResizeDisplayTarget(picture, 'hwp5', witness), null);
});
test('anchor-only certified selection queries before handles appear and never exposes a legacy fallback', async () => {
  const f = fixture('hwp5', { legacyAvailable: false });
  assert.equal(f.basis(), null);
  await tick();
  assert(f.basis());
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.anchoredRequests.length, 1);
  assert.equal(f.requests.length, 0);
  f.controls.close();
  const denied = fixture('hwp5', {
    legacyAvailable: false,
    query: async () => ({ state: 'unavailable', reason: 'UnsupportedNativeOwner' }),
  });
  await ready(denied);
  assert.equal(denied.basis(), null);
  denied.canvas.send('pointerdown');
  denied.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(denied.requests.length, 0);
  assert.equal(denied.anchoredRequests.length, 0);
  denied.controls.close();
});
test('retired renderer selection witness cancels an anchor-only drag even with unchanged identity', async () => {
  let valid = true;
  const f = fixture('hwp5', { legacyAvailable: false, anchorCurrent: () => valid });
  await ready(f);
  f.canvas.send('pointerdown');
  valid = false;
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.anchoredRequests.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.canvas.captured, null);
  f.controls.close();
});
