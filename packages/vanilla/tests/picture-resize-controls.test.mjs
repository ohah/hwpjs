import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurfacePictureResizeControls } from '../src/picture-resize-controls.ts';
import { bindObjectSelectionEvents } from '../src/object-selection.ts';
import { createObjectPropertiesPort } from '../../../apps/demo/src/object-properties-port.ts';
import { pictureResizeTarget } from '../../../web/preview/picture-resize-target.mjs';

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
function fixture(format = 'hwpx') {
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
    return allowed && target ? { state, lease, source, selection, modalRevision, target } : null;
  };
  const controls = createSurfacePictureResizeControls({
    canvas,
    viewport,
    window,
    renderer,
    capture,
    note,
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
for (const format of ['hwp5', 'hwpx'])
  test(`${format} certified resize shares numeric target, visible guide, and one release request`, async () => {
    const f = fixture(format);
    const capture = f.port.capture();
    assert.ok(capture.target);
    assert.equal(f.basis().pictureNode, capture.target.pictureNode);
    assert.equal(f.basis().resizeRecordNode, capture.target.resizeRecordNode);
    f.canvas.send('pointerdown');
    for (const value of [110, 140, 192])
      f.canvas.send('pointermove', { clientX: value, clientY: value / 2 });
    assert.equal(f.requests.length, 0);
    assert.ok(f.guides.some((g) => g?.size.width === 14400));
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.requests.length, 1);
    const drag = f.requests[0];
    await f.port.apply(capture, { width: '50.8', height: '25.4' });
    assert.deepEqual(f.requests[1], drag);
    assert.equal(f.canvas.captured, null);
    f.controls.close();
  });
test('capture order: owned handle wins before generic selector; ordinary text pointer path stays default', () => {
  const f = fixture();
  let generic = 0,
    text = 0;
  const unbind = bindObjectSelectionEvents({
    ...f,
    selection: {
      clear() {},
      pointerDown() {
        generic++;
        return false;
      },
      pointerMove() {},
      pointerUp() {},
      keyDown() {
        return false;
      },
      quarantinePendingKey() {
        return false;
      },
      quarantinePendingBeforeInput() {
        return false;
      },
    },
    point: (e) => ({ x: e.clientX, y: e.clientY }),
  });
  f.canvas.addEventListener('pointerdown', () => text++);
  const down = f.canvas.send('pointerdown');
  assert.equal(down.defaultPrevented, true);
  assert.equal(generic, 0);
  assert.equal(text, 0);
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.requests.length, 1);
  const plain = f.canvas.send('pointerdown', { clientX: 10, clientY: 10 });
  assert.equal(plain.defaultPrevented, false);
  assert.equal(generic, 1);
  assert.equal(text, 1);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a'])
    assert.equal(f.canvas.send('keydown', { key }).defaultPrevented, false);
  unbind();
  f.controls.close();
});
for (const kind of ['state', 'token', 'document', 'lease', 'source', 'selection', 'modal', 'focus'])
  test(`release refuses changed ${kind} even when target geometry is unchanged`, () => {
    const f = fixture();
    f.canvas.send('pointerdown');
    f.canvas.send('pointermove', { clientX: 192, clientY: 96 });
    f.change(kind);
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.deepEqual(f.requests, []);
    assert.equal(f.canvas.captured, null);
    f.controls.close();
  });
test('observed document ABA cancels old capture instead of accepting restored coordinates', () => {
  const f = fixture();
  f.canvas.send('pointerdown');
  const a = f.state();
  f.change('document');
  f.observe();
  f.controls.observeState(a);
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.requests.length, 0);
  f.controls.close();
});
for (const kind of ['layout', 'scale', 'scroll'])
  test(`changed ${kind} cancels guide and never rewrites the picture`, () => {
    const f = fixture();
    f.canvas.send('pointerdown');
    if (kind === 'layout') f.setX(20);
    else if (kind === 'scale') f.setScale(2);
    else {
      f.viewport.scrollTop = 20;
      f.viewport.send('scroll');
    }
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.requests.length, 0);
    assert.equal(f.canvas.captured, null);
    f.controls.close();
  });
