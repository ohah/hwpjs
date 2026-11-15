import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectSelection,
  bindObjectSelectionEvents,
} from '../../packages/vanilla/src/object-selection.ts';
import { EditorState } from '../../packages/core/src/state/editor-state.ts';

// Source integration: actual actor/binder/EditorState, controlled publication and DOM event path.
// The window capture route models the real frozen139 TRACE3 (SUMMARY blur, phase1).
// Native/browser input is proved separately by that trace and the later rebuilt GUI.
class Host {
  listeners = new Map();
  addEventListener(type, callback, capture) {
    const rows = this.listeners.get(type) ?? [];
    rows.push({ callback, capture });
    this.listeners.set(type, rows);
  }
  removeEventListener(type, callback) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((r) => r.callback !== callback),
    );
  }
  emit(type, target = this, path = [target], phase = 1) {
    const event = {
      type,
      target,
      currentTarget: this,
      eventPhase: phase,
      composedPath: () => path,
    };
    for (const row of this.listeners.get(type) ?? []) {
      assert.equal(row.capture, true);
      row.callback(event);
    }
  }
}
const token = {
  editorId: 'e',
  documentId: 'picture-document',
  generation: 1,
  operationRevision: 0,
  viewRevision: 0,
};
const picture = Object.freeze({ kind: 'picture', section: 0, pictureNode: 31 });
function setup(t, effect = () => {}) {
  const win = new Host(),
    doc = new Host(),
    canvas = new Host(),
    input = new Host(),
    viewport = new Host(),
    oldFocus = new Host();
  doc.defaultView = win;
  let state = new EditorState({
      ...token,
      stateVersion: 2,
      status: 'ready',
      selection: null,
      content: { pictures: [{ section: 0, pictureNode: 31, state: 'located' }] },
    }),
    frame = {},
    lease = {},
    focused = false,
    commits = 0,
    dispatches = 0;
  const versions = [],
    source = state.content;
  const capture = () => ({ state, frame, lease, source: state.content, modalRevision: 0 });
  const publish = () => {
    state = new EditorState({
      ...token,
      stateVersion: state.stateVersion + 1,
      status: 'ready',
      selection: null,
      content: state.content,
    });
    versions.push(state.stateVersion);
    actor.observeState(state);
  };
  const context = {
    win,
    doc,
    canvas,
    input,
    viewport,
    oldFocus,
    publish,
    blur: (target, path = [target, doc, win]) =>
      win.emit('blur', target, path, target === win ? 2 : 1),
    foreignFocus: () => {
      focused = false;
      doc.emit('focusin', oldFocus, [oldFocus, doc, win]);
    },
    replaceDocument: () => {
      state = new EditorState({
        ...token,
        documentId: 'foreign-document',
        stateVersion: state.stateVersion + 1,
        status: 'ready',
        selection: null,
        content: source,
      });
      actor.observeState(state);
    },
    replaceLease: () => {
      lease = {};
    },
    replaceSource: () => {
      state = new EditorState({
        ...token,
        stateVersion: state.stateVersion,
        status: 'ready',
        selection: null,
        content: { pictures: [{ section: 0, pictureNode: 31, state: 'located' }] },
      });
      actor.observeState(state);
    },
    repaint: () => {
      frame = {};
    },
  };
  const actor = createObjectSelection({
    capture,
    hit: () => picture,
    hostFocused: () => focused,
    onClear() {},
    onError(e) {
      throw e;
    },
    async commit(request) {
      commits++;
      assert.equal(request.current(), true);
      context.blur(oldFocus);
      focused = true;
      effect(context);
      publish();
      frame = {};
      return request.confirm(capture());
    },
  });
  const unbind = bindObjectSelectionEvents({
    canvas,
    input,
    viewport,
    document: doc,
    selection: actor,
    point: () => ({ x: 5, y: 5 }),
  });
  const unregister = actor.registerPropertiesRequest(() => {
    dispatches++;
  });
  const pointer = {
    trusted: true,
    onCanvas: true,
    primary: true,
    pointerId: 1,
    button: 0,
    x: 5,
    y: 5,
    clientX: 5,
    clientY: 5,
  };
  const key = { trusted: true, onCanvas: true, key: 'p', keyCode: 80 };
  t.after(() => {
    unbind();
    unregister();
    actor.dispose();
  });
  return {
    ...context,
    actor,
    versions,
    select: async () => {
      assert.equal(actor.pointerDown(pointer), true);
      await actor.pointerUp(pointer);
    },
    press: () => actor.keyDown(key),
    current: () => actor.current(),
    commits: () => commits,
    dispatches: () => dispatches,
    state: () => state,
    pointer,
  };
}
test('first picture click survives descendant blur and exactly one own Core publication, then P dispatches', async (t) => {
  const h = setup(t);
  await h.select();
  assert.deepEqual(h.versions, [3]);
  assert.deepEqual(h.current()?.target, picture);
  assert.equal(h.press(), true);
  assert.equal(h.commits(), 1);
  assert.equal(h.dispatches(), 1);
});
test('old textarea blur during first picture handoff is not actual window departure', async (t) => {
  const h = setup(t, (c) => c.blur(c.input));
  await h.select();
  assert.deepEqual(h.current()?.target, picture);
  assert.equal(h.press(), true);
});
test('shadow input blur retargeted to shadow host does not cancel own canvas focus handoff', async (t) => {
  const h = setup(t, (c) => {
    const inner = new Host(),
      shadowHost = new Host();
    c.blur(shadowHost, [inner, {}, shadowHost, c.doc, c.win]);
  });
  await h.select();
  assert.equal(h.press(), true);
});
test('actual owning window blur during commit still cancels first picture selection', async (t) => {
  const h = setup(t, (c) => c.blur(c.win, [c.win]));
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('actual owning window blur retires an already confirmed picture', async (t) => {
  const h = setup(t);
  await h.select();
  assert.ok(h.current());
  h.blur(h.win, [h.win]);
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('foreign form focus after confirmation still retires picture despite ignored descendant blur', async (t) => {
  const h = setup(t);
  await h.select();
  h.blur(h.canvas);
  h.foreignFocus();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('extra initialization publication is still rejected, never a +2 exception', async (t) => {
  const h = setup(t, (c) => c.publish());
  await h.select();
  assert.deepEqual(h.versions, [3, 4]);
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('different document during commit cannot inherit initial picture intent', async (t) => {
  const h = setup(t, (c) => c.replaceDocument());
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('replaced lease during commit cannot certify first picture', async (t) => {
  const h = setup(t, (c) => c.replaceLease());
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('replaced source during commit cannot certify same numeric picture address', async (t) => {
  const h = setup(t, (c) => c.replaceSource());
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('reentrant real window blur followed by descendant focus cannot resurrect cleared intent', async (t) => {
  const h = setup(t, (c) => {
    c.blur(c.win, [c.win]);
    c.blur(c.input);
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('raw frame replacement between pointer down/up remains rejected before any commit', async (t) => {
  const h = setup(t);
  assert.equal(h.actor.pointerDown(h.pointer), true);
  h.repaint();
  await h.actor.pointerUp(h.pointer);
  assert.equal(h.commits(), 0);
  assert.equal(h.press(), false);
});
test('actual window departure between pointer down and up retires unresolved intent', async (t) => {
  const h = setup(t);
  assert.equal(h.actor.pointerDown(h.pointer), true);
  h.blur(h.win, [h.win]);
  await h.actor.pointerUp(h.pointer);
  assert.equal(h.commits(), 0);
  assert.equal(h.press(), false);
});
test('shadow or iframe foreign focus after selection still clears the owner', async (t) => {
  const h = setup(t);
  await h.select();
  assert.ok(h.current());
  const host = new Host(),
    inner = new Host();
  h.doc.emit('focusin', host, [inner, {}, host, h.doc, h.win]);
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
