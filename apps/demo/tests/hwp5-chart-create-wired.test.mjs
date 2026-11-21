import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Document, Element, all, fire } from './fake-dom.mjs';
import * as core from '../../../packages/core/src/commands/inline-object-insert.ts';
import {
  HWP5_CHART_CREATE_PROFILE as profile,
  HWP5_LINE_CHART_CREATE_PROFILE as lineProfile,
  HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE as horizontalProfile,
} from '../../../js/hwp5-chart-create-profiles.mjs';
import { model, context } from '../../../tests/hwpx/chart-family-model.mjs';
const hook = registerHooks({
  load(url, ctx, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: 'export {};', shortCircuit: true }
      : next(url, ctx);
  },
});
const { createInlineObjectInsertTool } = await import('../src/inline-object-insert-tool.ts');
hook.deregister();
function fixture() {
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
  };
  const reference = Object.freeze({
    scope: 'editor:1',
    epoch: '9',
    kind: 'original',
    section: 0,
    id: '4',
    row: 0,
    column: 0,
  });
  const row = {
    section: 0,
    paragraph: 0,
    text: '\ufffc\ufffchello',
    editable: true,
    plainEditable: true,
    selectionOwner: 'section:0:body',
    currentReference: reference,
    sourceOffsets: [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
      { at: 2, source: 16 },
    ],
  };
  const target = {
    ...token,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 2,
    endUnit: 2,
    affinity: 'forward',
  };
  let state = {
    ...token,
    token,
    stateVersion: 7,
    status: 'ready',
    nativeHistoryRevision: 5,
    nativeHistoryStats: { protocolVersion: 2 },
    selection: target,
    content: {
      format: 'hwp5',
      paragraphs: [row],
      chartCreationAvailable: true,
      hwp5ChartCreateProfileVersion: 1,
    },
    capabilities: {},
  };
  const doc = new Document(),
    create = doc.createElement.bind(doc),
    urls = [],
    revoked = [],
    canvases = [];
  class Canvas extends Element {
    constructor() {
      super('canvas', doc);
      canvases.push(this);
      this.recording = context();
    }
    getContext() {
      return this.recording.ctx;
    }
    async convertToBlob() {
      if (encoderGate) await encoderGate;
      const b = new Uint8Array(33);
      b.set([137, 80, 78, 71, 13, 10, 26, 10]);
      b.set(new TextEncoder().encode('IHDR'), 12);
      const v = new DataView(b.buffer);
      v.setUint32(8, 13);
      v.setUint32(16, this.width);
      v.setUint32(20, this.height);
      return new Blob([b], { type: 'image/png' });
    }
  }
  doc.defaultView = {
    HTMLCanvasElement: Canvas,
    URL: {
      createObjectURL() {
        const u = 'blob:test:' + urls.length;
        urls.push(u);
        return u;
      },
      revokeObjectURL(u) {
        revoked.push(u);
      },
    },
  };
  doc.createElement = (tag) => {
    const n = tag === 'canvas' ? new Canvas() : create(tag);
    Object.assign(n, {
      showModal() {
        n.open = true;
      },
      close() {
        n.open = false;
      },
      insertBefore(child, before) {
        if (!before) n.append(child);
        else {
          child.remove();
          child.parentElement = n;
          n.children.splice(n.children.indexOf(before), 0, child);
        }
        return child;
      },
    });
    return n;
  };
  const root = doc.createElement('main');
  root.querySelector = () => all(root, (n) => n.tagName === 'DIALOG' && n.open)[0] ?? null;
  const listeners = new Set(),
    reads = [],
    writes = [],
    statuses = [];
  let focused = 0,
    caretLive = true,
    encoderGate,
    readImpl = async () => ({ kind: 'hwp5-chart-create-preview', preview: wire() }),
    writeImpl = async () => ({ status: 'committed-with-snapshot' });
  function wire(kind = 'barChart') {
    const data = model(kind, [[10, 20, 30]]);
    delete data.pair;
    delete data.host;
    if (kind === 'barChart') data.plot_settings[0].direction = { node: 4, value: 'col' };
    data.plot_settings[0].grouping = {
      node: 5,
      value: kind === 'barChart' ? 'clustered' : 'standard',
    };
    return new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        scope: 'hwp5-chart-create-preview',
        executionAuthority: false,
        xml_sha256: Array(32).fill(7),
        data,
      }),
    );
  }
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    readResource(m, o) {
      reads.push({ message: m, options: o });
      return readImpl();
    },
    dispatchCommand(command, payload) {
      const captured = core.captureInlineObjectInsertPayload(payload, 'chart'),
        message = core.inlineObjectInsertMessage(captured, state, 'chart');
      writes.push({ command, payload: captured, message });
      return writeImpl();
    },
  };
  function captureCaret() {
    if (root.querySelector() || !caretLive) return null;
    const saved = state;
    return {
      state: saved,
      selector: { section: 0, paragraph: 1 },
      unit: saved.selection.startUnit,
      affinity: 'forward',
      expected_text: row.text,
      current: () => caretLive && state === saved,
    };
  }
  const tool = createInlineObjectInsertTool({
    root,
    editor,
    core,
    captureCaret,
    onStatus: (s) => statuses.push(s),
    onClose: () => focused++,
  });
  const nodes = () => all(root, () => true),
    named = (label) => nodes().find((n) => n.getAttribute('aria-label') === label),
    button = (text) => nodes().find((n) => n.tagName === 'BUTTON' && n.textContent === text),
    form = () => nodes().find((n) => n.tagName === 'FORM');
  const choose = (selected = profile) => {
    const n = named('HWP5 차트 생성 방식');
    assert.ok(n);
    n.value = selected;
    fire(n, 'change');
  };
  const replace = () => {
    const next = { ...token, documentId: 'other', generation: 2 };
    state = {
      ...state,
      ...next,
      token: next,
      selection: { ...target, ...next },
      content: { ...state.content },
    };
    for (const fn of listeners) fn();
  };
  return {
    tool,
    root,
    doc,
    row,
    reference,
    reads,
    writes,
    statuses,
    urls,
    revoked,
    canvases,
    choose,
    button,
    named,
    form,
    state: () => state,
    replace,
    stale: () => {
      caretLive = false;
    },
    emit: () => {
      for (const fn of listeners) fn();
    },
    read: (fn) => {
      readImpl = fn;
    },
    write: (fn) => {
      writeImpl = fn;
    },
    wire,
    encoder: (p) => {
      encoderGate = p;
    },
    focused: () => focused,
    listeners,
  };
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};
async function open(f) {
  assert.equal(f.tool.presentation('chart').enabled, true);
  f.tool.open('chart');
  await settle();
  assert.ok(f.form());
}
test('H5 menu uses real capability/current caret; explicit profile and current reference create with no PNG', async () => {
  const f = fixture();
  await open(f);
  assert.equal(f.button('차트 만들기').disabled, true);
  fire(f.form(), 'submit');
  await settle();
  assert.equal(f.writes.length, 0);
  f.choose();
  assert.equal(f.button('차트 만들기').disabled, false);
  fire(f.form(), 'submit');
  await settle();
  assert.equal(f.writes.length, 1);
  const m = f.writes[0].message;
  assert.equal(m.request.reference, f.reference);
  assert.equal(m.request.start, 16);
  assert.equal(m.request.profile, profile);
  assert.deepEqual(m.request.preview, { width: 267, height: 160 });
  assert.equal('png' in m.request, false);
  assert.equal('bytes' in m.request, false);
  assert.equal(f.focused(), 1);
  f.tool.dispose();
});
for (const name of ['capability', 'profile', 'readonly', 'history', 'caret', 'reference'])
  test('H5 menu denies missing ' + name, () => {
    const f = fixture();
    if (name === 'capability') f.state().content.chartCreationAvailable = false;
    if (name === 'profile') f.state().content.hwp5ChartCreateProfileVersion = 0;
    if (name === 'readonly') f.state().content.readOnly = true;
    if (name === 'history') f.state().nativeHistoryStats.protocolVersion = 1;
    if (name === 'caret') f.stale();
    if (name === 'reference') delete f.row.currentReference;
    assert.equal(f.tool.presentation('chart').enabled, false);
    f.tool.open('chart');
    assert.equal(f.writes.length, 0);
    f.tool.dispose();
  });
