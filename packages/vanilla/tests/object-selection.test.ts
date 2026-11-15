// @ts-ignore Actual JS direct-input stale-frame gate.
import * as pointerFrameGate from '../../../web/preview/canvas-pointer-frame-gate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectSelection,
  objectSelectionOwner,
  type ObjectSelectionScene,
  type ObjectSelectionPointer,
  type ObjectPropertiesKey,
} from '../src/object-selection.ts';
import type { CanvasObjectTarget } from '../src/object-activation.ts';
import type { StateToken } from '@hwpjs/core';

type State = { token: StateToken; stateVersion: number; selection: unknown };
const token = (): StateToken => ({
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
});
const chart = (): CanvasObjectTarget => ({ kind: 'chart', section: 0, wrapper: 17 });
const picture = (): CanvasObjectTarget => ({ kind: 'picture', section: 0, pictureNode: 9 });
const drawing = (): CanvasObjectTarget => ({ kind: 'drawing', section: 0, drawingNode: 11 });
const pointer = (delta: Partial<ObjectSelectionPointer> = {}): ObjectSelectionPointer => ({
  trusted: true,
  onCanvas: true,
  primary: true,
  pointerId: 1,
  button: 0,
  x: 10,
  y: 20,
  clientX: 10,
  clientY: 20,
  ...delta,
});
const p = (delta: Partial<ObjectPropertiesKey> = {}): ObjectPropertiesKey => ({
  trusted: true,
  onCanvas: true,
  key: 'p',
  ...delta,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture(target: CanvasObjectTarget = chart()) {
  let state: State = { token: token(), stateVersion: 4, selection: { text: 'caret' } },
    lease: object = {},
    frame: object = {},
    source: any = {
      format: 'hwpx',
      chartTargets: [{ section: 0, wrapper: 17, paragraph: 0, anchorUnit: 0 }],
      paragraphs: [{ section: 0, paragraph: 0, text: '\ufffc' }],
      oles: [
        {
          section: 0,
          chartWrapper: 17,
          paragraph: 0,
          anchorUnit: 0,
          state: 'located',
          representation: 'chart-alternative',
        },
      ],
      pictures: [{ section: 0, pictureNode: 9, state: 'located' }],
      drawings: [
        {
          section: 0,
          drawingNode: 11,
          hostParagraph: 0,
          anchorUnit: 0,
          source: {
            drawing_node: 11,
            paragraph: 1,
            anchor_unit: 0,
            transform_identity: true,
            rendering: { angle: 0 },
            group_context: null,
          },
        },
      ],
    };
  let modalRevision = 0,
    ready = true,
    focused = false,
    commits = 0,
    hitResult: CanvasObjectTarget | null = target;
  let commitOverride:
    | ((
        request: Parameters<Parameters<typeof createObjectSelection<State>>[0]['commit']>[0],
      ) => Promise<object | null>)
    | null = null;
  let pendingHitOverride: (() => CanvasObjectTarget | null) | null = null;
  let focusOverride: (() => boolean) | null = null,
    hitOverride: (() => CanvasObjectTarget | null) | null = null;
  const errors: unknown[] = [],
    requests: any[] = [];
  const capture = (): ObjectSelectionScene<State> | null =>
    ready ? { state, lease, frame, source, modalRevision } : null;
  const actor = createObjectSelection<State>({
    capture,
    hit: () => (hitOverride ? hitOverride() : hitResult),
    pendingHit: () => (pendingHitOverride ? pendingHitOverride() : hitResult),
    hostFocused: () => (focusOverride ? focusOverride() : focused),
    async commit(request) {
      commits++;
      if (commitOverride) return commitOverride(request);
      if (!request.current()) return null;
      state = { token: state.token, stateVersion: state.stateVersion + 1, selection: null };
      frame = {};
      focused = true;
      actor.observeState(state);
      return request.confirm(capture()!);
    },
    onError: (error) => errors.push(error),
  });
  return {
    actor,
    errors,
    requests,
    capture,
    commits: () => commits,
    state: () => state,
    frame: () => frame,
    source: () => source,
    setState(next: State, observe = true) {
      state = next;
      if (observe) actor.observeState(state);
    },
    setFrame(next: object) {
      frame = next;
    },
    setLease(next: object) {
      lease = next;
    },
    setSource(next: any) {
      source = next;
    },
    setModal(n: number) {
      modalRevision = n;
    },
    setReady(v: boolean) {
      ready = v;
    },
    setFocused(v: boolean) {
      focused = v;
    },
    setHit(v: CanvasObjectTarget | null) {
      hitResult = v;
    },
    onCommit(fn: NonNullable<typeof commitOverride>) {
      commitOverride = fn;
    },
    onFocus(fn: () => boolean) {
      focusOverride = fn;
    },
    onPendingHit(fn: () => CanvasObjectTarget | null) {
      pendingHitOverride = fn;
    },
    onHit(fn: () => CanvasObjectTarget | null) {
      hitOverride = fn;
    },
    register() {
      return actor.registerPropertiesRequest((event) => {
        requests.push(event);
      });
    },
    async select() {
      assert.equal(actor.pointerDown(pointer()), true);
      await actor.pointerUp(pointer());
      return actor.current();
    },
    confirmOwned(
      request: Parameters<NonNullable<typeof commitOverride>>[0],
      delta: Partial<State> = {},
      keepFrame = false,
    ) {
      state = { ...state, stateVersion: state.stateVersion + 1, selection: null, ...delta };
      if (!keepFrame) frame = {};
      focused = true;
      actor.observeState(state);
      return request.confirm(capture()!);
    },
  };
}

test('a current hit is only intent; completed single click plus owned receipt establishes identity-only object mode', async () => {
  const f = fixture();
  assert.equal(f.actor.current(), null);
  assert.equal(f.actor.pointerDown(pointer()), true);
  assert.equal(f.actor.current(), null);
  assert.equal(f.commits(), 0);
  await f.actor.pointerUp(pointer());
  const selected = f.actor.current()!;
  assert.deepEqual(selected.target, chart());
  assert.equal(f.commits(), 1);
  assert.equal(f.state().selection, null);
  assert(
    Object.isFrozen(selected) &&
      Object.isFrozen(selected.target) &&
      Object.isFrozen(selected.token),
  );
  assert.deepEqual(Object.keys(selected).sort(), ['target', 'token']);
  f.actor.dispose();
});

test('no down, refused host transition or forged token-shaped receipt cannot create selection', async () => {
  const f = fixture();
  await f.actor.pointerUp(pointer());
  assert.equal(f.commits(), 0);
  assert.equal(f.actor.current(), null);
  for (const receipt of [null, {}, { target: chart(), token: token() }]) {
    const g = fixture();
    g.onCommit(async () => receipt);
    await g.select();
    assert.equal(g.actor.current(), null);
    g.actor.dispose();
  }
});

test('untrusted, foreign, modified, secondary or malformed pointer is never consumed', () => {
  for (const delta of [
    { trusted: false },
    { onCanvas: false },
    { primary: false },
    { button: 1 },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
    { x: NaN },
    { clientY: Infinity },
    { pointerId: NaN },
  ]) {
    const f = fixture();
    assert.equal(f.actor.pointerDown(pointer(delta)), false);
    assert.equal(f.actor.current(), null);
    assert.equal(f.commits(), 0);
    f.actor.dispose();
  }
});

test('drag, cancelled pointer, mismatched pointer or outside release cannot become a single-click selection', async () => {
  for (const delta of [
    { pointerId: 2 },
    { onCanvas: false },
    { trusted: false },
    { shiftKey: true },
    { clientX: 30 },
  ]) {
    const f = fixture();
    f.actor.pointerDown(pointer());
    await f.actor.pointerUp(pointer(delta));
    assert.equal(f.commits(), 0);
    assert.equal(f.actor.current(), null);
  }
  const f = fixture();
  f.actor.pointerDown(pointer());
  f.actor.pointerMove({ pointerId: 1, clientX: 20, clientY: 20 });
  await f.actor.pointerUp(pointer());
  assert.equal(f.commits(), 0);
  const g = fixture();
  g.actor.pointerDown(pointer());
  g.actor.clear('pointer-cancel');
  await g.actor.pointerUp(pointer());
  assert.equal(g.commits(), 0);
});

test('changed state, token, lease, painted frame, source or modal identity before release refuses commit', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => f.setState({ ...f.state() }),
    (f: ReturnType<typeof fixture>) =>
      f.setState({ ...f.state(), token: { ...token(), documentId: 'new' } }),
    (f: ReturnType<typeof fixture>) => f.setLease({}),
    (f: ReturnType<typeof fixture>) => f.setFrame({}),
    (f: ReturnType<typeof fixture>) => f.setSource(structuredClone(f.source())),
    (f: ReturnType<typeof fixture>) => f.setModal(1),
    (f: ReturnType<typeof fixture>) => f.setReady(false),
  ]) {
    const f = fixture();
    f.actor.pointerDown(pointer());
    mutate(f);
    await f.actor.pointerUp(pointer());
    assert.equal(f.commits(), 0);
    assert.equal(f.actor.current(), null);
  }
});

