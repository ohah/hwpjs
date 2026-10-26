// 실제 core/surface/renderer/Canvas/WASM을 사용한다. DOM만 최소 이벤트 하니스이며 브라우저 증거와 구분한다.
// HWPJS_TEST_WASM으로 명시한 엔진과 저장소 공개 strikethrough.hwpx fixture가 필요하다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEditor, SPLICE_TEXT_COMMAND, type SelectionTarget } from '../../core/src/index.ts';
import { createReaderEditorRuntime } from '../../core/src/runtime/reader-runtime.ts';
import { createCanvasSurface } from '../src/surface.ts';
assert(process.env.HWPJS_TEST_WASM, '명시 WASM 필요');
const wasmModule = await WebAssembly.compile(
  new Uint8Array(readFileSync(process.env.HWPJS_TEST_WASM!)),
);
const tick = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};
function dom() {
  const ctx = new Proxy(
    {
      measureText: (s: string) => ({
        width: s.length * 8,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
    },
    { get: (o: any, k) => o[k] ?? (() => {}) },
  );
  const realm: any = {
    AbortController,
    navigator: { platform: 'MacIntel' },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    devicePixelRatio: 1,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const doc: any = { activeElement: null, defaultView: realm };
  class El extends EventTarget {
    ownerDocument = doc;
    children: El[] = [];
    parent: any;
    style: any = {};
    dataset: any = {};
    attrs: any = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 800;
    clientHeight = 600;
    offsetWidth = 800;
    disabled = false;
    readOnly = false;
    constructor(public tagName: string) {
      super();
    }
    append(...xs: El[]) {
      for (const n of xs) {
        this.children.push(n);
        n.parent = this;
      }
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((n: any) => n !== this);
    }
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    }
    getAttribute(k: string) {
      return this.attrs[k];
    }
    getContext() {
      return ctx;
    }
    getRootNode() {
      return doc;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
    }
    focus() {
      doc.activeElement = this;
      this.dispatchEvent(new Event('focus'));
    }
    blur() {
      doc.activeElement = null;
    }
    setSelectionRange(a: number, b: number, d = 'forward') {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = d;
    }
    hasPointerCapture() {
      return false;
    }
    scrollIntoView() {}
  }
  doc.createElement = (name: string) => new El(name.toUpperCase());
  const root = new El('MAIN');
  const all = (n: El): El[] => [n, ...n.children.flatMap(all)];
  return { root, doc, all, find: (tag: string) => all(root).find((n) => n.tagName === tag)! };
}
async function fixture(oldMetadata = false) {
  const d = dom(),
    publications: any[] = [],
    timeline: any[] = [];
  const editor = createEditor({
    runtimeFactory: () => {
      const rt = createReaderEditorRuntime({ wasmModule });
      return {
        async request(m: any, c: any) {
          const r = await rt.request(m, c);
          if (oldMetadata) {
            delete r.historyRevision;
            delete r.historyRevisions;
          }
          return r;
        },
        dispose: () => rt.dispose(),
      };
    },
  });
  await editor.load(
    new Uint8Array(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwpx')),
    { format: 'hwpx' },
  );
  const originalAcquire = editor.acquireInputSurface.bind(editor);
  const wrapped = {
    ...editor,
    acquireInputSurface(hooks: any) {
      const lease = originalAcquire(hooks);
      return {
        ...lease,
        publishSelection(value: any) {
          publications.push(value);
          return lease.publishSelection(value);
        },
      };
    },
  };
  const surface = createCanvasSurface({ root: d.root as any, editor: wrapped });
  const unsubscribe = editor.registerStateListener((s) =>
    timeline.push({
      version: s.stateVersion,
      op: s.operationRevision,
      rev: s.nativeHistoryRevision,
      selection: s.selection === undefined ? 'undefined' : s.selection,
    }),
  );
  const input = d.find('TEXTAREA'),
    canvas = d.find('CANVAS');
  const selection = (a: number, b = a) => ({
    ...editor.getEditorState().token,
    coordinateSpace: 'display' as const,
    format: 'hwpx' as const,
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: a,
    endUnit: b,
    affinity: 'forward' as const,
  });
  const fire = (kind: string, data: any = {}) => {
    const event = new Event(kind, { cancelable: true });
    Object.assign(event, data);
    input.dispatchEvent(event);
    return event;
  };
  async function replace() {
    const s = selection(0, 13);
    await editor.setSelection(s);
    const r = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: s,
      text: '공개후보검증',
    });
    assert.equal(r.status, 'committed-with-snapshot');
    await editor.setSelection(selection(6));
    await tick();
    return r;
  }
  return {
    ...d,
    editor,
    surface,
    input,
    canvas,
    selection,
    replace,
    fire,
    publications,
    timeline,
    async done() {
      unsubscribe();
      await surface.dispose();
      await editor.dispose();
    },
  };
}
test('외부 교체 fresh caret 투영은 core echo를 추가하지 않는다', async () => {
  const f = await fixture();
  try {
    await f.replace();
    const v = f.editor.getEditorState().stateVersion,
      n = f.publications.length;
    await tick();
    assert.equal(f.input.value, '공개후보검증');
    assert.equal(f.canvas.dataset.caret, '0:0:6');
    assert.equal(f.editor.getEditorState().stateVersion, v);
    assert.equal(f.publications.length, n);
    assert(!f.publications.some((x) => x === null));
  } finally {
    await f.done();
  }
});
test('외부 교체→입력→Undo는 Native본문과 fresh caret를 함께 복원한다', async () => {
  const f = await fixture();
  try {
    await f.replace();
    assert(f.surface.focus());
    const e = f.fire('beforeinput', { inputType: 'insertText', data: 'x' });
    assert(!e.defaultPrevented);
    f.input.value += 'x';
    f.input.setSelectionRange(7, 7);
    f.fire('input', { inputType: 'insertText', data: 'x' });
    await tick();
    assert.equal(f.editor.getEditorState().nativeHistoryRevision, 2);
    assert.equal(f.input.value, '공개후보검증x');
    assert(f.surface.requestHistory('undo'));
    await tick();
    assert.equal(f.editor.getEditorState().nativeHistoryRevision, 1);
    assert.equal((f.editor.getEditorState().content as any).paragraphs[0].text, '공개후보검증');
    assert.equal(f.input.value, '공개후보검증');
    assert.equal(f.canvas.dataset.caret, '0:0:6');
    assert.equal(f.input.disabled, false);
    assert.equal(f.doc.activeElement, f.input);
  } finally {
    await f.done();
  }
});
test('명시 public selection clear 한 번은 null을 보존하고 core echo를 추가하지 않는다', async () => {
  const f = await fixture();
  try {
    await f.replace();
    const n = f.publications.length,
      v = f.editor.getEditorState().stateVersion;
    await f.editor.setSelection(null);
    await tick();
    assert.equal(f.editor.getEditorState().selection, null);
    assert.equal(f.editor.getEditorState().stateVersion, v + 1);
    assert.equal(f.publications.length, n);
    assert.equal(f.input.disabled, true);
  } finally {
    await f.done();
  }
});
test('history metadata 없는 실제 runtime은 caret만 표시하고 Undo 지원을 모사하지 않는다', async () => {
  const f = await fixture(true);
  try {
    await f.replace();
    assert.equal(f.editor.getEditorState().nativeHistoryRevision, undefined);
    assert.equal(f.canvas.dataset.caret, '0:0:6');
    assert.equal(f.surface.canRequestHistory('undo'), false);
    assert.equal(f.surface.requestHistory('undo'), false);
    assert.equal((f.editor.getEditorState().selection as SelectionTarget | null)?.endUnit, 6);
  } finally {
    await f.done();
  }
});