test('readonly preview calls actual Core helper and shared converter/provider; PNG stays in view', async () => {
  const f = fixture();
  await open(f);
  f.choose();
  fire(f.button('미리보기'), 'click');
  await settle();
  assert.equal(f.reads.length, 1);
  assert.equal(f.reads[0].message.kind, 'hwp5-chart-create-preview');
  assert.equal(f.reads[0].message.request.reference, f.reference);
  assert.deepEqual(f.reads[0].options, { token: f.state().token });
  assert.equal(f.urls.length, 1);
  assert.ok(f.canvases[0].recording.calls.filter((x) => x[0] === 'fillRect').length >= 3);
  assert.equal(f.canvases[0].width, 0);
  assert.equal(f.writes.length, 0);
  fire(f.form(), 'submit');
  await settle();
  assert.equal(f.writes.length, 1);
  assert.equal('bytes' in f.writes[0].message.request, false);
  assert.equal(f.revoked.length, 1);
  f.tool.dispose();
});
test('generation replacement during preview drops late result and never repaints the new document', async () => {
  const f = fixture();
  let release;
  f.read(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  await open(f);
  f.choose();
  fire(f.button('미리보기'), 'click');
  await settle();
  f.replace();
  release({ kind: 'hwp5-chart-create-preview', preview: f.wire() });
  await settle();
  assert.equal(f.form(), undefined);
  assert.equal(f.urls.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.focused(), 0);
  f.tool.dispose();
});
test('cancel while actual converter encode is pending discards PNG and clears resources', async () => {
  const f = fixture();
  let release;
  f.encoder(
    new Promise((r) => {
      release = r;
    }),
  );
  await open(f);
  f.choose();
  fire(f.button('미리보기'), 'click');
  await settle();
  assert.equal(f.button('취소').disabled, false);
  fire(f.button('취소'), 'click');
  release();
  await settle();
  assert.equal(f.urls.length, 0);
  assert.equal(f.canvases[0].width, 0);
  assert.equal(f.writes.length, 0);
  f.tool.dispose();
});
test('caret loss during preview disables stale submit and cannot be bypassed by form event', async () => {
  const f = fixture();
  let release;
  f.read(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  await open(f);
  f.choose();
  fire(f.button('미리보기'), 'click');
  f.stale();
  f.emit();
  release({ kind: 'hwp5-chart-create-preview', preview: f.wire() });
  await settle();
  assert.equal(f.button('차트 만들기').disabled, true);
  fire(f.form(), 'submit');
  await settle();
  assert.equal(f.writes.length, 0);
  f.tool.dispose();
});
test('generation replacement during create suppresses old completion status and focus', async () => {
  const f = fixture();
  let release;
  f.write(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  await open(f);
  f.choose();
  fire(f.form(), 'submit');
  await settle();
  f.replace();
  release({ status: 'committed-with-snapshot' });
  await settle();
  assert.equal(f.form(), undefined);
  assert.deepEqual(f.statuses, []);
  assert.equal(f.focused(), 0);
  assert.equal(f.writes.length, 1);
  f.tool.dispose();
});
test('dispose while preview pending removes subscriptions and rejects late UI work', async () => {
  const f = fixture();
  let release;
  f.read(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  await open(f);
  f.choose();
  fire(f.button('미리보기'), 'click');
  await settle();
  f.tool.dispose();
  release({ kind: 'hwp5-chart-create-preview', preview: f.wire() });
  await settle();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.form(), undefined);
  assert.equal(f.urls.length, 0);
  assert.equal(f.writes.length, 0);
});

test('v2 HWP5 dialog offers line and retains its profile through preview and insert', async () => {
  const f = fixture();
  f.state().content.hwp5ChartCreateProfileVersion = 2;
  f.read(async () => ({ kind: 'hwp5-chart-create-preview', preview: f.wire('lineChart') }));
  await open(f);
  const select = f.named('HWP5 차트 생성 방식');
  assert(select.children.some((option) => option.value === profile));
  assert(select.children.some((option) => option.value === lineProfile));
  f.choose(lineProfile);
  fire(f.button('미리보기'), 'click');
  await settle();
  assert.equal(f.reads[0].message.request.profile, lineProfile);
  assert.equal(f.urls.length, 1);
  assert.equal(f.writes.length, 0);
  fire(f.form(), 'submit');
  await settle();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].message.request.profile, lineProfile);
  assert.equal('png' in f.writes[0].message.request, false);
  assert.equal(f.revoked.length, 1);
  f.tool.dispose();
});
test('v1 HWP5 dialog refuses a manually assigned line profile before preview or insertion', async () => {
  const f = fixture();
  await open(f);
  const select = f.named('HWP5 차트 생성 방식');
  assert.equal(
    select.children.some((option) => option.value === lineProfile),
    false,
  );
  f.choose(lineProfile);
  assert.equal(f.button('미리보기').disabled, true);
  assert.equal(f.button('차트 만들기').disabled, true);
  fire(f.form(), 'submit');
  await settle();
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
  f.tool.dispose();
});

test('horizontal chart is only offered for engines that support it', async () => {
  for (const version of [1, 2, 3]) {
    const f = fixture();
    f.state().content.hwp5ChartCreateProfileVersion = version;
    await open(f);
    assert.equal(f.named('차트 종류'), undefined);
    const select = f.named('HWP5 차트 생성 방식');
    assert.equal(
      select.children.some((option) => option.value === horizontalProfile),
      version === 3,
    );
    f.choose(horizontalProfile);
    assert.equal(f.button('차트 만들기').disabled, version !== 3);
    f.tool.dispose();
  }
});
