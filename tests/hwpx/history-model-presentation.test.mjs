import { matchHistoryModelSelection } from '../../web/preview/history-model-readiness.mjs';
import { caretGeometry } from '../../web/preview/text-geometry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
import {
  historySelectionStamp,
  sameHistoryPaintStamp,
} from '../../web/preview/history-paint-authority.mjs';
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const point = (unit) => ({ section: 0, paragraph: 0, unit });
function fixture(t, initial = 'AB', unit = 1, modelPort = true) {
  class Document extends EventTarget {
    activeElement = null;
    visibilityState = 'visible';
    defaultView = { AbortController, navigator: { platform: 'MacIntel' } };
  }
  const doc = new Document();
  let noteText = '',
    clearHistorySelection = false,
    publicationCalls = 0,
    publicationOverride = null,
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
    stack = [{ text: initial, revision: 0, caret: unit }],
    geometry = () => {},
    interaction = {},
    painted = null,
    frameCurrent = false;
  const requests = [],
    waiting = [];
  let clearDraftCalls = 0,
    layoutReads = 0,
    modelState = null,
    layoutReadHook = null;
  const renderer = {
    clearDraft() {
      clearDraftCalls++;
      this.preview(null);
    },
    layout: () => {
      layoutReads++;
      const callback = layoutReadHook;
      layoutReadHook = null;
      callback?.();
      return layout;
    },
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
  let lastAcknowledgement;
  const direct = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    note,
    historyModelState: modelPort ? () => modelState : null,
    prepareHistoryModelSelection: async ({ selection, revision }) => {
      publicationCalls++;
      if (publicationOverride)
        return publicationOverride({ selection, revision, sourceState: modelState });
      assert.equal(modelState.nativeHistoryRevision, revision);
      const startUnit = Math.min(selection.anchor.unit, selection.focus.unit);
      const endUnit = Math.max(selection.anchor.unit, selection.focus.unit);
      modelState = {
        ...modelState,
        stateVersion: modelState.stateVersion + 1,
        selection: {
          documentId: 'docA',
          generation: 1,
          operationRevision: modelState.operationRevision,
          viewRevision: 0,
          coordinateSpace: 'display',
          format: 'hwpx',
          owner: 'section:0:body',
          section: 0,
          paragraph: 0,
          startUnit,
          endUnit,
          affinity: 'forward',
        },
      };
      return modelState;
    },
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
          caret: request.startUnit + request.text.length,
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
    const unit = stack[cursor].caret;
    modelState = {
      documentId: 'docA',
      generation: 1,
      operationRevision: requests.length,
      viewRevision: 0,
      stateVersion: requests.length,
      status: 'ready',
      nativeHistoryRevision: revision,
      content,
      selection: {
        documentId: 'docA',
        generation: 1,
        operationRevision: requests.length,
        viewRevision: 0,
        coordinateSpace: 'display',
        format: 'hwpx',
        owner: 'section:0:body',
        section: 0,
        paragraph: 0,
        startUnit: unit,
        endUnit: unit,
        affinity: 'forward',
      },
    };
    if (clearHistorySelection && ['undo', 'redo'].includes(request.kind))
      modelState.selection = undefined;
    lastAcknowledgement = direct.message({
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
    formatRange(startUnit = 0, endUnit = 2) {
      // surface가 공개 서식 snapshot과 retained selection을 받는 순서만 모델링합니다.
      assert(direct.selectTextRange({ section: 0, paragraph: 0, startUnit, endUnit }));
      stack = stack.slice(0, cursor + 1);
      stack.push({ text: row.text, revision: ++clock, caret: endUnit });
      cursor++;
      direct.initializeCapabilities({
        historyAvailable: true,
        historyRevision: clock,
        historyRevisions: stack.map((entry) => entry.revision),
      });
      assert(direct.selectTextRange({ section: 0, paragraph: 0, startUnit, endUnit }));
      frameCurrent = false;
    },
    acknowledgement: () => lastAcknowledgement,
    clearCoreHistorySelection() {
      clearHistorySelection = true;
    },
    publicationCalls: () => publicationCalls,
    overridePublication(fn) {
      publicationOverride = fn;
    },
    state: () => modelState,
    viewport,
    reads: () => layoutReads,
    onNextLayout(callback) {
      layoutReadHook = callback;
    },
    invalidatePaint() {
      frameCurrent = false;
    },
    invalidateState() {
      modelState = { ...modelState };
    },
    publishModelSelection() {
      modelState = { ...modelState, stateVersion: modelState.stateVersion + 1 };
    },
    corruptSelection() {
      modelState.selection.owner = 'unknown';
    },
    clearDraftCount: () => clearDraftCalls,
    setCommittedCallback(fn) {
      committedCallback = fn;
    },
    currentLayout() {
      return layout;
    },
    hideCaretRows() {
      const previous = layout;
      layout = { ...layout, rows: [] };
      frameCurrent = false;
      return () => {
        layout = previous;
        frameCurrent = false;
      };
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

async function prepared(t, modelPort = true) {
  const f = fixture(t, 'AB', 1, modelPort);
  f.type('x');
  f.ack();
  f.frame();
  await tick();
  f.type('y');
  f.ack();
  f.frame();
  await tick();
  return f;
}
test('연속 undo는 Native 요청·ACK 순서를 유지하고 중간 layout 조회를 생략한다', async (t) => {
  const f = await prepared(t),
    start = f.reads();
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  const beforeAck = f.reads();
  f.ack();
  await tick();
  assert.equal(f.reads(), beforeAck);
  assert.equal(f.direct.historyModelReady(), false); // 두 번째 Native 요청은 이미 진행 중입니다.
  assert.equal(f.requests.at(-1).kind, 'undo');
  f.ack();
  await tick();
  assert.equal(f.text, 'AB');
  assert(f.direct.historyModelReady());
  assert.equal(f.reads(), beforeAck);
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
  assert(start <= beforeAck);
  f.frame();
  await tick();
  assert.equal(f.input.selectionStart, 1);
  assert(f.direct.settled());
});
test('undo 두 번 뒤 R은 최종 선택 paint 전에는 Native에 제출되지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  f.ack();
  await tick();
  assert.equal(f.requests.length, 4);
  assert.equal(f.direct.flushComposition(), 'blocked');
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
  assert.equal(f.requests.at(-1).startUnit, 1);
  f.ack();
  assert.equal(f.text, 'ARB');
});
test('undo 다음 입력을 redo가 추월하지 않으며 새 분기를 만든다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.direct.requestHistory('redo');
  f.ack();
  await tick();
  assert.equal(f.requests.at(-1).kind, 'undo');
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).kind, 'redo');
  f.ack({ noop: true });
  f.frame();
  await tick();
  assert.equal(f.text, 'AxRB');
});
test('undo와 redo의 모델·저장 대상 텍스트는 원 순서와 같다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('redo');
  f.ack();
  await tick();
  f.ack();
  await tick();
  assert.equal(f.text, 'AxyB');
  assert.equal(f.cursor, 2);
  assert.deepEqual(
    f.requests.slice(2).map((x) => x.kind),
    ['undo', 'redo'],
  );
  f.frame();
  await tick();
  assert.equal(f.input.selectionStart, 3);
});
test('모델 포트가 없는 기존 호출자는 paint까지 다음 이력을 보류한다', async (t) => {
  const f = await prepared(t, false);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  assert.equal(f.requests.length, 3);
  f.frame();
  await tick();
  assert.equal(f.requests.length, 4);
});
test('실패한 undo는 모델 준비로 승격되지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('redo');
  f.ack({ error: 'Rejected' });
  await tick();
  assert.equal(f.direct.historyModelReady(), false);
  assert.equal(f.requests.length, 3);
  assert.equal(f.text, 'AxyB');
});
test('noop undo도 기존 paint barrier를 유지한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('redo');
  f.ack({ noop: true });
  await tick();
  assert.equal(f.direct.historyModelReady(), false);
  assert.equal(f.requests.length, 3);
  f.frame();
  await tick();
  assert.equal(f.requests.length, 4);
});
test('숨겨진 문서는 모델만으로 다음 이력을 해제하지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.doc.visibilityState = 'hidden';
  f.ack();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.direct.historyModelReady(), false);
});
test('현재 snapshot identity가 바뀌면 이전 모델 준비 증거를 재사용하지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  assert(f.direct.historyModelReady());
  f.invalidateState();
  assert.equal(f.direct.historyModelReady(), false);
  f.direct.requestHistory('redo');
  await tick();
  assert.equal(f.requests.length, 3);
});
test('core owner가 달라진 선택은 모델만으로 해제하지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.corruptSelection();
  f.type('R');
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
  assert.equal(f.direct.historyModelReady(), false);
});
test('문서 reset은 대기 이력과 늦은 프레임의 권위를 무효화한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.ack();
  f.direct.reset();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.direct.historyModelReady(), false);
});
test('dispose 뒤 늦은 ACK나 프레임은 다음 요청을 제출하지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.direct.close();
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
});
test('composition 대기 중에는 모델 ACK가 다음 이력을 추월시키지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.fire('compositionstart');
  f.ack();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.direct.flushComposition(), 'blocked');
});
test('이전 선택의 늦은 프레임은 최신 R 입력 barrier를 풀지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  assert.equal(f.waiting[0]?.kind, 'undo');
  f.modelFrameOnly();
  f.ack();
  await tick();
  f.modelFrameOnly();
  f.geometry();
  await tick();
  assert.equal(f.requests.length, 4);
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
});