test('target and source membership are rechecked after callbacks and on pointer release', async () => {
  const f = fixture();
  f.onHit(() => {
    f.setFrame({});
    return chart();
  });
  assert.equal(f.actor.pointerDown(pointer()), false);
  const g = fixture();
  g.actor.pointerDown(pointer());
  g.setHit(picture());
  await g.actor.pointerUp(pointer());
  assert.equal(g.commits(), 0);
  const h = fixture();
  h.source().chartTargets.push({ ...h.source().chartTargets[0] });
  assert.equal(h.actor.pointerDown(pointer()), false);
  let calls = 0;
  const i = fixture();
  i.setHit({
    kind: 'chart',
    section: 0,
    get wrapper() {
      calls++;
      return 17;
    },
  });
  assert.equal(i.actor.pointerDown(pointer()), false);
  assert.equal(calls, 0);
});

test('only one exact owned Core clear and a fresh completed frame may confirm the transition', async () => {
  for (const scenario of [
    'old-frame',
    'extra-version',
    'text-selection',
    'operation',
    'different-source',
    'unobserved',
  ] as const) {
    const f = fixture();
    f.onCommit(async (request) => {
      if (scenario === 'unobserved') {
        const next = { ...f.state(), stateVersion: f.state().stateVersion + 1, selection: null };
        f.setState(next, false);
        f.setFrame({});
        f.setFocused(true);
        return request.confirm(f.capture()!);
      }
      if (scenario === 'different-source') f.setSource(structuredClone(f.source()));
      return f.confirmOwned(
        request,
        scenario === 'extra-version'
          ? { stateVersion: f.state().stateVersion + 2 }
          : scenario === 'text-selection'
            ? { selection: { text: 'caret' } }
            : scenario === 'operation'
              ? { token: { ...token(), operationRevision: 3 } }
              : {},
        scenario === 'old-frame',
      );
    });
    await f.select();
    assert.equal(f.actor.current(), null, scenario);
  }
});

