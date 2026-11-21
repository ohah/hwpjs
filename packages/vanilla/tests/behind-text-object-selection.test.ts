import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectSelection,
  bindObjectSelectionEvents,
  type ObjectSelectionScene,
  type ObjectSelectionPointer,
} from '../src/object-selection.ts';
import { objectActivationTarget } from '../../../web/preview/object-activation-target.mjs';
import fs from 'node:fs';
import { DomEventTarget } from './dom-event-target-fixture.mjs';
const captured = JSON.parse(
  fs.readFileSync(new URL('./fixtures/behind-covered-textbox.json', import.meta.url), 'utf8'),
);
const frame = { layout: captured.layout };
const position = { x: 374.1366666666667, y: 205.3466666666667 };
const pointer = (patch: Partial<ObjectSelectionPointer> = {}): ObjectSelectionPointer => ({
  trusted: true,
  onCanvas: true,
  primary: true,
  pointerId: 1,
  button: 0,
  ...position,
  clientX: 597.2772916666667,
  clientY: 412.3466666666667,
  ...patch,
});
const target = { kind: 'drawing', section: 0, drawingNode: 31 } as const;
type State = {
  token: {
    editorId: string;
    documentId: string;
    generation: number;
    operationRevision: number;
    viewRevision: number;
  };
  stateVersion: number;
  selection: unknown;
};
function fixture() {
  let state: State = {
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 0, viewRevision: 0 },
    stateVersion: 1,
    selection: { caret: true },
  };
  let source: any = structuredClone(captured.content);
  let painted = {},
    lease = {},
    modalRevision = 0,
    ready = true,
    focused = true,
    commits = 0,
    requests: any[] = [],
    flags: boolean[] = [];
  let stableRepaint = false;
  let hitOverride: ((scene: any, x: number, y: number) => any) | undefined;
  const capture = (): ObjectSelectionScene<State> | null =>
    ready ? { state, source, frame: painted, lease, modalRevision } : null;
  const normal = (scene: any, x: number, y: number) =>
    objectActivationTarget({ content: scene.source, layout: frame.layout }, x, y);
  const explicit = (scene: any, x: number, y: number) =>
    objectActivationTarget(
      { content: scene.source, layout: frame.layout, behindTextOnly: true },
      x,
      y,
    );
  const actor = createObjectSelection<State>({
    capture,
    hit: normal,
    behindTextHit: (scene, x, y) =>
      hitOverride ? hitOverride(scene, x, y) : explicit(scene, x, y),
    pendingBehindTextHit: explicit,
    acknowledgeArmedPaint: () => stableRepaint,
    hostFocused: () => focused,
    async commit(request) {
      commits++;
      flags.push(request.behindTextOnly);
      if (!request.current()) return null;
      state = { ...state, stateVersion: state.stateVersion + 1, selection: null };
      painted = {};
      actor.observeState(state);
      return request.confirm(capture()!);
    },
    onError(e) {
      throw e;
    },
  });
  actor.registerPropertiesRequest((event) => {
    requests.push(event);
  });
  return {
    actor,
    flags,
    requests,
    certifyRepaint() {
      stableRepaint = true;
    },
    commits: () => commits,
    state: () => state,
    source: () => source,
    mutate(kind: string) {
      if (kind === 'state') state = { ...state, stateVersion: state.stateVersion + 1 };
      if (kind === 'document') state = { ...state, token: { ...state.token, documentId: 'new' } };
      if (kind === 'frame') painted = {};
      if (kind === 'lease') lease = {};
      if (kind === 'modal') modalRevision++;
      if (kind === 'not-ready') ready = false;
      if (kind === 'blur') focused = false;
      if (kind === 'source') source = { ...source };
    },
    hit(fn: (scene: any, x: number, y: number) => any) {
      hitOverride = fn;
    },
    async select() {
      assert.equal(actor.armBehindTextSelection(), true);
      assert.equal(actor.pointerDown(pointer()), true);
      await actor.pointerUp(pointer());
      return actor.current();
    },
  };
}
test('captured fully-covered border keeps default body text priority and explicit intent selects then P once', async () => {
  const f = fixture();
  assert.equal(f.actor.pointerDown(pointer()), false);
  assert.equal(f.commits(), 0);
  assert.deepEqual((await f.select())?.target, target);
  assert.equal(f.commits(), 1);
  assert.deepEqual(f.flags, [true]);
  assert.equal(f.actor.keyDown({ trusted: true, onCanvas: true, key: 'p' }), true);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].target, target);
  assert.equal(f.actor.keyDown({ trusted: true, onCanvas: true, key: 'p' }), false);
});
test('one shot is consumed on miss and does not permanently reorder text clicks', async () => {
  const f = fixture();
  assert.equal(f.actor.armBehindTextSelection(), true);
  assert.equal(f.actor.pointerDown(pointer({ x: 10, y: 10 })), false);
  assert.equal(f.actor.pointerDown(pointer()), false);
  assert.deepEqual((await f.select())?.target, target);
  assert.equal(f.actor.pointerDown(pointer()), false);
  assert.equal(f.actor.current(), null);
});
for (const kind of ['state', 'document', 'frame', 'lease', 'modal', 'not-ready', 'source', 'blur'])
  test('armed capture refuses changed ' + kind, async () => {
    const f = fixture();
    assert.equal(f.actor.armBehindTextSelection(), true);
    f.mutate(kind);
    assert.equal(f.actor.pointerDown(pointer()), false);
    assert.equal(f.commits(), 0);
  });
