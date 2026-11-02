import { EditorState, createParagraphSelection } from '@hwpjs/core';

export function fixture(ready = true) {
  const observers = new Set<any>(),
    frames = new Map<number, () => void>();
  let frameHook: (() => void) | null = null;
  let id = 0,
    releases = 0,
    editorDisposals = 0;
  let measurements = 0;
  const ctx = new Proxy(
    {
      measureText: () => (
        measurements++,
        { width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }
      ),
    },
    { get: (o: any, k) => o[k] ?? (() => {}) },
  );
  const doc: any = {
    fonts: new EventTarget(),
    activeElement: null,
    defaultView: {
      AbortController,
      navigator: { platform: 'test' },
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (callback: () => void) => {
        frameHook?.();
        frames.set(++id, callback);
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
    selectionHook: null | (() => void) = null;
    scrollIntoView() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
    }
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
  const content = {
    format: 'hwpx',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectable: true,
        selectionOwner: 'section:0:body',
      },
    ],
    limited: false,
  };
  let state = new EditorState({
    editorId: 'test',
    documentId: 'docA',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    stateVersion: 0,
    status: ready ? 'ready' : 'empty',
    content: ready ? content : undefined,
    capabilities: { historyAvailable: true },
    nativeHistoryRevision: 0,
    nativeHistoryRevisions: [0],
  });
  const snapshot = () => ({
    ...state,
    content: state.content,
    capabilities: state.capabilities,
    nativeHistoryRevisions: state.nativeHistoryRevisions,
    selection: state.selection,
  });
  const requests: any[] = [],
    waiting: any[] = [];
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
        request: (message: any) =>
          new Promise((resolve) => {
            requests.push(message);
            waiting.push({ message, resolve });
          }),
        publishSelection: async (selection: any) => {
          state = new EditorState({
            ...snapshot(),
            selection,
            stateVersion: state.stateVersion + 1,
          });
          listener?.(state);
          return state;
        },
        release() {
          active = false;
          releases++;
          while (waiting.length) waiting.shift().resolve(undefined);
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
    requests,
    waiting,
    measurements: () => measurements,
    state: () => state,
    frame() {
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn();
    },
    frameHook(fn: (() => void) | null) {
      frameHook = fn;
    },
    revoke() {
      active = false;
    },
    replaceState() {
      state = new EditorState({ ...snapshot(), stateVersion: state.stateVersion + 1 });
      listener?.(state);
    },
    select(unit = 1) {
      const selection = createParagraphSelection(state, {
        section: 0,
        paragraph: 0,
        startUnit: unit,
        endUnit: unit,
      });
      state = new EditorState({ ...snapshot(), selection, stateVersion: state.stateVersion + 1 });
      listener?.(state);
    },
    ack(error = false) {
      const pending = waiting.shift();
      if (!pending) throw Error('NoPendingRequest');
      const m = pending.message,
        old = state.content!.paragraphs[0];
      if (m.kind !== 'splice') throw Error('OnlySpliceFixture');
      if (error) {
        pending.resolve({
          status: 'rejected',
          state,
          error: 'synthetic rejection',
          reply: { kind: 'splice', changed: false },
        });
        return;
      }
      const text = old.text.slice(0, m.startUnit) + m.text + old.text.slice(m.endUnit);
      const rev = state.nativeHistoryRevision! + 1;
      state = new EditorState({
        ...snapshot(),
        content: { ...state.content, paragraphs: [{ ...old, text }] },
        selection: undefined,
        operationRevision: state.operationRevision + 1,
        stateVersion: state.stateVersion + 1,
        nativeHistoryRevision: rev,
        nativeHistoryRevisions: [rev, ...state.nativeHistoryRevisions!],
      });
      listener?.(state);
      pending.resolve({
        status: 'committed-with-snapshot',
        state,
        reply: {
          kind: 'splice',
          changed: true,
          historyRevision: rev,
          historyRevisions: state.nativeHistoryRevisions,
        },
      });
    },
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
