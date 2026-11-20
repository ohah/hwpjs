import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { createRenderer } from '../../web/preview/renderer.mjs';
import { prepareCreatedCellTypingTarget } from '../../web/preview/created-cell-typing-admission.mjs';

// Real direct-input and renderer; simulated DOM and controlled host ACKs.
// This source regression does not execute Native or prove browser/OS input.
function original(format) {
  return {
    format,
    limited: false,
    createdCellTypingScope: 7,
    richTypingScope: 7,
    characterShapes: [{ id: 0, height: 1000, bold: false, italic: false }],
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: '',
        editable: true,
        plainEditable: true,
        selectionOwner: 'section:0:body',
      },
    ],
    createdTables: [
      {
        section: 0,
        identity: '9007199254740993',
        instance_id: 17,
        hostParagraph: 0,
        anchorUnit: 0,
        rows: 1,
        columns: 1,
        width: 18000,
        height: 1800,
        resources: { character: 0, paragraph: 0, style: 0, border_fill: 1 },
        cells: [
          {
            paragraph_id: 100,
            row: 0,
            column: 0,
            x: 0,
            y: 0,
            width: 18000,
            height: 1800,
            text: '',
            currentReference: {
              kind: 'cell',
              section: 0,
              id: '9007199254740993',
              row: 0,
              column: 0,
              scope: 'controlled-native',
              epoch: '1',
            },
            character_runs: [{ start_unit: 0, char_shape_id: 0 }],
          },
        ],
      },
    ],
  };
}
function harness(t, format = 'hwp5') {
  const doc = {
    activeElement: null,
    visibilityState: 'visible',
    defaultView: { AbortController, navigator: { platform: 'MacIntel' } },
  };
  class Node extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    attributes = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    clientWidth = 1280;
    clientHeight = 800;
    scrollTop = 0;
    scrollLeft = 0;
    setAttribute(k, v) {
      this.attributes[k] = v;
    }
    removeAttribute(k) {
      delete this.attributes[k];
    }
    setSelectionRange(a, b, direction = 'forward') {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = direction;
    }
    getRootNode() {
      return doc;
    }
    focus() {
      doc.activeElement = this;
    }
    blur() {
      if (doc.activeElement === this) doc.activeElement = null;
    }
    scrollIntoView() {}
    setPointerCapture() {}
    hasPointerCapture() {
      return false;
    }
    releasePointerCapture() {}
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: this.clientWidth,
        bottom: this.clientHeight,
        x: 0,
        y: 0,
        width: parseFloat(this.style.width) || this.clientWidth,
        height: parseFloat(this.style.height) || this.clientHeight,
      };
    }
  }
  const canvas = new Node(),
    input = new Node(),
    viewport = new Node(),
    frames = [],
    drafts = [],
    requests = [],
    waiting = [];
  let onPreview = null;
  const context = new Proxy(
    {
      measureText: (text) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  canvas.getContext = () => context;
  const environment = {
    ownerDocument: doc,
    activeElement: () => doc.activeElement,
    AbortController,
    requestFrame: (callback) => (frames.push(callback), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
  };
  const renderer = createRenderer(canvas, viewport, { style: {} }, () => {}, environment);
  const preview = renderer.preview;
  renderer.preview = (value) => {
    drafts.push(value);
    const notify = onPreview;
    onPreview = null;
    const result = preview(value);
    notify?.();
    return result;
  };
  let content = original(format),
    busy = false,
    revision = 0,
    operation = 0,
    cursor = 0,
    nextRevision = 0,
    state;
  const body = content.createdTables[0].cells[0];
  const owner = {
    section: 0,
    createdCell: { identity: content.createdTables[0].identity, row: 0, column: 0 },
  };
  const history = [{ revision: 0, text: body.text }];
  const direct = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    note: { textContent: '' },
    environment,
    controls: {
      ready: () => true,
      busy: () => busy,
      request: (request) => {
        requests.push(request);
        waiting.push(request);
        busy = true;
        return true;
      },
    },
  });
  t.after(() => {
    direct.close();
    renderer.close();
  });
  function show() {
    state = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: operation,
      viewRevision: 0,
      stateVersion: operation + 1,
      status: 'ready',
      nativeHistoryRevision: revision,
      content,
    };
    renderer.show(content, {
      sourceState: state,
      resourceDocument: 'd:1',
      resourceEpoch: `d:1:${operation}`,
      preserveScroll: true,
    });
  }
  function paint() {
    let n = 0;
    while (frames.length) {
      assert(++n < 50);
      frames.shift()();
    }
  }
  function fire(type, values = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, values);
    input.dispatchEvent(event);
    return event;
  }
  function type(text, values = {}) {
    const event = fire('beforeinput', { inputType: 'insertText', data: text, ...values });
    if (!event.defaultPrevented) {
      const a = input.selectionStart,
        b = input.selectionEnd;
      input.value = input.value.slice(0, a) + text + input.value.slice(b);
      input.setSelectionRange(a + text.length, a + text.length);
      fire('input', { inputType: 'insertText', data: text, ...values });
    }
    return event;
  }
  function ack(options = {}) {
    const request = waiting.shift();
    assert(request, 'a real controller request must precede its controlled ACK');
    if (request.kind === 'created-cell-splice') {
      // Actual shared admission validator, controlled Native canonical source.
      prepareCreatedCellTypingTarget({
        format,
        scope: content.createdCellTypingScope,
        message: request,
        editor: {
          supportsCreatedCellTypingAbi: () => true,
          historyRevision: () => revision,
          createdTables: () =>
            format === 'hwp5' ? [{ table: content.createdTables[0] }] : content.createdTables,
          currentText: (reference) => {
            assert.deepEqual(reference, content.createdTables[0].cells[0].currentReference);
            return content.createdTables[0].cells[0].text + '\r';
          },
        },
      });
    }
    if (options.reject) {
      busy = false;
      direct.message({
        ...request,
        applied: false,
        error: 'ControlledNativeDenied',
        historyRevision: revision,
        historyRevisions: history.map((e) => e.revision),
      });
      return request;
    }
    operation++;
    content = structuredClone(content);
    const row = content.createdTables[0].cells[0];
    const beforeCursor = cursor;
    if (request.kind === 'undo') cursor = Math.max(0, cursor - 1);
    else if (request.kind === 'redo') cursor = Math.min(history.length - 1, cursor + 1);
    else {
      const text =
        options.modelText ??
        row.text.slice(0, request.startUnit) + request.text + row.text.slice(request.endUnit);
      history.splice(cursor + 1);
      history.push({ revision: ++nextRevision, text });
      cursor++;
    }
    revision = history[cursor].revision;
    row.text = history[cursor].text;
    row.currentReference = { ...row.currentReference, epoch: String(operation + 1) };
    show();
    busy = false;
    direct.message({
      ...request,
      applied: true,
      historyRevision: revision,
      historyRevisions: history.map((entry) => entry.revision),
      changed: request.kind === 'undo' || request.kind === 'redo' ? cursor !== beforeCursor : true,
      ...options.message,
    });
    return request;
  }
  show();
  paint();
  direct.initializeCapabilities({
    historyAvailable: true,
    historyRevision: 0,
    historyRevisions: [0],
  });
  // Use the actual controller pointer path for logical cells. selectTextRange
  // is intentionally a source-paragraph API and must not fabricate a cell.
  const cellRow = renderer.layout().rows.find((r) => r.createdCell && r.kind === 'text');
  assert(cellRow, 'authored canonical cell must have actual renderer geometry');
  const values = {
    button: 0,
    pointerId: 1,
    clientX: cellRow.x + 1,
    clientY: cellRow.y + cellRow.height / 2,
  };
  for (const kind of ['pointerdown', 'pointerup']) {
    const event = new Event(kind, { cancelable: true });
    Object.assign(event, values);
    canvas.dispatchEvent(event);
  }
  assert.equal(doc.activeElement, input, 'actual cell pointer route must focus input');
  paint();
  return {
    renderer,
    direct,
    onPreview(callback) {
      onPreview = callback;
    },
    replaceNativeOwner() {
      content.createdCellTypingScope = 8;
      content.createdTables[0].identity = '9';
      content.createdTables[0].cells[0].paragraph_id = 101;
    },
    input,
    canvas,
    drafts,
    requests,
    waiting,
    owner,
    type,
    fire,
    ack,
    rejectAdmission(expected) {
      const request = waiting[0];
      assert(request, 'an actual controller request must precede the guard failure');
      let failure;
      try {
        ack();
      } catch (error) {
        failure = error;
      }
      assert(failure, 'guard unexpectedly allowed the corrupted request');
      assert.match(failure.message, expected);
      busy = false;
      // Same unapplied completion as a pre-mutation admission exception in the
      // real runtime. No Native state is rewound or invented by this helper.
      direct.message({
        ...request,
        applied: false,
        error: failure.message,
        historyRevision: revision,
        historyRevisions: history.map((e) => e.revision),
      });
      return request;
    },
    paint,
    get content() {
      return content;
    },
    get state() {
      return state;
    },
  };
}

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} queued cell input publishes ACK revision before next request`, (t) => {
    const h = harness(t, format);
    for (const c of 'GUI5') h.type(c);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].kind, 'created-cell-splice');
    while (h.waiting.length) h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GUI5');
    assert.equal(h.input.value, 'GUI5');
    assert.deepEqual(
      h.requests.map((r) => r.expectedHistoryRevision),
      h.requests.map((_, i) => i),
    );
    assert.equal(h.requests.map((r) => r.text).join(''), 'GUI5');
  });

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} reentrant preview input sees semantic ACK revision`, (t) => {
    const h = harness(t, format);
    h.type('G');
    h.onPreview(() => h.type('U'));
    h.ack();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].expectedHistoryRevision, 1);
    h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GU');
  });