for (const reason of [
  'key',
  'focus',
  'blur',
  'outside-pointer',
  'compositionstart',
  'modal',
  'scroll',
  'dispose',
])
  test('one-shot cancellation ' + reason, () => {
    const f = fixture();
    assert.equal(f.actor.armBehindTextSelection(), true);
    if (reason === 'key') f.actor.keyDown({ trusted: true, onCanvas: true, key: 'Escape' });
    else if (reason === 'dispose') f.actor.dispose();
    else f.actor.clear(reason);
    assert.equal(f.actor.pointerDown(pointer()), false);
    assert.equal(f.commits(), 0);
  });
test('document changes during pointer gesture refuse commit and late properties', async () => {
  const f = fixture();
  assert.equal(f.actor.armBehindTextSelection(), true);
  assert.equal(f.actor.pointerDown(pointer()), true);
  f.mutate('document');
  f.actor.observeState(f.state());
  await f.actor.pointerUp(pointer());
  assert.equal(f.commits(), 0);
  assert.equal(f.actor.current(), null);
  assert.equal(f.actor.requestProperties(), false);
});
test('untrusted modified or secondary pointers cannot admit behind selection', () => {
  for (const patch of [
    { trusted: false },
    { onCanvas: false },
    { primary: false },
    { button: 2 },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
  ]) {
    const f = fixture();
    assert.equal(f.actor.armBehindTextSelection(), true);
    assert.equal(f.actor.pointerDown(pointer(patch)), false);
    assert.equal(f.commits(), 0);
  }
});
test('owner membership, layer and format cannot be substituted by explicit hit callback', () => {
  for (const kind of ['missing-owner', 'not-behind', 'hwp5', 'group', 'chart']) {
    const f = fixture();
    assert.equal(f.actor.armBehindTextSelection(), true);
    if (kind === 'missing-owner') f.source().drawings = [];
    if (kind === 'not-behind') f.source().drawings[0].source.flow.text_wrap = 0;
    if (kind === 'hwp5') f.source().format = 'hwp5';
    if (kind === 'group') f.source().drawings[0].source.group_context = {};
    f.hit(() => (kind === 'chart' ? { kind: 'chart', section: 0, wrapper: 31 } : target));
    assert.equal(f.actor.pointerDown(pointer()), false);
    assert.equal(f.commits(), 0);
  }
});
test('reentrant hit cannot use an old document capture', () => {
  const f = fixture();
  assert.equal(f.actor.armBehindTextSelection(), true);
  f.hit(() => {
    f.mutate('document');
    return target;
  });
  assert.equal(f.actor.pointerDown(pointer()), false);
});

