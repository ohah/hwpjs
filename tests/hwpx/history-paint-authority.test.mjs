import { caretGeometry } from '../../web/preview/text-geometry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
import {
  createHistoryPaintBarrier,
  historySelectionStamp,
  sameHistoryPaintStamp,
} from '../../web/preview/history-paint-authority.mjs';
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const point = (unit) => ({ section: 0, paragraph: 0, unit });
const selection = (unit) => ({ anchor: point(unit), focus: point(unit) });
function fixture(t, initial = '국민' + 'a '.repeat(263) + '본문', unit = 528) {
  class Document extends EventTarget {
    activeElement = null;
    visibilityState = 'visible';
    defaultView = { AbortController, navigator: { platform: 'MacIntel' } };
  }
  const doc = new Document();
  let noteText = '',
    rejectHistory = false;
  const statusFrames = [];
  class Node extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    attributes = {};
    _value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 500;
    clientHeight = 600;
    get value() {
      return this._value;
    }
    set value(value) {
      const next = String(value);
      if (next !== this._value) {
        this._value = next;
        this.selectionStart = this.selectionEnd = next.length;
        this.selectionDirection = 'none';
      }
    }
    setAttribute(k, v) {
      this.attributes[k] = v;
    }
    scrollIntoView() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 500, bottom: 600 };
    }
    setPointerCapture() {}
    releasePointerCapture() {}
    hasPointerCapture() {
      return false;
    }
    getRootNode() {
      return doc;
    }
    setSelectionRange(a, b, d = 'forward') {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = d;
    }
    focus() {
      doc.activeElement = this;
    }
    blur() {
      doc.activeElement = null;
    }
  }
  const row = {
      section: 0,
      paragraph: 0,
      text: initial,
      editable: true,
      selectable: true,
      selectionOwner: 'section:0:body',
    },
    content = { format: 'hwpx', paragraphs: [row] };
  const canvas = new Node(),
    input = new Node(),
    viewport = new Node(),
    note = {
      set textContent(value) {
        noteText = value;
      },
    };
  let layout = layoutContent(content, 500, () => 10),
    busy = false,
    cursor = 0,
    clock = 0,
    stack = [{ text: initial, revision: 0 }],
    geometry = () => {},
    interaction = {},
    painted = null,
    frameCurrent = false;
  const requests = [],
    waiting = [];
  const renderer = {
    layout: () => layout,
    paragraph: (p) => (p?.section === 0 && p?.paragraph === 0 ? row : null),
    onGeometry(fn) {
      geometry = fn;
    },
    select(value) {
      interaction = value;
    },
    preview(draft) {
      layout = layoutContent(
        { ...content, paragraphs: [{ ...row, text: draft?.text ?? row.text }] },
        500,
        () => 10,
      );
      frameCurrent = false;
      geometry();
    },
    isPaintedFrameCurrent() {
      return frameCurrent;
    },
    isSelectionPainted(value) {
      return (
        frameCurrent &&
        !interaction.historyPending &&
        !interaction.composition &&
        sameHistoryPaintStamp(painted, historySelectionStamp(interaction)) &&
        sameHistoryPaintStamp(painted, historySelectionStamp(value))
      );
    },
  };
  let committedCallback = () => {};
  const direct = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    note,
    controls: {
      ready: () => true,
      busy: () => busy,
      request: (m) => {
        assert.equal(busy, false);
        if (rejectHistory && ['undo', 'redo'].includes(m.kind)) return false;
        requests.push(m);
        waiting.push(m);
        busy = true;
        return true;
      },
    },
    onCommittedSelection(value) {
      committedCallback(value);
    },
    onComposition(value) {
      statusFrames.push({
        pending: value.pending,
        authority: canvas.dataset.selectionAuthority,
        note: noteText,
      });
    },
    environment: { ownerDocument: doc },
    historyAvailability: () => ({
      available: true,
      canUndo: cursor > 0,
      canRedo: cursor < stack.length - 1,
    }),
  });
  const frame = () => {
    painted = historySelectionStamp(interaction);
    frameCurrent = true;
    geometry();
  };
  direct.initializeCapabilities({
    historyAvailable: true,
    historyRevision: 0,
    historyRevisions: [0],
  });
  assert(direct.selectTextRange({ section: 0, paragraph: 0, startUnit: unit, endUnit: unit }));
  frame();
  t.after(() => direct.close());
  const fire = (type, data = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, data);
    input.dispatchEvent(e);
    return e;
  };
  const type = (text) => {
    const e = fire('beforeinput', { inputType: 'insertText', data: text });
    if (!e.defaultPrevented) {
      const a = input.selectionStart,
        b = input.selectionEnd;
      input.value = input.value.slice(0, a) + text + input.value.slice(b);
      input.setSelectionRange(a + text.length, a + text.length);
      fire('input', { inputType: 'insertText', data: text });
    }
    return e;
  };
  const ack = ({ error = null, noop = false, unknownRevision = false } = {}) => {
    const request = waiting.shift();
    assert(request, '실제 Native 요청 모델이 있어야 합니다.');
    const before = cursor;
    if (!error && !noop) {
      if (request.kind === 'splice') {
        const current = stack[cursor].text;
        stack = stack.slice(0, cursor + 1);
        stack.push({
          text: current.slice(0, request.startUnit) + request.text + current.slice(request.endUnit),
          revision: ++clock,
        });
        cursor++;
      }
      if (request.kind === 'undo') cursor = Math.max(0, cursor - 1);
      if (request.kind === 'redo') cursor = Math.min(stack.length - 1, cursor + 1);
    }
    row.text = stack[cursor].text;
    layout = layoutContent(content, 500, () => 10);
    frameCurrent = false;
    busy = false;
    const revision = unknownRevision ? 999 : stack[cursor].revision;
    direct.message({
      ...request,
      ...(error ? { error } : {}),
      historyRevision: revision,
      historyRevisions: [
        revision,
        ...stack.filter((x) => x.revision !== revision).map((x) => x.revision),
      ],
      changed: !error && !noop && (request.kind === 'splice' || cursor !== before),
      applied: !error,
    });
    return request;
  };
  return {
    direct,
    setCommittedCallback(fn) {
      committedCallback = fn;
    },
    currentLayout() {
      return layout;
    },
    pointerMove(unit) {
      const g = caretGeometry(layout, point(unit));
      assert(g);
      const e = new Event('pointermove', { cancelable: true });
      Object.assign(e, { pointerId: 1, clientX: g.x, clientY: g.y + 2 });
      canvas.dispatchEvent(e);
    },
    modelFrameOnly() {
      frameCurrent = true;
    },
    pointer(unit) {
      const g = caretGeometry(layout, point(unit));
      assert(g);
      const e = new Event('pointerdown', { cancelable: true });
      Object.assign(e, { pointerId: 1, button: 0, clientX: g.x, clientY: g.y + 2 });
      canvas.dispatchEvent(e);
      return e;
    },
    useSetterOnly() {
      assert.equal(Object.getOwnPropertyDescriptor(note, 'textContent').get, undefined);
    },
    rejectHistory() {
      rejectHistory = true;
    },
    statusFrames,
    currentNote: () => noteText,
    doc,
    input,
    canvas,
    note,
    requests,
    waiting,
    type,
    ack,
    fire,
    frame,
    geometry: () => geometry(),
    get interaction() {
      return interaction;
    },
    get text() {
      return row.text;
    },
    get cursor() {
      return cursor;
    },
  };
}
async function prepared(t) {
  const f = fixture(t);
  f.type('b');
  f.ack();
  f.frame();
  await tick();
  assert(f.direct.selectTextRange({ section: 0, paragraph: 0, startUnit: 249, endUnit: 249 }));
  f.frame();
  return f;
}

