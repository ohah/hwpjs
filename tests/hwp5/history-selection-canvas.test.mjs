import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
// 실제 Canvas 모듈의 wire 관측 경계. Native 엔진 실행/브라우저 증거가 아니다.
function fixture(t) {
  const doc = {
    activeElement: null,
    defaultView: { AbortController, navigator: { platform: 'MacIntel' } },
  };
  class Node extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 500;
    clientHeight = 600;
    setAttribute() {}
    setSelectionRange(a, b) {
      this.selectionStart = a;
      this.selectionEnd = b;
    }
    focus() {
      doc.activeElement = this;
    }
    blur() {
      doc.activeElement = null;
    }
    hasPointerCapture() {
      return false;
    }
    scrollIntoView() {}
  }
  const row = {
      section: 0,
      paragraph: 0,
      text: 'AB',
      editable: true,
      selectable: true,
      selectionOwner: 'section:0:body',
    },
    layout = layoutContent({ format: 'hwpx', paragraphs: [row] }, 500, () => 10),
    input = new Node(),
    canvas = new Node(),
    requests = [];
  const renderer = {
    layout: () => layout,
    paragraph: () => row,
    onGeometry() {},
    select() {},
    preview() {},
  };
  const controller = createCanvasEditor({
    canvas,
    input,
    viewport: new Node(),
    renderer,
    note: { textContent: '' },
    controls: {
      ready: () => true,
      busy: () => false,
      request: (m) => {
        requests.push(m);
        return true;
      },
    },
    environment: { ownerDocument: doc },
  });
  t.after(() => controller.close());
  return { controller, input, canvas, requests };
}
const vector = (current) => [current, ...Array.from({ length: current }, (_, i) => i)];
test('101개 Native 관측은 reset하지 않고 0까지 낮아지는 Undo 선택을 복원한다', (t) => {
  const f = fixture(t);
  f.controller.initializeCapabilities({
    historyAvailable: true,
    historyRevision: 0,
    historyRevisions: [0],
  });
  assert(f.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 1, endUnit: 1 }));
  for (let revision = 1; revision <= 100; revision++)
    f.controller.message({
      kind: 'observed-native-format',
      historyRevision: revision,
      historyRevisions: vector(revision),
    });
  assert.equal(f.input.disabled, false);
  assert.equal(f.canvas.dataset.caret, '0:0:1');
  assert(f.controller.history('undo'));
  f.controller.message({
    kind: 'undo',
    origin: 'canvas',
    changed: true,
    historyRevision: 0,
    historyRevisions: [0, ...Array.from({ length: 100 }, (_, i) => i + 1)],
  });
  assert.equal(f.input.value, 'AB');
  assert.equal(f.canvas.dataset.caret, '0:0:1');
  assert.equal(f.input.disabled, false);
});
test('외부 partial metadata 초기화도 legacy fallback으로 동작하며 보관하지 못한 위치를 꾸미지 않는다', (t) => {
  const f = fixture(t);
  f.controller.initializeCapabilities({
    historyAvailable: true,
    historyRevision: 0,
    historyRevisions: [0],
  });
  assert(f.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 1, endUnit: 1 }));
  for (let revision = 1; revision <= 100; revision++)
    f.controller.message({
      kind: 'observed-native-format',
      historyRevision: revision,
      historyRevisions: vector(revision),
    });
  f.controller.initializeCapabilities({ historyAvailable: true, historyRevision: 100 });
  assert.equal(f.input.value, 'AB');
  assert(f.controller.history('undo'));
  f.controller.message({ kind: 'undo', origin: 'canvas', changed: true, historyRevision: 0 });
  assert.equal(f.input.disabled, true);
  assert.equal(f.canvas.dataset.caret, '');
});
test('구 V1 작은 reachable 목록과 명시 null은 기존 안전한 unknown 복원을 유지한다', (t) => {
  const f = fixture(t);
  f.controller.initializeCapabilities({
    historyAvailable: true,
    historyRevision: 0,
    historyRevisions: [0],
  });
  f.controller.message({
    kind: 'observed-native-format',
    historyRevision: 1,
    historyRevisions: [1, 0],
  });
  assert(f.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 1, endUnit: 1 }));
  assert(f.controller.history('undo'));
  f.controller.message({
    kind: 'undo',
    origin: 'canvas',
    changed: true,
    historyRevision: 0,
    historyRevisions: [0, 1],
  });
  assert.equal(f.input.disabled, true);
  assert.equal(f.canvas.dataset.caret, '');
});