for (const kind of ['Escape', 'blur', 'pointercancel', 'lostpointercapture'])
  test(`${kind} retires owned drag without a Native request`, () => {
    const f = fixture();
    f.canvas.send('pointerdown');
    f.canvas.send('pointermove', { clientX: 192, clientY: 96 });
    if (kind === 'Escape')
      assert.equal(f.canvas.send('keydown', { key: 'Escape' }).defaultPrevented, true);
    else if (kind === 'blur') f.window.send('blur');
    else f.canvas.send(kind);
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.requests.length, 0);
    assert.equal(f.canvas.captured, null);
    f.controls.close();
  });
test('descendant blur is not window loss, and Shift uses existing aspect-ratio calculation', () => {
  const f = fixture();
  f.canvas.send('pointerdown', { clientY: 24 });
  f.input.send('blur');
  f.canvas.send('pointerup', { clientX: 144, clientY: 24, shiftKey: true });
  assert.deepEqual(
    f.requests.map(({ width, height }) => [width, height]),
    [[10800, 5400]],
  );
  f.controls.close();
});
test('untrusted and modified pointer downs do not consume text/default events or start drag', () => {
  for (const delta of [
    { isTrusted: false },
    { isPrimary: false },
    { button: 1 },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { defaultPrevented: true },
  ]) {
    const f = fixture();
    const event = f.canvas.send('pointerdown', delta);
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.requests.length, 0);
    assert.equal(f.canvas.captured, null);
    if (!delta.defaultPrevented) assert.equal(event.defaultPrevented, false);
    f.controls.close();
  }
});
test('unavailable, protected and relative pictures expose no handles and issue no resize', () => {
  for (const kind of ['unavailable', 'protected', 'relative', 'readonly']) {
    const f = fixture();
    if (kind === 'protected') f.picture.sizeProtected = true;
    else if (kind === 'relative') f.picture.geometry.widthRelative = 0;
    else if (kind === 'unavailable')
      f.controls.observeState({ status: 'ready', capabilities: { pictureResizeAvailable: false } });
    else
      f.controls.observeState({
        status: 'ready',
        capabilities: { pictureResizeAvailable: true, readOnly: true },
      });
    assert.equal(f.basis(), null);
    f.canvas.send('pointerdown');
    f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
    assert.equal(f.requests.length, 0);
    f.controls.close();
  }
});
test('one pointer owner and dispose make late releases inert', () => {
  const f = fixture();
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { pointerId: 2, clientX: 192, clientY: 96 });
  assert.equal(f.requests.length, 0);
  f.canvas.send('pointerdown');
  f.controls.close();
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.requests.length, 0);
});

test('late pointercancel after committed release leaves one request and next drag usable', () => {
  const f = fixture();
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.equal(f.requests.length, 1);
  f.canvas.send('pointercancel');
  f.canvas.send('lostpointercapture');
  f.canvas.send('pointerup', { clientX: 250, clientY: 125 });
  assert.equal(f.requests.length, 1);
  f.canvas.send('pointerdown');
  f.canvas.send('pointerup', { clientX: 144, clientY: 72 });
  assert.equal(f.requests.length, 2);
  f.controls.close();
});

test('size protection acquired during a live drag retires guide and cannot commit after unlock', () => {
  const f = fixture();
  f.canvas.send('pointerdown');
  f.canvas.send('pointermove', { clientX: 192, clientY: 96 });
  assert.ok(f.guides.some(Boolean));
  f.picture.sizeProtected = true;
  f.canvas.send('pointermove', { clientX: 200, clientY: 100 });
  assert.equal(f.canvas.captured, null);
  assert.equal(f.guides.at(-1), null);
  assert.equal(f.basis(), null);
  f.picture.sizeProtected = false;
  f.canvas.send('pointerup', { clientX: 192, clientY: 96 });
  assert.deepEqual(f.requests, []);
  f.controls.close();
});