test('249 화면에서 undo 접수는 즉시 비권위이며 528 실제 frame 전까지 R을 소비하지 않는다', async (t) => {
  const f = await prepared(t);
  assert(f.direct.requestHistory('undo'));
  assert.equal(f.canvas.dataset.selectionAuthority, 'history-pending');
  assert.match(f.currentNote(), /현재 커서는 새 입력 위치가 아닙니다/);
  assert.equal(f.input.selectionStart, 249);
  assert.equal(f.interaction.historyPending, true);
  f.type('R');
  assert.equal(f.requests.length, 2);
  f.ack();
  await tick();
  assert.equal(f.input.selectionStart, 528);
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
  assert.equal(f.requests.length, 2);
  f.geometry();
  await tick();
  assert.equal(f.requests.length, 2);
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].startUnit, 528);
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.input.selectionStart, 529);
  assert.equal(f.text[528], 'R');
});
test('undo 원 오류는 보존하고 대기 R은 249로 유지한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack({ error: 'OutOfMemory' });
  await tick();
  assert.match(f.currentNote(), /OutOfMemory/);
  assert.equal(f.requests.length, 2);
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).startUnit, 249);
  assert.equal(f.requests.at(-1).text, 'R');
});
test('changed false는 249를 보존하고 R을 조용히 버리지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack({ noop: true });
  await tick();
  assert.equal(f.input.selectionStart, 249);
  assert.equal(f.requests.length, 2);
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).startUnit, 249);
});
test('두 undo와 keyup 뒤 입력은 각 frame barrier 순서를 유지한다', async (t) => {
  const f = fixture(t, 'AB', 1);
  for (const c of ['x', 'y']) {
    f.type(c);
    f.ack();
    f.frame();
    await tick();
  }
  assert(f.direct.requestHistory('undo'));
  assert(f.direct.requestHistory('undo'));
  f.type('R');
  const count = f.requests.length;
  f.fire('keyup', { key: 'z', code: 'KeyZ', metaKey: false });
  assert.equal(f.requests.length, count);
  f.ack();
  await tick();
  assert.equal(f.requests.length, count);
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).kind, 'undo');
  f.ack();
  await tick();
  assert.equal(f.requests.at(-1).kind, 'undo');
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
  assert.equal(f.requests.at(-1).startUnit, 1);
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.text, 'ARB');
  assert.equal(f.direct.requestHistory('redo'), false);
});
test('hidden에서는 유효 입력을 보존하고 visible의 frame 후 진행한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.doc.visibilityState = 'hidden';
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 2);
  f.doc.visibilityState = 'visible';
  f.doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(f.requests.at(-1).startUnit, 528);
});
test('조합 입력은 같은 undo barrier에서 ACK와 frame 뒤에 적용한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.fire('compositionstart');
  f.ack();
  await tick();
  assert.equal(f.requests.length, 2);
  f.fire('compositionend', { data: '한😀' });
  await tick();
  assert.equal(f.requests.length, 2);
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, '한😀');
  assert.equal(f.requests.at(-1).startUnit, 528);
});
test('빈 조합 취소 뒤 R도 같은 barrier를 통과한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.fire('compositionstart');
  f.ack();
  f.fire('compositionend', { data: '' });
  f.type('R');
  await tick();
  assert.equal(f.requests.length, 2);
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
  assert.equal(f.requests.at(-1).startUnit, 528);
});
test('dispose 후 늦은 frame이 대기 R을 새 Native 쓰기로 만들지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.direct.close();
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 2);
});
test('복원 선택이 없으면 입력을 보존하며 임의 위치에 쓰지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack({ unknownRevision: true });
  f.frame();
  await tick();
  assert.equal(f.requests.length, 2);
  assert.equal(f.canvas.dataset.selectionAuthority, 'history-unresolved');
  assert.match(f.currentNote(), /대기 입력을 보존/);
});
test('paint barrier는 단일 microtask나 기하 알림만으로 열리지 않는다', async () => {
  let painted = false,
    releases = 0;
  const b = createHistoryPaintBarrier({ isPainted: () => painted, release: () => releases++ });
  b.begin();
  b.acknowledge(selection(528));
  await tick();
  assert.equal(releases, 0);
  b.notify();
  await tick();
  assert.equal(releases, 0);
  painted = true;
  b.notify();
  await tick();
  assert.equal(releases, 1);
});
test('같은 선택의 유효 frame은 새 rAF 강제 없이 재사용할 수 있다', async () => {
  let releases = 0;
  const b = createHistoryPaintBarrier({ isPainted: () => true, release: () => releases++ });
  b.begin();
  b.acknowledge(selection(249));
  await tick();
  assert.equal(releases, 1);
});
test('문서 reset 전 callback은 새 ticket을 해제하지 않는다', async () => {
  const jobs = [],
    released = [];
  const b = createHistoryPaintBarrier({
    enqueue: (f) => jobs.push(f),
    isPainted: () => true,
    release: (t) => released.push(t.sequence),
  });
  const old = b.begin();
  b.acknowledge(selection(1));
  b.reset();
  const next = b.begin();
  b.acknowledge(selection(2));
  jobs[0]();
  assert.deepEqual(released, []);
  jobs[1]();
  assert.deepEqual(released, [next.sequence]);
  assert.notEqual(old.sequence, next.sequence);
});
test('선택 스탬프는 affinity와 생성 셀 소유자까지 구분한다', () => {
  assert(
    !sameHistoryPaintStamp(
      historySelectionStamp(selection(1)),
      historySelectionStamp({ ...selection(1), focus: { ...point(1), affinity: 'backward' } }),
    ),
  );
  const a = {
    anchor: { section: 0, createdCell: { identity: 1, row: 0, column: 0 }, unit: 1 },
    focus: { section: 0, createdCell: { identity: 1, row: 0, column: 0 }, unit: 1 },
  };
  const b = structuredClone(a);
  b.focus.createdCell.identity = 2;
  assert(!sameHistoryPaintStamp(historySelectionStamp(a), historySelectionStamp(b)));
});