test('external state followed by owned clear, ABA or rollback cannot lend a valid receipt', async () => {
  for (const scenario of ['extra-state', 'rollback', 'ABA'] as const) {
    const f = fixture();
    const original = f.state();
    f.onCommit(async (request) => {
      if (scenario === 'extra-state') {
        f.setState({ ...original, stateVersion: 5, selection: { text: 'external' } });
        return f.confirmOwned(request);
      }
      const receipt = f.confirmOwned(request);
      const confirmed = f.state();
      f.setState(original);
      if (scenario === 'ABA') f.setState(confirmed);
      return receipt;
    });
    await f.select();
    assert.equal(f.actor.current(), null, scenario);
  }
});

test('clear during asynchronous commit ignores late confirmation; pending gestures never overlap commits', async () => {
  const f = fixture(),
    job = deferred<object | null>();
  let request: any;
  f.onCommit(async (value) => {
    request = value;
    return job.promise;
  });
  f.actor.pointerDown(pointer());
  const pending = f.actor.pointerUp(pointer());
  assert.equal(f.actor.pointerDown(pointer({ pointerId: 2 })), true);
  await f.actor.pointerUp(pointer({ pointerId: 2 }));
  assert.equal(f.commits(), 1);
  f.actor.clear('input');
  const receipt = f.confirmOwned(request);
  assert.equal(receipt, null);
  job.resolve(receipt);
  await pending;
  assert.equal(f.actor.current(), null);
  assert.equal(f.commits(), 1);
});

test('textbox interior stays on the existing caret path; only supported unrotated ungrouped drawing border can select', async () => {
  const f = fixture(drawing());
  f.setHit(null);
  assert.equal(f.actor.pointerDown(pointer()), false);
  assert.equal(f.commits(), 0);
  f.setHit(drawing());
  await f.select();
  assert.deepEqual(f.actor.current()?.target, drawing());
  for (const mutate of [
    (s: any) => (s.drawings[0].source.rendering.angle = 90),
    (s: any) => (s.drawings[0].source.group_context = {}),
    (s: any) => (s.drawings[0].source.transform_identity = false),
    (s: any) => s.drawings.push({ ...s.drawings[0] }),
  ]) {
    const g = fixture(drawing());
    mutate(g.source());
    assert.equal(g.actor.pointerDown(pointer()), false);
  }
});

