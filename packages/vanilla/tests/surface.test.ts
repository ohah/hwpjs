import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { EditorState } from '../../core/src/state/editor-state.ts';

function fixture(ready = false) {
  const observers = new Set<any>(),
    frames = new Set<number>();
  let id = 0,
    releases = 0,
    editorDisposals = 0;
  const ctx = new Proxy(
    { measureText: () => ({ width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) },
    { get: (o: any, k) => o[k] ?? (() => {}) },
  );
  const doc: any = {
    activeElement: null,
    defaultView: {
      AbortController,
      navigator: { platform: 'test' },
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
      requestAnimationFrame: () => {
        frames.add(++id);
        return id;
      },
      cancelAnimationFrame: (n: number) => frames.delete(n),
      ResizeObserver: class {
        constructor() {
          observers.add(this);
        }
        observe() {}
        disconnect() {
          observers.delete(this);
        }
      },
    },
  };
  class Element extends EventTarget {
    ownerDocument = doc;
    children: any[] = [];
    parent: any = null;
    style: any = {};
    dataset: any = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 800;
    clientHeight = 600;
    append(...nodes: any[]) {
      for (const n of nodes) {
        this.children.push(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((n: any) => n !== this);
    }
    setAttribute() {}
    getContext() {
      return ctx;
    }
    getRootNode() {
      return doc;
    }
    focus() {
      doc.activeElement = this;
      this.dispatchEvent(new Event('focus'));
    }
    blur() {
      doc.activeElement = null;
    }
    setSelectionRange(a: number, b: number) {
      this.selectionStart = a;
      this.selectionEnd = b;
    }
    hasPointerCapture() {
      return false;
    }
  }
  doc.createElement = () => new Element();
  const root = new Element(),
    preserved = new Element();
  root.append(preserved);
  let listener: any,
    active = false;
  const state = new EditorState({
    editorId: 'test',
    documentId: null,
    generation: 0,
    operationRevision: 0,
    viewRevision: 0,
    stateVersion: 0,
    status: ready ? 'ready' : 'empty',
    content: ready ? { format: 'hwpx', paragraphs: [], limited: false } : undefined,
  });
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: (fn: any) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
    acquireInputSurface() {
      if (active) throw Error('SurfaceAlreadyAttached');
      active = true;
      return {
        id: 'l',
        generation: 1,
        isActive: () => active,
        request: async () => {
          throw Error('UnexpectedRequest');
        },
        publishSelection: async () => state,
        release() {
          active = false;
          releases++;
        },
      };
    },
    readResource: async () => {
      throw Error('UnexpectedResource');
    },
    dispose() {
      editorDisposals++;
    },
  };
  return {
    root,
    editor,
    observers,
    frames,
    preserved,
    get releases() {
      return releases;
    },
    get editorDisposals() {
      return editorDisposals;
    },
    get listener() {
      return listener;
    },
  };
}
test('multiple scoped mounts focus in their own realm and cleanup preserves editor and sibling nodes', async () => {
  const a = fixture(),
    b = fixture();
  const x = createCanvasSurface({ root: a.root as any, editor: a.editor }),
    y = createCanvasSurface({ root: b.root as any, editor: b.editor });
  assert.equal(a.root.children.length, 2);
  assert.equal(b.root.children.length, 2);
  x.focus();
  y.focus();
  assert.notEqual(a.root.ownerDocument.activeElement, b.root.ownerDocument.activeElement);
  await x.dispose();
  await x.dispose();
  assert.equal(a.root.children.length, 1);
  assert.equal(a.root.children[0], a.preserved);
  assert.equal(a.observers.size, 0);
  assert.equal(a.frames.size, 0);
  assert.equal(a.listener, null);
  assert.equal(a.releases, 1);
  assert.equal(a.editorDisposals, 0);
  assert.equal(b.releases, 0);
  await y.dispose();
  const remount = createCanvasSurface({ root: a.root as any, editor: a.editor });
  await remount.dispose();
  assert.equal(a.releases, 2);
});
test('failed second lease acquisition cleans up only its own subtree and observer', async () => {
  const a = fixture();
  const first = createCanvasSurface({ root: a.root as any, editor: a.editor });
  assert.throws(
    () => createCanvasSurface({ root: a.root as any, editor: a.editor }),
    /SurfaceAlreadyAttached/,
  );
  assert.equal(a.observers.size, 2);
  assert.equal(a.root.children.length, 2);
  await first.dispose();
  assert.equal(a.observers.size, 0);
});

test('ready snapshot mounts using canonical renderer and capability initialization', async () => {
  const a = fixture(true);
  const surface = createCanvasSurface({ root: a.root as any, editor: a.editor });
  assert.equal(surface.canRequestHistory('undo'), false);
  assert.equal(surface.canRequestHistory('redo'), false);
  assert.equal(surface.requestHistory('undo'), false);
  assert.equal(surface.requestHistory('redo'), false);
  assert.equal(surface.getSelection(), null);
  assert.equal(surface.setScale(1), true);
  assert.equal(await surface.flushComposition(), 'unchanged');
  await surface.dispose();
  assert.equal(a.frames.size, 0);
  assert.equal(surface.canRequestHistory('undo'), false);
  assert.equal(surface.requestHistory('undo'), false);
});
