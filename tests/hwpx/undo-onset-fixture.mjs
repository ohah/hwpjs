import { caretGeometry } from '../../web/preview/text-geometry.mjs';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
import {
  historySelectionStamp,
  sameHistoryPaintStamp,
} from '../../web/preview/history-paint-authority.mjs';
export const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const point = (unit) => ({ section: 0, paragraph: 0, unit });
export function fixture(t, initial = 'AB', unit = 1, modelPort = true, onsetPort = false) {
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
  let previewCalls = 0,
    stageCalls = 0,
    stageHook = null;
  let clearDraftCalls = 0,
    layoutReads = 0,
    modelState = null,
    layoutReadHook = null;
  const renderer = {
    stageQueuedTypingPreview(value) {
      stageCalls++;
      if (stageHook) return stageHook(value);
      return true;
    },
    characterPropertyTextAvailable: () => true,
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
      previewCalls++;
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
    deferQueuedTypingProjection: onsetPort
      ? (draft) => renderer.stageQueuedTypingPreview(draft)
      : null,
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
      if (['splice', 'splice-character-properties'].includes(request.kind)) {
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
      changed:
        !error &&
        !noop &&
        (['splice', 'splice-character-properties'].includes(request.kind) || cursor !== before),
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
    previews: () => previewCalls,
    stages: () => stageCalls,
    stageHook(fn) {
      stageHook = fn;
    },
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