test('실 setter-only port에서 요청 거부 복귀 안내는 pending=false와 일치한다', async (t) => {
  const f = await prepared(t);
  f.useSetterOnly();
  f.rejectHistory();
  const start = f.statusFrames.length;
  f.direct.requestHistory('undo');
  const inconsistent = f.statusFrames
    .slice(start)
    .filter(
      (x) =>
        !x.pending &&
        x.authority === 'current' &&
        x.note.includes('현재 커서는 새 입력 위치가 아닙니다'),
    );
  assert.equal(inconsistent.length, 0);
  assert.match(f.currentNote(), /OrderedInputRejected/);
  assert.equal(f.canvas.dataset.selectionAuthority, 'current');
  assert.equal(f.requests.length, 1);
});
test('실 setter-only port의 거부 뒤 새 입력은 원 249 선택을 유지한다', async (t) => {
  const f = await prepared(t);
  f.useSetterOnly();
  f.rejectHistory();
  f.direct.requestHistory('undo');
  f.type('R');
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests.at(-1).kind, 'splice');
  assert.equal(f.requests.at(-1).startUnit, 249);
  assert.equal(f.requests.at(-1).text, 'R');
});

test('실 frame gate는 ACK 뒤 아직 새 frame이 없을 때 pointer를 차단한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.ack();
  f.pointer(20);
  f.type('R');
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].startUnit, 528);
});
test('모델 frame만 current인 선택 미확정 구간의 pointer가 이력 ticket을 영구 이탈시키지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.ack();
  f.modelFrameOnly();
  f.pointer(20);
  f.type('R');
  f.frame();
  await tick();
  assert.equal(
    f.requests.length,
    3,
    '현재 source는 pointer로 복원 선택을 덮고 barrier가 해제되지 않습니다.',
  );
  assert.equal(f.requests[2].startUnit, 528);
});
test('ACK와 새 frame 사이 Ctrl+A는 복원 paint 뒤 원순서로 적용되어야 한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.ack();
  f.fire('keydown', { key: 'a', metaKey: true, ctrlKey: false });
  f.type('R');
  f.frame();
  await tick();
  assert.equal(
    f.requests.length,
    3,
    '현재 source는 Ctrl+A가 복원 선택을 덮어 대기 R도 영구 보류합니다.',
  );
  assert.equal(f.requests[2].startUnit, 0);
});

