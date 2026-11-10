import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { EditorState } from '@hwpjs/core';
function fixture(ready = false) {
  const observers = new Set<any>(),
    frames = new Set<number>();
  let id = 0,
    requests = 0,
    publications = 0,
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
          requests++;
          throw Error('UnexpectedRequest');
        },
        publishSelection: async () => {
          publications++;
          return state;
        },
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
    get requests() {
      return requests;
    },
    get publications() {
      return publications;
    },
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
test('actual Surface grid toggle is view-only and retires view identity', async () => {
  const f = fixture(true);
  const surface = createCanvasSurface({ root: f.root as any, editor: f.editor });
  const before = f.editor.getEditorState();
  try {
    assert.equal(surface.getDisplayOptions()?.showTableGrid, false);
    assert(surface.setDisplayOptions({ paragraphMarks: false, showTableGrid: true }));
    assert.equal(surface.getDisplayOptions()?.showTableGrid, true);
    const once = surface.getDisplayOptions();
    assert(surface.setDisplayOptions({ paragraphMarks: false, showTableGrid: true }));
    assert.equal(surface.getDisplayOptions(), once);
    assert(surface.setDisplayOptions({ paragraphMarks: false, showTableGrid: false }));
    assert.notEqual(surface.getDisplayOptions(), once);
    assert.equal(f.requests, 0);
    assert.equal(f.publications, 0);
    assert.equal(f.editor.getEditorState(), before);
    assert.equal(f.editor.getEditorState().selection, before.selection);
  } finally {
    await surface.dispose();
  }
  assert.equal(surface.setDisplayOptions({ paragraphMarks: false, showTableGrid: true }), false);
});
