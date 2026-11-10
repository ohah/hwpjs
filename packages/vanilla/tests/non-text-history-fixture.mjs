// 실제 Canvas/Surface를 사용하며 renderer·Core 응답만 통제한다. Native·픽셀 증거가 아니다.
import {
  DEFAULT_CANVAS_DISPLAY_OPTIONS,
  canvasDisplayOptions,
} from '../../../web/preview/canvas-display-options.mjs';
export function fixture() {
  const frames = new Map();
  let sequence = 0,
    listener,
    active = true;
  const requests = [],
    waits = [],
    reports = [];
  let picture = null,
    pictureSelections = 0;
  const doc = {
    visibilityState: 'visible',
    activeElement: null,
    fonts: new EventTarget(),
    modal: false,
    querySelector: () => (doc.modal ? {} : null),
  };
  doc.defaultView = {
    AbortController,
    navigator: { platform: 'test' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (fn) => (frames.set(++sequence, fn), sequence),
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  class Element extends EventTarget {
    ownerDocument = doc;
    children = [];
    style = {};
    dataset = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 800;
    clientHeight = 600;
    append(...nodes) {
      for (const n of nodes) {
        this.children.push(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    }
    scrollIntoView() {}
    setAttribute() {}
    getRootNode() {
      return doc;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
    }
    focus() {
      if (this.disabled) return;
      doc.activeElement = this;
      this.dispatchEvent(new Event('focus'));
    }
    blur() {
      doc.activeElement = null;
    }
    setSelectionRange(a, b) {
      this.selectionStart = a;
      this.selectionEnd = b;
    }
    hasPointerCapture() {
      return false;
    }
    setPointerCapture() {}
    releasePointerCapture() {}
  }
  doc.createElement = () => new Element();
  const root = new Element();
  let state = {
    editorId: 'test',
    documentId: 'doc',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    capabilities: { historyAvailable: true, pictureResizeAvailable: true },
    nativeHistoryRevision: 1,
    nativeHistoryRevisions: [1, 0],
    selection: null,
    content: {
      format: 'hwpx',
      limited: false,
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
    },
  };
  Object.defineProperty(state, 'token', {
    get() {
      return {
        editorId: state.editorId,
        documentId: state.documentId,
        generation: state.generation,
        operationRevision: state.operationRevision,
        viewRevision: state.viewRevision,
      };
    },
    enumerable: true,
  });
  const install = (patch) => {
    const token = state.token;
    state = { ...state, ...patch, stateVersion: state.stateVersion + 1 };
    state.token = {
      ...token,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
    };
    listener?.(state);
    return state;
  };
  const queue = (kind, token) =>
    new Promise((resolve, reject) => {
      requests.push({ kind, token });
      waits.push({ kind, resolve, reject });
    });
  const editor = {
    getEditorState: () => state,
    registerStateListener: (fn) => ((listener = fn), () => (listener = undefined)),
    acquireInputSurface: () => ({
      isActive: () => active,
      release: () => (active = false),
      request: (m) => queue(m.kind, state.token),
      publishSelection: async (selection) => install({ selection }),
    }),
    readResource: async () => {
      throw Error('허용하지 않은 읽기');
    },
    undo: (token) => queue('public-undo', token),
    redo: (token) => queue('public-redo', token),
  };
  const layout = () => ({
    width: 800,
    height: 600,
    rows: [
      {
        ...state.content.paragraphs[0],
        startUnit: 0,
        endUnit: 2,
        width: 16,
        height: 20,
        x: 0,
        y: 0,
        boundaries: [
          { unit: 0, x: 0 },
          { unit: 1, x: 8 },
          { unit: 2, x: 16 },
        ],
      },
    ],
  });
  let displayOptions = DEFAULT_CANVAS_DISPLAY_OPTIONS;
  const renderer = {
    getDisplayOptions: () => displayOptions,
    setDisplayOptions(options) {
      const parsed = canvasDisplayOptions(options);
      const next = Object.freeze({ ...parsed, showTableGrid: parsed.showTableGrid === true });
      if (
        next.paragraphMarks === displayOptions.paragraphMarks &&
        (next.formattingMarks === true) === (displayOptions.formattingMarks === true) &&
        next.showTableGrid === displayOptions.showTableGrid
      )
        return true;
      displayOptions = next;
      return true;
    },
    layout,
    viewScale: () => 1,
    show() {},
    observeSourceState() {},
    setGeometryEvidence() {},
    suspendGeometryEvidence() {},
    clear() {},
    close() {},
    pictureReader() {},
    tableBackgroundReader() {},
    chartReader() {},
    select() {},
    preview() {},
    onGeometry() {},
    flushProjection() {},
    paragraph: () => state.content.paragraphs[0],
    selectedPicture: () => picture,
    selectPicture(value) {
      picture = value;
      pictureSelections++;
    },
    pictureAtLogicalPoint: () => ({ picture: { section: 0, pictureNode: 7 } }),
    isSelectionPainted: () => false,
  };
  globalThis.__nonTextFixture = { renderer };
  return {
    root,
    editor,
    renderer,
    reports,
    requests,
    waits,
    doc,
    pictureSelections: () => pictureSelections,
    install,
    state: () => state,
    revoke: () => (active = false),
    attach() {},
    input: () => root.children[0].children[0].children[0].children[2],
    canvas: () => root.children[0].children[0].children[0].children[0],
    ack(patch = {}, extra = {}) {
      const w = waits.shift();
      if (!w) throw Error('대기 요청 없음');
      const next = install(patch);
      w.resolve({
        status: 'committed-with-snapshot',
        state: next,
        reply: {
          historyRevision: next.nativeHistoryRevision,
          historyRevisions: next.nativeHistoryRevisions,
        },
        ...extra,
      });
    },
    reject() {
      waits.shift().reject(Error('통제된 실패'));
    },
    frame() {
      for (const [id, fn] of Array.from(frames)) {
        frames.delete(id);
        fn();
      }
    },
    select() {
      return install({
        selection: {
          ...state.token,
          coordinateSpace: 'display',
          format: 'hwpx',
          owner: 'section:0:body',
          section: 0,
          paragraph: 0,
          startUnit: 0,
          endUnit: 0,
        },
      });
    },
  };
}
export function createSurfaceRenderer() {
  return globalThis.__nonTextFixture.renderer;
}
