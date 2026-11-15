import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectSelection,
  bindObjectSelectionEvents,
} from '../../packages/vanilla/src/object-selection.ts';
import { EditorState } from '../../packages/core/src/state/editor-state.ts';

// Actual actor/binder/EditorState with a controlled DOM capture route.
// Models frozen140 P09: own +1 publication then TEXTAREA scroll captured by viewport.
// Source integration only; exact fresh26 browser trace and rebuilt GUI are separate evidence.
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
  documentId: 'chart-document',
  generation: 1,
  operationRevision: 0,
  viewRevision: 0,
};
const target = Object.freeze({ kind: 'chart', section: 0, wrapper: 17 });
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
      content: {
        paragraphs: [{ section: 0, paragraph: 2, text: '\ufffc' }],
        chartTargets: [{ section: 0, wrapper: 17, paragraph: 2, anchorUnit: 0 }],
        oles: [
          {
            section: 0,
            chartWrapper: 17,
            paragraph: 2,
            anchorUnit: 0,
            state: 'located',
            representation: 'chart-alternative',
          },
        ],
      },
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
    scroll: (target, path = [target, viewport, doc, win]) =>
      viewport.emit('scroll', target, path, target === viewport ? 2 : 1),
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
        content: {
          paragraphs: [{ section: 0, paragraph: 2, text: '\ufffc' }],
          chartTargets: [{ section: 0, wrapper: 17, paragraph: 2, anchorUnit: 0 }],
          oles: [
            {
              section: 0,
              chartWrapper: 17,
              paragraph: 2,
              anchorUnit: 0,
              state: 'located',
              representation: 'chart-alternative',
            },
          ],
        },
      });
      actor.observeState(state);
    },
    repaint: () => {
      frame = {};
    },
  };
  const actor = createObjectSelection({
    capture,
    hit: () => target,
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
      publish();
      effect(context);
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
test('first chart click survives hidden textarea scroll after exactly one own Core publication', async (t) => {
  const h = setup(t, (c) => c.scroll(c.input));
  await h.select();
  assert.deepEqual(h.versions, [3]);
  assert.deepEqual(h.current()?.target, target);
  assert.equal(h.press(), true);
  assert.equal(h.dispatches(), 1);
});
test('textarea scroll cannot retire a confirmed chart selection', async (t) => {
  const h = setup(t);
  await h.select();
  assert.ok(h.current());
  h.scroll(h.input);
  assert.ok(h.current());
  assert.equal(h.press(), true);
});
test('actual viewport scroll during own publication cancels the pending chart', async (t) => {
  const h = setup(t, (c) => c.scroll(c.viewport, [c.viewport, c.doc, c.win]));
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('actual viewport scroll after confirmation retires chart selection', async (t) => {
  const h = setup(t);
  await h.select();
  assert.ok(h.current());
  h.scroll(h.viewport, [h.viewport, h.doc, h.win]);
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('actual viewport scroll between down and up rejects intent before commit', async (t) => {
  const h = setup(t);
  assert.equal(h.actor.pointerDown(h.pointer), true);
  h.scroll(h.viewport, [h.viewport, h.doc, h.win]);
  await h.actor.pointerUp(h.pointer);
  assert.equal(h.commits(), 0);
  assert.equal(h.press(), false);
});
test('real owning window departure still cancels a scroll-compatible commit', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.input);
    c.blur(c.win, [c.win]);
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('foreign form focus still cancels a scroll-compatible commit', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.input);
    c.foreignFocus();
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('a new document cannot reuse a descendant scroll-compatible numeric chart target', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.input);
    c.replaceDocument();
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('an extra state publication stays rejected rather than admitting +2', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.input);
    c.publish();
  });
  await h.select();
  assert.deepEqual(h.versions, [3, 4]);
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('a replaced lease cannot inherit an otherwise compatible chart', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.input);
    c.replaceLease();
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('reentrant actual viewport scroll followed by textarea scroll cannot resurrect intent', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.viewport, [c.viewport, c.doc, c.win]);
    c.scroll(c.input);
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('raw frame replacement during pointer intent remains strict', async (t) => {
  const h = setup(t);
  assert.equal(h.actor.pointerDown(h.pointer), true);
  h.repaint();
  h.scroll(h.input);
  await h.actor.pointerUp(h.pointer);
  assert.equal(h.commits(), 0);
  assert.equal(h.press(), false);
});
test('different source with the same chart numbers cannot be certified', async (t) => {
  const h = setup(t, (c) => {
    c.scroll(c.input);
    c.replaceSource();
  });
  await h.select();
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
test('real window blur still retires confirmed chart after ignored textarea scroll', async (t) => {
  const h = setup(t);
  await h.select();
  assert.ok(h.current());
  h.scroll(h.input);
  h.blur(h.win, [h.win]);
  assert.equal(h.current(), null);
  assert.equal(h.press(), false);
});