test('picture mode requires the host commit receipt, not picture hit or resize eligibility', async () => {
  const f = fixture(picture());
  f.onCommit(async () => null);
  await f.select();
  assert.equal(f.actor.current(), null);
  const g = fixture(picture());
  await g.select();
  assert.deepEqual(g.actor.current()?.target, picture());
  assert.equal(objectSelectionOwner(g.source(), picture()), true); // No Native resize capability is issued by membership.
});

test('bare P, foreign-form P and programmatic focus do not establish or activate selection', () => {
  const f = fixture();
  f.register();
  f.setFocused(true);
  assert.equal(f.actor.keyDown(p()), false);
  assert.equal(f.requests.length, 0);
  assert.equal(f.actor.current(), null);
});

test('P only consumes selected object plus current Canvas focus and emits one immutable identity request', async () => {
  for (const target of [chart(), picture(), drawing()]) {
    const f = fixture(target);
    f.register();
    await f.select();
    assert.equal(f.actor.keyDown(p()), true);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.requests[0], { type: 'properties-shortcut', target, token: token() });
    assert.equal(f.actor.current(), null);
    assert.equal(f.actor.keyDown(p()), false);
    assert(Object.isFrozen(f.requests[0]) && Object.isFrozen(f.requests[0].target));
  }
});

test('IME, repeat, modifiers, cancelled key and foreign input never grab P', async () => {
  for (const delta of [
    { trusted: false },
    { onCanvas: false },
    { defaultPrevented: true },
    { repeat: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
    { keyCode: 229 },
  ]) {
    const f = fixture();
    f.register();
    await f.select();
    assert.equal(f.actor.keyDown(p(delta)), false);
    assert.equal(f.requests.length, 0);
    f.actor.dispose();
  }
  const f = fixture();
  f.register();
  await f.select();
  f.setFocused(false);
  assert.equal(f.actor.keyDown(p()), false);
  f.setFocused(true);
  assert.equal(f.actor.keyDown(p()), false);
});

test('outside click, text/input/composition/history/document/modal clear never resurrects after focus returns', async () => {
  for (const reason of [
    'external-admission',
    'cancel-composition',
    'outside-pointer',
    'text-selection',
    'beforeinput',
    'input',
    'compositionstart',
    'compositionend',
    'history',
    'document',
    'modal',
    'window-blur',
    'detach',
  ]) {
    const f = fixture();
    f.register();
    await f.select();
    f.actor.clear(reason);
    f.setFocused(true);
    assert.equal(f.actor.keyDown(p()), false);
    assert.equal(f.requests.length, 0);
  }
  const f = fixture();
  f.register();
  await f.select();
  assert.equal(f.actor.keyDown(p({ key: 'z', ctrlKey: true })), false);
  assert.equal(f.actor.keyDown(p()), false);
});

test('currentness checks reject unobserved state/frame/lease/source/token changes and modal ABA', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => f.setState({ ...f.state() }, false),
    (f: ReturnType<typeof fixture>) => f.setFrame({}),
    (f: ReturnType<typeof fixture>) => f.setLease({}),
    (f: ReturnType<typeof fixture>) => f.setSource(structuredClone(f.source())),
    (f: ReturnType<typeof fixture>) => f.setModal(2),
    (f: ReturnType<typeof fixture>) => {
      (f.state().token as any).operationRevision++;
    },
    (f: ReturnType<typeof fixture>) => f.setReady(false),
  ]) {
    const f = fixture();
    f.register();
    await f.select();
    mutate(f);
    assert.equal(f.actor.keyDown(p()), false);
    assert.equal(f.requests.length, 0);
    f.setReady(true);
    assert.equal(f.actor.current(), null);
  }
});

test('reentrant focus/currentness checks cannot dispatch stale P', async () => {
  const f = fixture();
  f.register();
  await f.select();
  f.onFocus(() => {
    f.setState({ ...f.state(), stateVersion: 6 });
    return true;
  });
  assert.equal(f.actor.keyDown(p()), false);
  assert.equal(f.requests.length, 0);
  const g = fixture();
  g.register();
  g.onFocus(() => {
    g.actor.clear('focus-reentry');
    return true;
  });
  await g.select();
  assert.equal(g.actor.current(), null);
});