for (const event of ['select', 'keyup'])
  test(`복원 paint 전 늦은 DOM ${event}는 ticket 선택을 바꾸지 않는다`, async (t) => {
    const f = await prepared(t);
    f.direct.requestHistory('undo');
    f.ack();
    f.input.setSelectionRange(20, 20);
    f.fire(event, { key: 'z' });
    f.type('R');
    f.frame();
    await tick();
    assert.equal(f.requests.length, 3);
    assert.equal(
      f.requests[2].startUnit,
      528,
      'DOM 범위가 아닌 확인된 이력 선택에서 입력해야 합니다.',
    );
  });
for (const mode of ['noop', 'error'])
  test(`Ctrl+A 보존은 ${mode} 응답에서도 실제 전체 선택 뒤 R로 대체한다`, async (t) => {
    const f = await prepared(t);
    f.direct.requestHistory('undo');
    f.ack(mode === 'noop' ? { noop: true } : { error: '기존 오류' });
    f.fire('keydown', { key: 'a', ctrlKey: true });
    f.type('R');
    f.frame();
    await tick();
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests[2].startUnit, 0);
    assert.equal(f.requests[2].endUnit, f.text.length);
    assert.equal(f.requests[2].text, 'R');
  });
test('paint 완료 뒤 공개 재선택은 즉시 허용되고 새 입력은 명시 선택을 사용한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.ack();
  assert.equal(
    f.direct.selectTextRange({ section: 0, paragraph: 0, startUnit: 20, endUnit: 20 }),
    false,
  );
  f.frame();
  await tick();
  assert.equal(
    f.direct.selectTextRange({ section: 0, paragraph: 0, startUnit: 20, endUnit: 20 }),
    true,
  );
  f.type('R');
  assert.equal(f.requests[2].startUnit, 20);
});