test('병합 경로와 기존 순차 경로의 최종 이력·텍스트·선택 모델은 같다', async (t) => {
  const a = await prepared(t, false),
    b = await prepared(t, true);
  for (const kind of ['undo', 'undo', 'redo', 'redo']) {
    a.direct.requestHistory(kind);
    b.direct.requestHistory(kind);
    a.ack();
    a.frame();
    await tick();
    b.ack();
    await tick();
  }
  b.frame();
  await tick();
  assert.equal(a.text, b.text);
  assert.equal(a.cursor, b.cursor);
  assert.equal(a.input.selectionStart, b.input.selectionStart);
  assert.equal(a.input.selectionEnd, b.input.selectionEnd);
  assert.deepEqual(a.requests, b.requests);
});

test('마지막 이력의 화면 계산 뒤에만 복원 커서의 scroll을 맞춘다', async (t) => {
  const f = fixture(t, 'a'.repeat(1500), 1500);
  f.type('x');
  f.ack();
  f.frame();
  await tick();
  f.viewport.scrollTop = 0;
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  assert.equal(f.viewport.scrollTop, 0);
  f.frame();
  await tick();
  assert(f.viewport.scrollTop > 0);
  assert.equal(f.requests.length, 2);
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
  assert.equal(f.requests.at(-1).startUnit, 1500);
});