for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} rejected ACK never retries or commits queued text`, (t) => {
    const h = harness(t, format);
    for (const c of 'GUI5') h.type(c);
    h.ack({ reject: true });
    assert.equal(h.content.createdTables[0].cells[0].text, '');
    assert.equal(h.requests.length, 1);
    assert.equal(h.waiting.length, 0);
    assert.equal(h.input.value, '');
  });
for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} burst then history restoration keeps next revision`, async (t) => {
    const h = harness(t, format);
    for (const c of 'GUI5') h.type(c);
    while (h.waiting.length) h.ack();
    h.paint();
    h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true });
    assert.equal(h.waiting[0]?.kind, 'undo');
    h.ack();
    h.paint();
    await Promise.resolve();
    h.paint();
    h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true });
    assert.equal(h.waiting[0]?.kind, 'redo');
    h.ack();
    h.paint();
    await Promise.resolve();
    h.paint();
    h.type('D');
    assert.equal(h.waiting[0]?.kind, 'created-cell-splice');
    assert.equal(h.waiting[0].expectedHistoryRevision, 4);
    h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GUI5D');
  });
for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} committed IME text after pending key uses fresh ACK binding`, async (t) => {
    const h = harness(t, format);
    h.type('G');
    h.fire('compositionstart', { data: '' });
    h.input.value = 'G한';
    h.input.setSelectionRange(2, 2);
    h.fire('input', { inputType: 'insertCompositionText', data: '한', isComposing: true });
    h.ack();
    h.fire('compositionend', { data: '한' });
    await Promise.resolve();
    while (h.waiting.length) h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'G한');
    assert.equal(h.input.value, 'G한');
    assert.deepEqual(
      h.requests.map((r) => r.expectedHistoryRevision),
      [0, 1],
    );
  });

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} late rejection preserves the prior commit and drops remaining queued text`, (t) => {
    const h = harness(t, format);
    for (const c of 'GUI5') h.type(c);
    h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'G');
    assert.equal(h.waiting[0].expectedHistoryRevision, 1);
    h.ack({ reject: true });
    assert.equal(h.content.createdTables[0].cells[0].text, 'G');
    assert.equal(h.requests.length, 2);
    assert.equal(h.waiting.length, 0);
    assert.equal(h.input.value, 'G');
  });