test('이전 drag의 pointermove도 복원 paint 전 ticket 선택을 바꾸지 않는다', async (t) => {
  const f = await prepared(t);
  f.pointer(249);
  f.direct.requestHistory('undo');
  f.ack();
  f.modelFrameOnly();
  f.pointerMove(20);
  f.type('R');
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].startUnit, 528);
});
for (const key of ['ArrowLeft', 'Home', 'End'])
  test(`대기 ${key}는 원래 navigation 큐에서 복원 paint 다음에 적용된다`, async (t) => {
    const f = await prepared(t);
    f.direct.requestHistory('undo');
    f.ack();
    const row = f.currentLayout().rows.find((row) => row.startUnit <= 528 && row.endUnit >= 528);
    const expected = key === 'ArrowLeft' ? 527 : key === 'Home' ? row.startUnit : row.endUnit;
    f.fire('keydown', { key });
    assert.equal(f.interaction.focus.unit, 528);
    f.type('R');
    f.frame();
    await tick();
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests[2].startUnit, expected);
  });
for (const action of ['reset', 'close'])
  test(`해제 중 selection callback이 ${action}하면 이전 R은 drain하지 않는다`, async (t) => {
    const f = await prepared(t);
    f.direct.requestHistory('undo');
    f.type('R');
    f.ack();
    let calls = 0;
    f.setCommittedCallback((value) => {
      if (!value || calls) return;
      calls++;
      f.direct[action]();
    });
    f.frame();
    await tick();
    f.frame();
    await tick();
    assert.equal(calls, 1);
    assert.equal(f.requests.length, 2);
  });

for (const mode of ['changed', 'noop', 'error'])
  for (const key of ['SelectAll', 'ArrowLeft'])
    test(`기존 history 포트의 ${mode} 응답 뒤 ${key} 의도도 같은 barrier에 보존된다`, async (t) => {
      const f = await prepared(t);
      assert.equal(f.direct.history('undo'), true);
      f.ack(mode === 'noop' ? { noop: true } : mode === 'error' ? { error: '기존 오류' } : {});
      f.fire('keydown', key === 'SelectAll' ? { key: 'a', metaKey: true } : { key });
      f.type('R');
      f.frame();
      await tick();
      assert.equal(f.requests.length, 3);
      const restored = mode === 'changed' ? 528 : 249;
      assert.equal(f.requests[2].startUnit, key === 'SelectAll' ? 0 : restored - 1);
      if (key === 'SelectAll') assert.equal(f.requests[2].endUnit, f.text.length);
    });
test('기존 history 포트의 Native ACK 전 R도 조용히 버리지 않는다', async (t) => {
  const f = await prepared(t);
  assert.equal(f.direct.history('undo'), true);
  f.type('R');
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[2].startUnit, 528);
});