test('mode intent accepts only a certified same-scene completed repaint before the actual fresh pointer capture', async () => {
  const f = fixture();
  assert.equal(f.actor.armBehindTextSelection(), true);
  f.mutate('frame');
  f.certifyRepaint();
  assert.equal(f.actor.pointerDown(pointer()), true);
  await f.actor.pointerUp(pointer());
  assert.deepEqual(f.actor.current()?.target, target);
});
test('same-scene repaint certificate cannot bypass changed Native context or focus', () => {
  for (const kind of ['document', 'state', 'source', 'modal', 'lease', 'blur']) {
    const f = fixture();
    assert.equal(f.actor.armBehindTextSelection(), true);
    f.mutate('frame');
    f.certifyRepaint();
    f.mutate(kind);
    assert.equal(f.actor.pointerDown(pointer()), false);
    assert.equal(f.commits(), 0);
  }
});
test('a repaint after pointerdown keeps the original strict gesture receipt rejection', async () => {
  const f = fixture();
  assert.equal(f.actor.armBehindTextSelection(), true);
  assert.equal(f.actor.pointerDown(pointer()), true);
  f.certifyRepaint();
  f.mutate('frame');
  await f.actor.pointerUp(pointer());
  assert.equal(f.commits(), 0);
  assert.equal(f.actor.current(), null);
});
test('explicit behind text intent cannot tunnel through a different painted object or ambiguous border', () => {
  const content = structuredClone(captured.content),
    layout = structuredClone(captured.layout),
    query = (extra = {}) =>
      objectActivationTarget(
        { content, layout, behindTextOnly: true, ...extra },
        position.x,
        position.y,
      );
  assert.equal(query({ picture: { picture: { section: 0, pictureNode: 99 } } }), null);
  assert.equal(
    query({
      charts: [
        {
          x: position.x - 1,
          y: position.y - 1,
          width: 10,
          height: 10,
          target: { kind: 'chart', section: 0, wrapper: 99 },
        },
      ],
    }),
    null,
  );
  const front = structuredClone(content.drawings[0]);
  front.drawingNode = 32;
  front.source.drawing_node = 32;
  front.source.flow.text_wrap = 0;
  content.drawings.push(front);
  layout.placedDrawings.push({
    ...layout.placedDrawings[0],
    drawingNode: 32,
    behindTextbox: false,
  });
  assert.equal(query(), null);
});

test('actual DOM binding cancels armed mode on Escape, window blur, focus, composition, input, scroll and detach', () => {
  for (const reason of [
    'Escape',
    'blur',
    'focusin',
    'compositionstart',
    'input',
    'scroll',
    'detach',
  ]) {
    const f = fixture(),
      canvas = new DomEventTarget(),
      input = new DomEventTarget(),
      viewport = new DomEventTarget(),
      view = new DomEventTarget(),
      doc = Object.assign(new DomEventTarget(), { defaultView: view });
    const stop = bindObjectSelectionEvents({
      canvas: canvas as any,
      input: input as any,
      viewport: viewport as any,
      document: doc as any,
      selection: f.actor,
      point: () => position,
    });
    assert.equal(f.actor.armBehindTextSelection(), true);
    if (reason === 'Escape') {
      const e = new Event('keydown');
      Object.assign(e, { key: 'Escape', keyCode: 27 });
      canvas.dispatchEvent(e);
    } else if (reason === 'blur') view.dispatchEvent(new Event('blur'));
    else if (reason === 'scroll') viewport.dispatchEvent(new Event('scroll'));
    else if (reason === 'detach') stop();
    else doc.dispatchEvent(new Event(reason));
    assert.equal(f.actor.pointerDown(pointer()), false, reason);
    assert.equal(f.commits(), 0, reason);
    stop();
  }
});