test('각 이력 ACK의 선택 게시를 보존하고 같은 모델의 selection-only 관측을 허용한다', async (t) => {
  const f = await prepared(t);
  let callbacks = 0;
  f.setCommittedCallback(() => {
    callbacks++;
    f.publishModelSelection();
  });
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.ack();
  await tick();
  assert.equal(callbacks, 2);
  assert(f.direct.historyModelReady());
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
});
test('선택 게시 콜백의 dispose는 후속 이력과 화면 해제를 취소한다', async (t) => {
  const f = await prepared(t);
  let closing = false;
  f.setCommittedCallback((value) => {
    if (!value || closing) return;
    closing = true;
    f.direct.close();
  });
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.direct.historyModelReady(), false);
});

test('실 controller의 새 모델 경로도 연속 이력을 task 단위로 양보한다', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++) {
    f.type('x');
    f.ack();
    f.frame();
    await tick();
  }
  for (let i = 0; i < 20; i++) assert(f.direct.requestHistory('undo'));
  for (let i = 0; i < 16; i++) {
    assert.equal(f.waiting[0]?.kind, 'undo');
    f.ack();
    await tick();
  }
  assert.equal(f.waiting.length, 0);
  assert.equal(f.requests.filter((x) => x.kind === 'undo').length, 16);
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 16; i < 20; i++) {
    assert.equal(f.waiting[0]?.kind, 'undo');
    f.ack();
    await tick();
  }
  assert.equal(f.text, 'AB');
  f.frame();
  await tick();
  assert(f.direct.settled());
});