test('properties has one owner; an old unsubscribe cannot detach a replacement with the same callback', async () => {
  const f = fixture();
  let calls = 0;
  const callback = () => {
    calls++;
  };
  const old = f.actor.registerPropertiesRequest(callback);
  assert.throws(() => f.actor.registerPropertiesRequest(() => {}), /AlreadyAttached/);
  old();
  f.actor.registerPropertiesRequest(callback);
  old();
  await f.select();
  assert.equal(f.actor.keyDown(p()), true);
  assert.equal(calls, 1);
});

test('async callback is single-flight; errors and disposal never replay object requests', async () => {
  const f = fixture(),
    job = deferred<void>();
  f.actor.registerPropertiesRequest(() => job.promise);
  await f.select();
  assert.equal(f.actor.keyDown(p()), true);
  assert.equal(f.actor.pointerDown(pointer()), false);
  f.actor.dispose();
  job.reject(Error('late'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.errors.length, 0);
  const g = fixture();
  g.actor.registerPropertiesRequest(() => {
    throw Error('host');
  });
  await g.select();
  assert.equal(g.actor.keyDown(p()), true);
  assert.equal(g.errors.length, 1);
  assert.equal(g.actor.current(), null);
});

test('state change clears established object mode; no registration means P remains unconsumed', async () => {
  const f = fixture();
  await f.select();
  assert.equal(f.actor.keyDown(p()), false);
  const selected = f.state();
  f.setState({ ...selected, stateVersion: selected.stateVersion + 1 });
  assert.equal(f.actor.current(), null);
  f.actor.dispose();
  f.actor.dispose();
  assert.equal(f.actor.pointerDown(pointer()), false);
  assert.equal(f.actor.keyDown(p()), false);
  assert.equal(f.actor.current(), null);
});

test('re-click of the same certified selected object retains its receipt without another Core clear or frame replacement', async () => {
  const f = fixture();
  await f.select();
  const state = f.state(),
    frame = f.frame(),
    selected = f.actor.current();
  assert.equal(f.actor.pointerDown(pointer()), true);
  assert.equal(f.actor.current(), null);
  await f.actor.pointerUp(pointer());
  assert.strictEqual(f.actor.current(), selected);
  assert.strictEqual(f.state(), state);
  assert.strictEqual(f.frame(), frame);
  assert.equal(f.commits(), 1);
});

test('ambiguous Native chart anchors and owner errors never become selectable intent', () => {
  for (const mutate of [
    (s: any) => s.oles.push({ ...s.oles[0] }),
    (s: any) => (s.oles[0].anchorUnit = 1),
    (s: any) => (s.chartTargets[0].error_name = 'MissingOwner'),
    (s: any) => s.paragraphs.push({ ...s.paragraphs[0] }),
    (s: any) => (s.paragraphs[0].text = 'other'),
    (s: any) => (s.paragraphs[0].clipped = true),
  ]) {
    const f = fixture();
    mutate(f.source());
    assert.equal(f.actor.pointerDown(pointer()), false);
    assert.equal(f.commits(), 0);
  }
});

test('DOM transport never installs global P and never consumes untrusted Canvas input', async () => {
  const { bindObjectSelectionEvents } = await import('../src/object-selection.ts');
  class Bus extends EventTarget {
    readonly bound: string[] = [];
    override addEventListener(
      type: string,
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      this.bound.push(type);
      super.addEventListener(type, callback, options);
    }
  }
  const f = fixture(),
    canvas = new Bus(),
    doc = new Bus(),
    viewport = new Bus(),
    input = new Bus();
  Object.assign(doc, { defaultView: null, getSelection: () => null });
  const unbind = bindObjectSelectionEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    input: input as unknown as HTMLInputElement,
    viewport: viewport as unknown as HTMLElement,
    document: doc as unknown as Document,
    selection: f.actor,
    point: () => ({ x: 10, y: 20 }),
  });
  assert.equal(doc.bound.includes('keydown'), false);
  assert(canvas.bound.includes('keydown'));
  const event = new Event('pointerdown', { cancelable: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 20 });
  canvas.dispatchEvent(event);
  assert.equal(event.isTrusted, false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(f.commits(), 0);
  f.register();
  await f.select();
  const key = new Event('keydown', { cancelable: true });
  Object.assign(key, { key: 'p' });
  canvas.dispatchEvent(key);
  assert.equal(key.defaultPrevented, false);
  assert.equal(f.requests.length, 0);
  doc.dispatchEvent(new Event('beforeinput'));
  assert.equal(f.actor.current(), null);
  unbind();
  f.actor.dispose();
});

