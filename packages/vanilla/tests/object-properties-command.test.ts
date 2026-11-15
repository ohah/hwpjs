import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectSelection,
  type ObjectSelectionScene,
  type ObjectSelectionPointer,
  type ObjectPropertiesKey,
} from '../src/object-selection.ts';
import type { CanvasObjectTarget } from '../src/object-activation.ts';
import type { StateToken } from '@hwpjs/core';
import { createObjectPropertiesControls } from '../src/object-properties-controls.ts';
import { bindObjectSelectionEvents } from '../src/object-selection.ts';

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
  let changes = 0;
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
    onChange: () => {
      changes++;
    },
  });
  return {
    actor,
    changes: () => changes,
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

for (const target of [chart(), picture(), drawing()]) {
  test(`explicit ${target.kind} command consumes only the same certified selection as P`, async () => {
    const f = fixture(target);
    f.register();
    assert.equal(f.actor.requestProperties(), false);
    await f.select();
    assert.equal(f.changes(), 1);
    const selected = f.actor.current();
    assert.equal(f.actor.requestProperties(), true);
    assert.deepEqual(f.requests, [{ type: 'properties-command', ...selected }]);
    assert.equal(f.actor.current(), null);
    assert.equal(f.changes(), 2);
    assert.equal(f.actor.requestProperties(), false);
    assert.equal(f.actor.keyDown(p()), false);
  });
}
test('command keeps frame/source/lease/modal/state/token and host focus rejection', async () => {
  const mutations = [
    (f: any) => f.setFrame({}),
    (f: any) => f.setSource({ ...f.source() }),
    (f: any) => f.setLease({}),
    (f: any) => f.setModal(1),
    (f: any) => f.setFocused(false),
    (f: any) => f.setReady(false),
    (f: any) => f.setState({ ...f.state(), stateVersion: f.state().stateVersion + 1 }),
    (f: any) => f.setState({ ...f.state(), token: { ...f.state().token, documentId: 'other' } }),
  ];
  for (const mutate of mutations) {
    const f = fixture();
    f.register();
    await f.select();
    mutate(f);
    assert.equal(f.actor.requestProperties(), false);
    assert.equal(f.requests.length, 0);
  }
});
test('pending object intent cannot become command authority and remains P quarantined', () => {
  const f = fixture();
  f.register();
  assert.equal(f.actor.pointerDown(pointer()), true);
  assert.equal(f.actor.requestProperties(), false);
  assert.equal(f.actor.quarantinePendingKey(p()), true);
  assert.equal(f.actor.current(), null);
  assert.equal(f.requests.length, 0);
});
test('explicit command rejects clear/dispose and reentrant command dispatch', async () => {
  const f = fixture();
  let calls = 0;
  f.actor.registerPropertiesRequest(() => {
    calls++;
    assert.equal(f.actor.requestProperties(), false);
  });
  await f.select();
  assert.equal(f.actor.requestProperties(), true);
  assert.equal(calls, 1);
  await f.select();
  f.actor.clear('foreign-focus');
  assert.equal(f.actor.requestProperties(), false);
  await f.select();
  f.actor.dispose();
  assert.equal(f.actor.requestProperties(), false);
});
function controlFixture() {
  const document = {} as Document;
  const control = {
    ownerDocument: document,
    tagName: 'BUTTON',
    isConnected: true,
    disabled: false,
    hasAttribute(name: string) {
      return name === 'disabled' && this.disabled;
    },
  };
  let current = true;
  const controls = createObjectPropertiesControls(document, () => current);
  const event = (delta: any = {}) => ({
    isTrusted: true,
    isPrimary: true,
    button: 0,
    defaultPrevented: false,
    composedPath: () => [control],
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...delta,
  });
  return {
    document,
    control,
    controls,
    event,
    setCurrent(value: boolean) {
      current = value;
    },
  };
}
test('registered property button and menu summary retain focus only for a trusted primary current gesture', () => {
  for (const tagName of ['BUTTON', 'SUMMARY']) {
    const f = controlFixture();
    f.control.tagName = tagName;
    const stop = f.controls.register(f.control as unknown as HTMLElement);
    const e = f.event();
    assert.equal(f.controls.retain(e as any), true);
    assert.equal(e.defaultPrevented, true);
    stop();
    assert.equal(f.controls.retain(f.event() as any), false);
  }
});
test('control registry rejects foreign/unregistered/disabled/detached/modified/untrusted controls and stale selection', () => {
  const deltas = [
    { isTrusted: false },
    { isPrimary: false },
    { button: 1 },
    { defaultPrevented: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { composedPath: () => [{}] },
  ];
  for (const delta of deltas) {
    const f = controlFixture();
    f.controls.register(f.control as any);
    assert.equal(f.controls.retain(f.event(delta) as any), false);
  }
  for (const change of [
    (f: any) => (f.control.disabled = true),
    (f: any) => (f.control.isConnected = false),
    (f: any) => (f.control.ownerDocument = {}),
    (f: any) => f.setCurrent(false),
  ]) {
    const f = controlFixture();
    f.controls.register(f.control as any);
    change(f);
    const e = f.event();
    assert.equal(f.controls.retain(e as any), false);
    assert.equal(e.defaultPrevented, false);
  }
  const nested = controlFixture();
  nested.controls.register(nested.control as any);
  assert.equal(
    nested.controls.retain(
      nested.event({ composedPath: () => [{ tagName: 'INPUT' }, nested.control] }) as any,
    ),
    false,
  );
  for (const tagName of ['INPUT', 'DIV', 'FORM']) {
    const f = controlFixture();
    f.control.tagName = tagName;
    f.controls.register(f.control as any);
    assert.equal(f.controls.retain(f.event() as any), false);
  }
  const f = controlFixture();
  f.controls.register(f.control as any);
  f.controls.dispose();
  assert.equal(f.controls.retain(f.event() as any), false);
});
class EventNode {
  listeners = new Map<string, Set<(e: any) => void>>();
  defaultView = null;
  getSelection() {
    return null;
  }
  addEventListener(type: string, fn: any) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: any) {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string, e: any) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}
test('actual capture transport preserves only registered controls; descendant focus, other actions and modal changes still clear', async () => {
  const f = fixture();
  f.register();
  await f.select();
  const doc = new EventNode(),
    canvas = new EventNode(),
    input = new EventNode(),
    viewport = new EventNode();
  const c = controlFixture();
  const controls = createObjectPropertiesControls(doc as any, () => f.actor.current() != null);
  c.control.ownerDocument = doc as any;
  controls.register(c.control as any);
  const stop = bindObjectSelectionEvents({
    document: doc as any,
    canvas: canvas as any,
    input: input as any,
    viewport: viewport as any,
    selection: f.actor,
    point: () => ({ x: 10, y: 20 }),
    retainPropertiesControl: controls.retain,
  });
  const e = c.event();
  doc.fire('pointerdown', e);
  assert.equal(e.defaultPrevented, true);
  assert.notEqual(f.actor.current(), null);
  doc.fire('focusin', { composedPath: () => [input] });
  assert.equal(f.actor.current(), null);
  assert.equal(f.actor.requestProperties(), false);
  await f.select();
  doc.fire('pointerdown', c.event({ composedPath: () => [{}] }));
  assert.equal(f.actor.current(), null);
  await f.select();
  f.setModal(1);
  const modal = c.event();
  doc.fire('pointerdown', modal);
  assert.equal(modal.defaultPrevented, false);
  assert.equal(f.actor.current(), null);
  stop();
  controls.dispose();
});

test('registered control itself cannot retain object selection while contenteditable', () => {
  for (const tagName of ['BUTTON', 'SUMMARY']) {
    const f = controlFixture();
    f.control.tagName = tagName;
    Object.assign(f.control, { isContentEditable: true });
    f.controls.register(f.control as unknown as HTMLElement);
    const event = f.event();
    assert.equal(f.controls.retain(event as unknown as PointerEvent), false);
    assert.equal(event.defaultPrevented, false);
  }
});
test('foreign form, editable ancestor and shadow-host ancestry cancel retention even around a registered property control', () => {
  for (const tagName of ['BUTTON', 'SUMMARY']) {
    for (const ancestor of [
      { tagName: 'FORM' },
      { tagName: 'DIV', isContentEditable: true },
      { tagName: 'SECTION', isContentEditable: true },
    ]) {
      const f = controlFixture();
      f.control.tagName = tagName;
      f.controls.register(f.control as unknown as HTMLElement);
      const event = f.event({
        composedPath: () => [{ tagName: 'SPAN' }, f.control, ancestor, f.document],
      });
      assert.equal(f.controls.retain(event as unknown as PointerEvent), false);
      assert.equal(event.defaultPrevented, false);
    }
  }
});