// 아래 표 셀은 계약용 합성 DTO입니다. genuine core·실 Native 증거로 계산하지 않습니다.
function tableModel() {
  const row = {
    section: 0,
    paragraph: 15,
    text: 'x'.repeat(600),
    selectable: true,
    editable: true,
    tableCell: { tableNode: 81, listNode: 82 },
  };
  const point = { section: 0, paragraph: 15, unit: 528 };
  const selected = {
    documentId: 'A',
    generation: 1,
    operationRevision: 3,
    viewRevision: 0,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'section:0:table:81:list:82',
    section: 0,
    paragraph: 15,
    startUnit: 528,
    endUnit: 528,
    affinity: 'forward',
  };
  const state = {
    documentId: 'A',
    generation: 1,
    operationRevision: 3,
    viewRevision: 0,
    status: 'ready',
    nativeHistoryRevision: 2,
    content: { format: 'hwp5', paragraphs: [row] },
    selection: selected,
  };
  return { row, state, selection: { anchor: { ...point }, focus: { ...point } } };
}
test('원본 표 셀의 canonical owner와 범위를 같은 모델에서 대조한다', () => {
  const f = tableModel();
  assert(matchHistoryModelSelection(f.state, 2, f.selection, f.row));
});
test('같은 표라도 다른 list owner의 선택을 재사용하지 않는다', () => {
  const f = tableModel();
  f.state.selection.owner = 'section:0:table:81:list:83';
  assert.equal(matchHistoryModelSelection(f.state, 2, f.selection, f.row), false);
});
test('이력 뒤 원본 셀의 list가 바뀌면 이전 선택 증거는 거부한다', () => {
  const f = tableModel();
  f.row.tableCell.listNode = 83;
  assert.equal(matchHistoryModelSelection(f.state, 2, f.selection, f.row), false);
});
test('불명확한 표 셀 주소와 도형 혼합 소유권은 기존 strict 경로다', () => {
  for (const change of [
    (f) => {
      f.row.tableCell.listNode = -1;
    },
    (f) => {
      f.row.drawingText = { drawingNode: 4, listNode: 5 };
    },
  ]) {
    const f = tableModel();
    change(f);
    assert.equal(matchHistoryModelSelection(f.state, 2, f.selection, f.row), false);
  }
});
test('created cell과 다른 문서 token은 표 셀 모델 준비로 승격하지 않는다', () => {
  for (const change of [
    (f) => {
      f.selection.focus.createdCell = { identity: 'new' };
    },
    (f) => {
      f.state.selection.generation = 2;
    },
  ]) {
    const f = tableModel();
    change(f);
    assert.equal(matchHistoryModelSelection(f.state, 2, f.selection, f.row), false);
  }
});

test('malformed 셀과 null owner의 우연한 일치는 준비 근거가 아니다', () => {
  const f = tableModel();
  f.row.tableCell.listNode = -1;
  f.state.selection.owner = null;
  assert.equal(matchHistoryModelSelection(f.state, 2, f.selection, f.row), false);
});

