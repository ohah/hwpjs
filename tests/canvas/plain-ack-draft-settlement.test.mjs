import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { createRenderer } from '../../web/preview/renderer.mjs';

// Real direct-input and renderer; simulated DOM and controlled host ACKs.
// This source regression does not execute Native or prove browser/OS input.
const original = JSON.parse(
  readFileSync(new URL('./fixtures/textbox-h5-public-observation.json', import.meta.url)),
);
function harness(t) {
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
    return preview(value);
  };
  let content = structuredClone(original),
    busy = false,
    revision = 0,
    operation = 0,
    cursor = 0,
    nextRevision = 0,
    state;
  const body = content.paragraphs.find((row) => row.drawingText);
  const owner = { section: body.section, paragraph: body.paragraph };
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
    operation++;
    content = structuredClone(content);
    const row = content.paragraphs.find(
      (row) => row.section === owner.section && row.paragraph === owner.paragraph,
    );
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
  assert(
    direct.selectTextRange({ ...owner, startUnit: body.text.length, endUnit: body.text.length }),
  );
  paint();
  return {
    renderer,
    direct,
    input,
    canvas,
    drafts,
    requests,
    waiting,
    owner,
    type,
    fire,
    ack,
    paint,
    get content() {
      return content;
    },
    get state() {
      return state;
    },
  };
}

test('ordinary acknowledged textbox splice retires its no-op draft and restores the current renderer scene', (t) => {
  const h = harness(t);
  h.type('p');
  assert.equal(h.requests[0].kind, 'splice');
  h.ack();
  assert.equal(h.input.value, '글상자p');
  assert.equal(
    h.drafts.at(-1),
    null,
    'acknowledged identical input must not retain a draft object',
  );
  h.paint();
  assert.equal(h.renderer.isPaintedFrameCurrent(), true);
  // This simulated host has no private Native placement proof. Do not fabricate
  // object-hit authority; ready Native hit is verified in the combined UI cohort.
  assert.equal(h.renderer.objectAtLogicalPoint(149.81333333333333 + 156.84 / 2, 169.84), null);
  assert.notEqual(h.renderer.getPageText(h.state, 0).reason, 'scene-not-current');
});

test('queued local text keeps its draft until the final corresponding ACK', (t) => {
  const h = harness(t);
  h.type('p');
  h.type('q');
  h.ack();
  assert.equal(h.input.value, '글상자pq');
  assert.notEqual(h.drafts.at(-1), null);
  assert.equal(h.requests.length, 2);
  h.ack();
  assert.equal(h.content.paragraphs.find((row) => row.drawingText).text, '글상자pq');
  assert.equal(h.drafts.at(-1), null);
});

test('composition preedit is not cleared by an earlier text ACK', (t) => {
  const h = harness(t);
  h.type('p');
  h.fire('compositionstart', { data: '' });
  h.type('ㄱ', { inputType: 'insertCompositionText', isComposing: true });
  const before = h.input.value,
    calls = h.drafts.length;
  h.ack();
  assert.equal(h.input.value, before);
  assert(!h.drafts.slice(calls).includes(null), 'an earlier ACK must not erase active preedit');
});

for (const [label, options] of [
  ['unapplied acknowledgement', { message: { applied: false } }],
  ['different source owner', { message: { paragraph: 999 } }],
  ['model has not acknowledged the requested text', { modelText: '글상자' }],
])
  test(`${label} does not retire the local draft`, (t) => {
    const h = harness(t);
    h.type('p');
    const before = h.drafts.length;
    h.ack(options);
    assert(!h.drafts.slice(before).includes(null));
  });

test('a reentrant newer acknowledgement cannot retire the older request draft', (t) => {
  const h = harness(t);
  h.type('p');
  const paragraph = h.renderer.paragraph;
  let once = true;
  h.renderer.paragraph = (point) => {
    const row = paragraph(point);
    if (once) {
      once = false;
      h.direct.message({ kind: 'save', origin: 'core' });
    }
    return row;
  };
  const before = h.drafts.length;
  h.ack();
  assert(!h.drafts.slice(before).includes(null));
});

test('queued history retains its original input/draft barrier after the text ACK', (t) => {
  const h = harness(t);
  h.type('p');
  assert.equal(h.direct.requestHistory('undo'), true);
  const before = h.drafts.length;
  h.ack();
  assert(!h.drafts.slice(before).includes(null));
  assert.equal(h.input.value, '글상자p');
});