// Deterministic DOM transport fixture, not a claim of Chrome trusted input.
// Invoke the actual registered capture/bubble listeners in browser order.
class EventNode {
  style: any = {};
  listeners = new Map<string, { fn: (e: any) => void; capture: boolean }[]>();
  addEventListener(type: string, fn: any, capture: any = false) {
    capture = capture === true || capture?.capture === true;
    const rows = this.listeners.get(type) ?? [];
    rows.push({ fn, capture });
    this.listeners.set(type, rows);
  }
  removeEventListener(type: string, fn: any, capture: any = false) {
    capture = capture === true || capture?.capture === true;
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((r) => r.fn !== fn || r.capture !== capture),
    );
  }
  fire(type: string, event: any, capture: boolean) {
    for (const row of (this.listeners.get(type) ?? []).slice()) {
      if (event.stopped) break;
      if (row.capture === capture) row.fn(event);
    }
  }
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }
}
async function transportFixture() {
  const { bindObjectSelectionEvents } = await import('../src/object-selection.ts');
  const { bindObjectActivation } = await import('../src/object-activation.ts');
  const f = fixture(),
    canvas = new EventNode(),
    document = new EventNode(),
    viewport = Object.assign(new EventNode(), { scrollTop: 0, scrollLeft: 0 }),
    input = new EventNode();
  const calls: any[] = [];
  let frameCurrent = true,
    blocked = 0;
  Object.assign(document, { activeElement: input });
  const stop = bindObjectSelectionEvents({
    canvas: canvas as any,
    document: document as any,
    viewport: viewport as any,
    input: input as any,
    selection: f.actor,
    point: (event) => ({ x: event.clientX, y: event.clientY }),
  });
  const activation = bindObjectActivation({
    canvas: canvas as any,
    viewport: viewport as any,
    renderer: {
      viewScale: () => 1,
      isPaintedFrameCurrent: () => frameCurrent && !!f.capture(),
      objectAtLogicalPoint: () => chart(),
    },
    capture: () => f.capture()?.state,
    prepare: (e) =>
      f.actor.prepareDoubleClick({ trusted: e.isTrusted, x: e.clientX, y: e.clientY }),
    onError: (e) => {
      throw e;
    },
  });
  activation.register((event) => {
    calls.push(event);
  });
  pointerFrameGate.installCanvasPointerFrameGate({
    canvas,
    renderer: { isPaintedFrameCurrent: () => frameCurrent },
    onBlocked: () => blocked++,
  });
  function emit(type: string, extra: any = {}, origin = canvas) {
    const event: any = {
      type,
      isTrusted: true,
      isPrimary: true,
      pointerId: 1,
      button: 0,
      clientX: 10,
      clientY: 20,
      key: 'p',
      defaultPrevented: false,
      stopped: false,
      target: origin,
      composedPath: () => [origin, document],
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      ...extra,
    };
    document.fire(type, event, true);
    origin.fire(type, event, true);
    if (!event.stopped) origin.fire(type, event, false);
    return event;
  }
  return {
    f,
    canvas,
    document,
    input,
    viewport,
    calls,
    emit,
    setFrameCurrent(value: boolean) {
      frameCurrent = value;
    },
    blocked: () => blocked,
    dispose() {
      stop();
      activation.dispose();
      f.actor.dispose();
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test('actual binding order: first commit pending through second down/up/dblclick, one clear and one fresh activation', async () => {
  const t = await transportFixture(),
    job = deferred<object | null>();
  let request: any;
  t.f.onCommit(async (r) => {
    request = r;
    return job.promise;
  });
  assert.equal(t.emit('pointerdown').defaultPrevented, true);
  assert.equal(t.emit('pointerup').defaultPrevented, true);
  assert.equal(t.f.actor.current(), null);
  assert.equal(t.emit('keydown').defaultPrevented, true); // Quarantined intent, no properties request.
  t.f.setReady(false);
  t.setFrameCurrent(false);
  assert.equal(t.emit('pointerdown').defaultPrevented, true);
  assert.equal(t.emit('pointerup').defaultPrevented, true);
  assert.equal(t.emit('dblclick').defaultPrevented, true);
  assert.equal(
    t.blocked(),
    0,
    'owned pending gesture is admitted before the normal stale-frame capture gate',
  );
  assert.equal(t.calls.length, 0);
  assert.equal(t.f.commits(), 1);
  t.f.setReady(true);
  t.setFrameCurrent(true);
  job.resolve(t.f.confirmOwned(request));
  await flush();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].type, 'double-click');
  assert.deepEqual(t.calls[0].target, chart());
  assert.equal(t.f.commits(), 1);
  t.dispose();
});

test('pending native dblclick never survives outside/input/IME/modal/history/document/lease/frame invalidation', async () => {
  for (const cause of [
    'outside',
    'input',
    'composition',
    'modal',
    'history',
    'document',
    'lease',
    'frame',
    'detach',
  ]) {
    const t = await transportFixture(),
      job = deferred<object | null>();
    let request: any;
    t.f.onCommit(async (r) => {
      request = r;
      return job.promise;
    });
    t.emit('pointerdown');
    t.emit('pointerup');
    t.emit('pointerdown');
    t.emit('pointerup');
    t.emit('dblclick');
    if (cause === 'outside') t.emit('pointerdown', {}, t.input);
    else if (cause === 'input') t.emit('beforeinput', {}, t.input);
    else if (cause === 'composition') t.emit('compositionstart', {}, t.input);
    else if (cause === 'modal')
      t.emit('beforetoggle', {}, Object.assign(new EventNode(), { tagName: 'DIALOG' }));
    else if (cause === 'history') t.f.actor.clear('history');
    else if (cause === 'document') t.f.setSource({});
    else if (cause === 'lease') t.f.setLease({});
    else if (cause === 'frame') {
      t.f.setReady(false);
    } else t.dispose();
    // capture may be null in the host; failed confirmation is not retried.
    let receipt = null;
    if (cause !== 'frame') receipt = t.f.confirmOwned(request);
    job.resolve(receipt);
    await flush();
    assert.equal(t.calls.length, 0, cause);
    t.dispose();
  }
});

test('actual Canvas key listener dispatches properties once; bare/foreign/modifier/IME P stays unconsumed', async () => {
  const t = await transportFixture();
  t.f.register();
  assert.equal(t.emit('keydown').defaultPrevented, false);
  t.emit('pointerdown');
  t.emit('pointerup');
  await flush();
  assert.equal(t.emit('keydown', { ctrlKey: true }).defaultPrevented, false);
  assert.equal(t.emit('keydown', {}, t.input).defaultPrevented, false);
  assert.equal(t.emit('keydown').defaultPrevented, true);
  assert.equal(t.f.requests.length, 1);
  assert.equal(t.f.requests[0].type, 'properties-shortcut');
  assert.equal(t.emit('keydown').defaultPrevented, false);
  t.emit('pointerdown');
  t.emit('pointerup');
  await flush();
  assert.equal(t.emit('keydown', { isComposing: true, keyCode: 229 }).defaultPrevented, false);
  assert.equal(t.emit('keydown').defaultPrevented, false);
  t.dispose();
});

test('focused old hidden textarea cannot type immediate P during down or pending publish; foreign forms and bare P are untouched', async () => {
  const t = await transportFixture(),
    job = deferred<object | null>();
  let request: any,
    bodyKeys = 0;
  t.input.addEventListener('keydown', () => {
    bodyKeys++;
  });
  t.f.onCommit(async (r) => {
    request = r;
    return job.promise;
  });
  assert.equal((t.document as any).activeElement, t.input);
  assert.equal(t.emit('keydown', {}, t.input).defaultPrevented, false);
  assert.equal(bodyKeys, 1); // Ordinary body input without intent retains existing handling.
  t.emit('pointerdown');
  assert.equal(t.f.actor.current(), null);
  assert.equal(t.emit('keydown', {}, t.input).defaultPrevented, true);
  assert.equal(t.emit('keydown', { repeat: true }, t.input).defaultPrevented, true);
  assert.equal(bodyKeys, 1);
  t.emit('pointerup');
  assert.equal(t.emit('keydown', {}, t.input).defaultPrevented, true);
  assert.equal(bodyKeys, 1);
  assert.equal(t.f.requests.length, 0);
  const foreign = new EventNode();
  assert.equal(t.emit('keydown', {}, foreign).defaultPrevented, false);
  assert.equal(t.emit('keydown', { ctrlKey: true }, t.input).defaultPrevented, false);
  job.resolve(t.f.confirmOwned(request));
  await flush();
  assert.equal(t.f.commits(), 1);
  assert.equal(t.f.requests.length, 0);
  // No P is replayed when selection eventually becomes certified.
  t.dispose();
});

test('pending old-textarea beforeinput is cancelled before direct mutation and cancels the intent', async () => {
  const t = await transportFixture();
  let mutations = 0;
  t.input.addEventListener('beforeinput', () => {
    mutations++;
  });
  t.emit('pointerdown');
  assert.equal(
    t.emit('beforeinput', { inputType: 'insertText', data: 'p' }, t.input).defaultPrevented,
    true,
  );
  assert.equal(mutations, 0);
  assert.equal(t.f.actor.pendingInput(), false);
  assert.equal(t.emit('keydown', {}, t.input).defaultPrevented, false);
  t.emit('pointerup');
  await flush();
  assert.equal(t.f.commits(), 0);
  t.dispose();
});

test('pending second click into textbox interior or reentrant/throwing old-frame intent query cannot borrow first selection', async () => {
  for (const kind of ['interior', 'throw', 'reentrant']) {
    const f = fixture(drawing()),
      job = deferred<object | null>();
    let request: any;
    f.onCommit(async (r) => {
      request = r;
      return job.promise;
    });
    f.actor.pointerDown(pointer());
    const pending = f.actor.pointerUp(pointer());
    f.onPendingHit(() => {
      if (kind === 'throw') throw Error('intent');
      if (kind === 'reentrant') f.actor.clear('input');
      return kind === 'interior' ? null : drawing();
    });
    assert.equal(f.actor.pointerDown(pointer({ x: 12, clientX: 12 })), false);
    job.resolve(f.confirmOwned(request));
    await pending;
    assert.equal(f.actor.current(), null);
    assert.equal(f.commits(), 1);
    f.actor.dispose();
  }
});

test('document/token switch in the microtask between prepared receipt and activation dispatch cannot retarget the old dblclick', async () => {
  const t = await transportFixture();
  await t.f.select();
  let queued = false;
  t.f.onHit(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(() => {
        const state = t.f.state();
        t.f.setState({
          ...state,
          token: { ...state.token, documentId: 'replacement' },
          stateVersion: state.stateVersion + 1,
        });
      });
    }
    return chart();
  });
  t.emit('dblclick');
  await flush();
  assert.equal(queued, true);
  assert.equal(t.calls.length, 0);
  t.dispose();
});