test('최종 frame stamp가 같아도 실제 caret 행이 없으면 R을 해제하지 않는다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  assert(f.direct.historyModelReady());
  const restore = f.hideCaretRows();
  assert.equal(caretGeometry(f.currentLayout(), point(2)), null);
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3, 'caret geometry 없는 paint는 입력 권위가 아니다');
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
  restore();
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
  assert.equal(f.requests.at(-1).startUnit, 2);
});

test('같은 모델이어도 최종 geometry 조회 중 paint stamp가 바뀌면 R을 보류한다', async (t) => {
  const f = await prepared(t);
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  assert(f.direct.historyModelReady());
  f.frame();
  f.onNextLayout(() => f.invalidatePaint());
  await tick();
  assert(f.direct.historyModelReady());
  assert.equal(f.requests.length, 3);
  assert.equal(f.canvas.dataset.selectionAuthority, 'awaiting-history-paint');
  f.frame();
  await tick();
  assert.equal(f.requests.at(-1).text, 'R');
});

test('실 core처럼 undo ACK가 선택을 지워도 공개 게시 뒤 다음 이력을 모델 준비로 진행한다', async (t) => {
  const f = await prepared(t);
  f.clearCoreHistorySelection();
  assert.equal(f.direct.requestHistory('undo'), true);
  assert.equal(f.direct.requestHistory('undo'), true);
  const beforeAck = f.reads();
  f.ack();
  await tick();
  assert.equal(
    await f.acknowledgement(),
    true,
    '모델 게시 완료를 surface에 명시적으로 반환합니다.',
  );
  assert.equal(f.reads(), beforeAck, '게시 완료까지 중간 geometry 조회가 없어야 합니다.');
  assert.equal(
    f.publicationCalls(),
    1,
    '선택이 없는 ACK 뒤 기존 공개 선택 게시 단계가 필요합니다.',
  );
  assert.equal(
    f.requests.length,
    4,
    '중간 frame 없이 실제 게시된 선택을 확인한 뒤 다음 undo를 제출해야 합니다.',
  );
});