test('typing properties retain the existing styled splice path across successive ACKs', (t) => {
  const h = harness(t);
  h.content.characterPropertyTextAvailable = true;
  assert.equal(h.direct.setCharacterProperties({ bold: true }), true);
  h.type('p');
  assert.equal(h.requests.at(-1).kind, 'splice-character-properties');
  assert.deepEqual(h.requests.at(-1).properties, { bold: true });
  h.ack();
  assert.notEqual(h.drafts.at(-1), null, 'this change must not alter styled ACK policy');
  h.type('q');
  assert.equal(h.requests.at(-1).kind, 'splice-character-properties');
  assert.deepEqual(h.requests.at(-1).properties, { bold: true });
  h.ack();
  assert.equal(h.input.value, '글상자pq');
});

for (const stage of ['draft retirement', 'selection sync', 'caret reveal'])
  test(`new local input during ${stage} is retained by the older ACK continuation`, (t) => {
    const h = harness(t);
    h.type('p');
    let armed = true;
    const enter = () => {
      if (armed) {
        armed = false;
        h.type('q');
      }
    };
    if (stage === 'draft retirement') {
      const preview = h.renderer.preview;
      h.renderer.preview = (value) => {
        const result = preview(value);
        if (value === null) enter();
        return result;
      };
    } else if (stage === 'selection sync') {
      const select = h.renderer.select;
      h.renderer.select = (...args) => {
        const result = select(...args);
        enter();
        return result;
      };
    } else h.input.scrollIntoView = enter;
    h.ack();
    assert.equal(armed, false, 'the continuation boundary must actually have been exercised');
    assert.equal(h.input.value, '글상자pq');
    assert.equal(h.requests.length, 2);
    assert.equal(h.drafts.at(-1).text, '글상자pq');
    assert.equal(h.direct.settled(), false);
    h.ack();
    assert.equal(h.content.paragraphs.find((row) => row.drawingText).text, '글상자pq');
    assert.equal(h.drafts.at(-1), null);
  });

test('a newer nested ACK keeps its formatting observation current after the older ACK finally', (t) => {
  const h = harness(t);
  h.type('p');
  const preview = h.renderer.preview;
  let armed = true,
    capture;
  h.renderer.preview = (value) => {
    const result = preview(value);
    if (value === null && armed) {
      armed = false;
      h.type('q');
      h.ack();
      capture = h.direct.captureCaretFormatting(
        () => true,
        () => true,
      );
      assert(capture);
      assert.equal(capture.current(), true, 'the newer ACK has completed');
    }
    return result;
  };
  h.ack();
  assert.equal(h.input.value, '글상자pq');
  assert.equal(h.content.paragraphs.find((row) => row.drawingText).text, '글상자pq');
  assert.equal(h.direct.settled(), true);
  assert.equal(
    capture.current(),
    true,
    'the older finally must not roll back the newer revision/bookmark',
  );
});

test('nested ordinary ACKs preserve native revision0/1/2 caret bookmarks through two undo and redo steps', async (t) => {
  const h = harness(t);
  h.type('p');
  const preview = h.renderer.preview;
  let armed = true;
  h.renderer.preview = (value) => {
    const result = preview(value);
    if (value === null && armed) {
      armed = false;
      h.type('q');
      h.ack();
    }
    return result;
  };
  h.ack();
  h.paint();
  assert.equal(h.input.value, '글상자pq');
  assert.equal(h.input.selectionStart, 5);
  for (const [kind, text, caret, nativeRevision] of [
    ['undo', '글상자p', 4, 1],
    ['undo', '글상자', 3, 0],
    ['redo', '글상자p', 4, 1],
    ['redo', '글상자pq', 5, 2],
  ]) {
    const beforeRequests = h.requests.length;
    assert.equal(h.direct.requestHistory(kind), true);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(h.requests.length, beforeRequests + 1, kind + ' request is actually submitted');
    assert.equal(h.requests.at(-1).kind, kind);
    assert.equal(h.waiting.length, 1);
    h.ack();
    h.paint();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    h.paint();
    assert.equal(
      h.content.paragraphs.find((row) => row.drawingText).text,
      text,
      kind + ' Native model',
    );
    assert.equal(h.input.value, text, kind + ' actual controller input');
    assert.equal(h.input.disabled, false, kind + ' restores an active owned caret');
    assert.equal(h.input.selectionStart, caret, kind + ' original revision caret');
    assert.equal(h.input.selectionEnd, caret);
    assert.equal(h.state.nativeHistoryRevision, nativeRevision);
    assert.equal(h.canvas.dataset.caret, `${h.owner.section}:${h.owner.paragraph}:${caret}`);
    assert.equal(h.canvas.dataset.paintedCaret, `${h.owner.section}:${h.owner.paragraph}:${caret}`);
    assert.equal(h.direct.settled(), true);
  }
});

test('an ACK without a confirmed history revision does not retire the draft', (t) => {
  const h = harness(t);
  h.type('p');
  const start = h.drafts.length;
  h.ack({ message: { historyRevision: undefined } });
  assert(!h.drafts.slice(start).includes(null));
});