test('P consumes the pinned public H5 common-query observation without HWPX source aliases; selection/currentness still required', async () => {
  const { readFileSync } = await import('node:fs');
  const content = JSON.parse(
    readFileSync(
      new URL('../../../tests/canvas/fixtures/textbox-h5-public-observation.json', import.meta.url),
      'utf8',
    ),
  );
  const row = content.drawings[0],
    target = { kind: 'drawing' as const, section: row.section, drawingNode: row.drawingNode };
  assert.equal(row.source.transform_identity, undefined);
  assert.equal(row.source.drawing_node, undefined);
  const f = fixture(target);
  f.setSource(content);
  f.register();
  assert.equal(f.actor.keyDown(p()), false);
  assert.deepEqual((await f.select())?.target, target);
  assert.equal(f.actor.keyDown(p()), true);
  assert.deepEqual(f.requests[0].target, target);
  await f.select();
  const state = f.state();
  f.setState({
    ...state,
    token: { ...state.token, generation: state.token.generation + 1 },
    stateVersion: state.stateVersion + 1,
  });
  assert.equal(f.actor.keyDown(p()), false);
  assert.equal(f.requests.length, 1);
  f.actor.dispose();
});

test('H5 common-query missing/unknown rotation, group, local transform and owner mismatch cannot be bypassed by HWPX-like flags', async () => {
  const { readFileSync } = await import('node:fs');
  const original = JSON.parse(
    readFileSync(
      new URL('../../../tests/canvas/fixtures/textbox-h5-public-observation.json', import.meta.url),
      'utf8',
    ),
  );
  for (const change of [
    (c: any) => delete c.hwp5Drawings[0].source.rotation_angle,
    (c: any) => (c.hwp5DrawingComponents[0].rotation_angle = 1),
    (c: any) => (c.hwp5DrawingLocalTransforms[0].matrix[0] = 2),
    (c: any) => (c.drawings[0].source.group_context = {}),
    (c: any) => c.drawings[0].controlNode++,
    (c: any) => (c.hwp5Drawings = []),
  ]) {
    const content = structuredClone(original),
      row = content.drawings[0];
    change(content);
    row.source.transform_identity = true;
    row.source.drawing_node = row.drawingNode;
    const f = fixture({ kind: 'drawing', section: row.section, drawingNode: row.drawingNode });
    f.setSource(content);
    assert.equal(f.actor.pointerDown(pointer()), false);
    assert.equal(f.commits(), 0);
    f.actor.dispose();
  }
});