for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} a foreign Native owner cannot accept an old queued request`, (t) => {
    const h = harness(t, format);
    h.type('G');
    h.replaceNativeOwner();
    assert.throws(() => h.ack(), /StaleCreatedCellTypingBinding/);
    assert.equal(h.content.createdTables[0].identity, '9');
    assert.equal(h.content.createdTables[0].cells[0].text, '');
    assert.equal(h.requests.length, 1);
  });

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} nested full ACK keeps latest binding for following D`, (t) => {
    const h = harness(t, format);
    h.type('G');
    h.onPreview(() => {
      h.type('U');
      h.ack();
    });
    h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GU');
    assert.equal(h.requests[1].expectedHistoryRevision, 1);
    assert.equal(h.input.selectionStart, 2);
    assert.equal(h.input.selectionEnd, 2);
    h.type('D');
    assert.equal(h.waiting[0].expectedHistoryRevision, 2);
    h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GUD');
    assert.equal(h.input.value, 'GUD');
    assert.equal(h.input.selectionStart, 3);
    assert.equal(h.input.selectionEnd, 3);
  });
for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} nested ACK history allows revision decrease and valid caret restoration`, async (t) => {
    const h = harness(t, format);
    h.type('G');
    h.onPreview(() => {
      h.type('U');
      h.ack();
    });
    h.ack();
    h.paint();
    h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true });
    assert.equal(h.waiting[0]?.kind, 'undo');
    h.ack();
    h.paint();
    await Promise.resolve();
    h.paint();
    assert.equal(h.content.createdTables[0].cells[0].text, 'G');
    assert.equal(h.input.value, 'G');
    assert.equal(h.input.selectionStart, 1);
    assert.equal(h.input.selectionEnd, 1);
    // Revision 1 is now the actual Native undo revision; numeric max(2,1) is invalid.
    h.type('X');
    assert.equal(h.waiting[0]?.expectedHistoryRevision, 1);
    h.ack();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GX');
    h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true });
    h.ack();
    h.paint();
    await Promise.resolve();
    h.paint();
    h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true });
    h.ack();
    h.paint();
    await Promise.resolve();
    h.paint();
    assert.equal(h.content.createdTables[0].cells[0].text, 'GX');
    assert.equal(h.input.value, 'GX');
    assert.equal(h.input.selectionStart, 2);
    assert.equal(h.input.selectionEnd, 2);
  });

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} queued draft caret never replaces a canonical ACK bookmark`, async (t) => {
    const h = harness(t, format);
    for (const c of 'GUI5') h.type(c);
    assert.equal(h.input.selectionStart, 4);
    while (h.waiting.length) h.ack();
    h.paint();
    for (const expected of ['GUI', 'GU', 'G']) {
      h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true });
      assert.equal(h.waiting[0]?.kind, 'undo');
      h.ack();
      h.paint();
      await Promise.resolve();
      h.paint();
      assert.equal(h.content.createdTables[0].cells[0].text, expected);
      assert.equal(h.input.value, expected);
      assert.equal(h.input.selectionStart, expected.length);
      assert.equal(h.input.selectionEnd, expected.length);
    }
    h.type('D');
    assert.equal(h.waiting[0]?.expectedHistoryRevision, 1);
    h.ack();
    assert.equal(h.input.value, 'GD');
  });

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} nested GU exactly two undo and two redo acknowledge canonical caret0/1/2`, async (t) => {
    const h = harness(t, format);
    const check = (text, revision, unit) => {
      assert.equal(h.content.createdTables[0].cells[0].text, text);
      assert.equal(h.state.nativeHistoryRevision, revision);
      assert.equal(h.input.value, text);
      assert.equal(h.input.selectionStart, unit);
      assert.equal(h.input.selectionEnd, unit);
      assert(unit >= 0 && unit <= text.length);
    };
    check('', 0, 0);
    h.type('G');
    assert.equal(h.requests[0].expectedHistoryRevision, 0);
    h.onPreview(() => {
      h.type('U');
      assert.equal(h.waiting[0].kind, 'created-cell-splice');
      assert.equal(h.waiting[0].expectedHistoryRevision, 1);
      h.ack();
    });
    h.ack();
    h.paint();
    check('GU', 2, 2);
    const steps = [
      { kind: 'undo', before: 'GU', beforeRevision: 2, text: 'G', revision: 1, caret: 1 },
      { kind: 'undo', before: 'G', beforeRevision: 1, text: '', revision: 0, caret: 0 },
      { kind: 'redo', before: '', beforeRevision: 0, text: 'G', revision: 1, caret: 1 },
      { kind: 'redo', before: 'G', beforeRevision: 1, text: 'GU', revision: 2, caret: 2 },
    ];
    for (const [index, step] of steps.entries()) {
      assert.equal(h.waiting.length, 0);
      h.fire('keydown', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: step.kind === 'redo' });
      assert.equal(h.requests.length, 3 + index, 'exactly one history request per step');
      assert.equal(h.waiting.length, 1);
      const request = h.waiting[0];
      assert.equal(request.kind, step.kind);
      assert.equal(
        h.state.nativeHistoryRevision,
        step.beforeRevision,
        'request alone cannot publish a revision',
      );
      assert.equal(h.content.createdTables[0].cells[0].text, step.before);
      assert.equal(h.ack(), request, 'ACK must correspond to that exact issued history request');
      h.paint();
      await Promise.resolve();
      h.paint();
      assert.equal(h.waiting.length, 0);
      check(step.text, step.revision, step.caret);
    }
    assert.deepEqual(
      h.requests.map((r) => r.kind),
      ['created-cell-splice', 'created-cell-splice', 'undo', 'undo', 'redo', 'redo'],
    );
  });

for (const format of ['hwp5', 'hwpx'])
  test(`controlled real Canvas ${format} UTF16 malformed requests reject before publication and valid scalar input continues`, (t) => {
    const h = harness(t, format);
    h.type('😀');
    h.ack();
    assert.equal(h.input.value, '😀');
    assert.equal(h.state.nativeHistoryRevision, 1);
    const rejectWithoutPublication = (corrupt, expected) => {
      const beforeState = h.state;
      const beforeCell = structuredClone(h.content.createdTables[0].cells[0]);
      const beforeRequests = h.requests.length;
      h.type('X');
      assert.equal(h.waiting.length, 1);
      assert.equal(h.requests.length, beforeRequests + 1);
      corrupt(h.waiting[0]); // Explicit wire-corruption negative, never an API success example.
      h.rejectAdmission(expected);
      assert.equal(
        h.state,
        beforeState,
        'unapplied guard failure must not publish a model revision',
      );
      assert.deepEqual(h.content.createdTables[0].cells[0], beforeCell);
      assert.equal(h.input.value, beforeCell.text);
      assert.equal(h.input.selectionStart, beforeCell.text.length);
      assert.equal(h.input.selectionEnd, beforeCell.text.length);
      assert.equal(h.waiting.length, 0);
      assert.equal(h.requests.length, beforeRequests + 1, 'no automatic mutation retry');
    };
    rejectWithoutPublication((request) => {
      request.startUnit = request.endUnit = 1;
    }, /InvalidTextPosition/);
    h.type('한');
    assert.equal(h.waiting[0].expectedHistoryRevision, 1);
    h.ack();
    assert.equal(h.input.value, '😀한');
    assert.equal(h.state.nativeHistoryRevision, 2);
    rejectWithoutPublication((request) => {
      request.text = '\ud83d';
    }, /InvalidUnicodeEncoding/);
    h.type('D');
    assert.equal(h.waiting[0].expectedHistoryRevision, 2);
    h.ack();
    assert.equal(h.input.value, '😀한D');
    assert.equal(h.content.createdTables[0].cells[0].text, '😀한D');
    assert.equal(h.state.nativeHistoryRevision, 3);
    assert.equal(h.input.selectionStart, 4);
    assert.equal(h.input.selectionEnd, 4);
    assert.equal(h.requests.length, 5);
  });