test('게시 거부는 최종 frame을 받아도 대기 입력과 다음 이력을 해제하지 않는다', async (t) => {
  const f = await prepared(t);
  f.clearCoreHistorySelection();
  f.overridePublication(() => null);
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.canvas.dataset.selectionAuthority, 'history-unresolved');
});
test('게시 Promise 거부도 Native 이력 성공을 새 쓰기로 바꾸지 않는다', async (t) => {
  const f = await prepared(t);
  f.clearCoreHistorySelection();
  f.overridePublication(() => Promise.reject(Error('PublishRejected')));
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
  assert.equal(f.canvas.dataset.selectionAuthority, 'history-unresolved');
});
test('문서 reset 뒤 늦은 게시 완료는 다음 이력이나 입력을 시작하지 않는다', async (t) => {
  const f = await prepared(t);
  f.clearCoreHistorySelection();
  let finish;
  f.overridePublication(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.direct.requestHistory('undo');
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  const old = f.state();
  f.direct.reset();
  finish(old);
  await tick();
  f.frame();
  await tick();
  assert.equal(f.requests.length, 3);
});
test('dispose 뒤 늦은 게시 완료는 이전 문서의 입력을 제출하지 않는다', async (t) => {
  const f = await prepared(t);
  f.clearCoreHistorySelection();
  let finish;
  f.overridePublication(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.direct.requestHistory('undo');
  f.type('R');
  f.ack();
  await tick();
  const old = f.state();
  f.direct.close();
  finish(old);
  await tick();
  assert.equal(f.requests.length, 3);
});

test('서식 undo의 최종 선택 paint 뒤 대기 문구를 완료로 바꾼다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  assert(f.direct.requestHistory('undo'));
  f.ack();
  await tick();
  assert.match(f.currentNote(), /화면 반영 대기/);
  assert.equal(f.direct.settled(), false);
  f.frame();
  await tick();
  assert(f.direct.settled());
  assert.equal(f.canvas.dataset.selectionAuthority, 'current');
  assert.equal(f.input.attributes['aria-busy'], 'false');
  assert.equal(f.input.selectionStart, 0);
  assert.equal(f.input.selectionEnd, 2);
  assert.match(f.currentNote(), /화면 반영 완료/);
});
test('서식 undo와 redo 뒤 다른 위치 클릭과 입력은 실제 paint 뒤 허용된다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  for (const kind of ['undo', 'redo']) {
    assert(f.direct.requestHistory(kind));
    f.ack();
    await tick();
    assert.equal(f.direct.settled(), false);
    assert(f.pointer(3).defaultPrevented);
    f.frame();
    await tick();
    assert(f.direct.settled());
  }
  f.pointer(3);
  f.type('R');
  assert.equal(f.requests.at(-1).kind, 'splice');
  assert.equal(f.requests.at(-1).startUnit, 3);
  f.ack();
  f.frame();
  await tick();
  assert.equal(f.text, 'ABCRD');
});
test('blur로 caret가 없어도 실제 선택 paint가 확인되면 완료하고 focus를 빼앗지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  f.input.blur();
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.frame();
  await tick();
  assert(f.direct.settled());
  assert.equal(f.doc.activeElement, null);
  assert.match(f.currentNote(), /화면 반영 완료/);
});
test('복원 geometry가 없으면 대기를 완료로 바꾸지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  const restore = f.hideCaretRows();
  f.frame();
  await tick();
  assert.equal(f.direct.settled(), false);
  assert.match(f.currentNote(), /화면 반영 대기/);
  restore();
  f.frame();
  await tick();
  assert(f.direct.settled());
  assert.match(f.currentNote(), /화면 반영 완료/);
});
test('이력 실패 문구는 다음 paint가 덮어쓰지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.direct.requestHistory('undo');
  f.ack({ error: 'FormatHistoryRejected' });
  f.frame();
  await tick();
  assert.match(f.currentNote(), /FormatHistoryRejected/);
});
test('reset 뒤 늦은 geometry 알림은 완료 상태를 게시하지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.direct.reset({ selectionOrigin: 'core' });
  f.frame();
  await tick();
  assert.equal(f.currentNote(), '');
  assert.equal(f.input.disabled, true);
});

test('대기 중 다른 안내가 게시되면 release가 그 안내를 덮어쓰지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  assert(f.pointer(3).defaultPrevented);
  const current = f.currentNote();
  assert.equal(current, '화면 갱신 중입니다. 갱신된 화면에서 다시 선택하세요.');
  f.frame();
  await tick();
  assert(f.direct.settled());
  assert.equal(f.currentNote(), current);
});
test('release의 선택 알림에서 발생한 오류 안내를 완료 문구가 덮어쓰지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.setCommittedCallback(() => {
    f.setCommittedCallback(() => {});
    f.direct.initializeCapabilities({ historyAvailable: false });
    f.direct.history('undo');
  });
  f.frame();
  await tick();
  assert(f.direct.settled());
  assert.equal(f.currentNote(), '이 문서 형식은 실행 취소/다시 실행을 아직 지원하지 않습니다.');
});
test('changed false 이력은 기존 안내를 보존하고 완료 문구를 만들지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.direct.requestHistory('undo');
  f.ack({ noop: true });
  f.frame();
  await tick();
  assert(f.direct.settled());
  assert.equal(f.currentNote(), '이동할 편집 이력이 없습니다.');
});
test('close 뒤 늦은 frame은 완료 안내를 게시하지 않는다', async (t) => {
  const f = fixture(t, 'ABCD', 2);
  f.formatRange();
  f.frame();
  await tick();
  f.clearCoreHistorySelection();
  f.direct.requestHistory('undo');
  f.ack();
  await tick();
  f.direct.close();
  f.frame();
  await tick();
  assert.equal(f.currentNote(), '');
});
