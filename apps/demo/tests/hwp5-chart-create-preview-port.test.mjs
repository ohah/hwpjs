import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwp5ChartCreatePreviewPort } from '../src/hwp5-chart-create-preview-port.ts';
import * as core from '../../../packages/core/src/commands/inline-object-insert.ts';
import { HWP5_CHART_CREATE_PROFILE as profile } from '../../../js/hwp5-chart-create.mjs';
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
  const capture = Object.freeze({ state, kind: 'chart' }),
    reads = [];
  let fresh = true,
    reply = async () => ({ kind: 'hwp5-chart-create-preview', preview: new Uint8Array([1, 2]) });
  const editor = {
    getEditorState: () => state,
    readResource(request, options) {
      reads.push({ request, options });
      return reply();
    },
    dispatchCommand() {
      assert.fail('Preview must not edit');
    },
  };
  let render = async (w, p, current) => {
    assert.equal(current(), true);
    return {
      schemaVersion: 1,
      scope: 'hwp5-chart-create-preview-payload',
      executionAuthority: false,
      source_xml_sha256: Array(32).fill(7),
      rendering: 'hwpjs-preview-approximation',
      warnings: [],
      pixel_width: p.width,
      pixel_height: p.height,
      mime: 'image/png',
      bytes: new Uint8Array([9]),
    };
  };
  const port = createHwp5ChartCreatePreviewPort({
    editor,
    core,
    isCaptureCurrent: (c) => c === capture && fresh,
    render: (...a) => render(...a),
  });
  return {
    port,
    capture,
    state,
    row,
    reference,
    reads,
    stale: () => {
      fresh = false;
    },
    replace: () => {
      state = { ...state, documentId: 'other' };
    },
    reply: (fn) => {
      reply = fn;
    },
    render: (fn) => {
      render = fn;
    },
  };
}
const draft = () => ({
  width: 20001,
  height: 12000,
  categories: ['A', 'B', 'C'],
  series: [{ name: 'values', values: [10, 20, 40] }],
});
test('SDK readonly helper owns reference/unit mapping; UI keeps exact capture and never hands off PNG', async () => {
  const f = fixture(),
    out = await f.port.prepare(f.capture, draft(), profile),
    r = f.reads[0];
  assert.equal(r.request.kind, 'hwp5-chart-create-preview');
  assert.equal(r.request.request.reference, f.reference);
  assert.equal(r.request.request.start, 16);
  assert.deepEqual(r.options, { token: f.state.token });
  assert.deepEqual(r.request.request.preview, { width: 267, height: 160 });
  assert.equal(r.request.request.width, 20001);
  assert.equal('png' in r.request.request, false);
  const taken = f.port.take(out);
  assert.equal(taken.capture, f.capture);
  assert.equal(taken.options.profile, profile);
  assert.equal('preview' in taken.options, true);
  assert.equal(taken.options.preview.width, 267);
  assert.equal('bytes' in taken, false);
  assert.equal('preview' in taken, false);
  assert.throws(() => f.port.take(out), /Stale/);
});
test('experimental profile must be explicit and HWPX family options cannot be silently discarded', async () => {
  const f = fixture();
  await assert.rejects(f.port.prepare(f.capture, draft(), undefined), /Profile/);
  await assert.rejects(
    f.port.prepare(
      f.capture,
      { ...draft(), chart: { kind: 'barChart', bar_direction: 'col', grouping: 'clustered' } },
      profile,
    ),
    /Profile/,
  );
  assert.equal(f.reads.length, 0);
});
for (const [name, mutate] of [
  [
    'capability',
    (f) => {
      f.state.content.chartCreationAvailable = false;
    },
  ],
  [
    'profile',
    (f) => {
      f.state.content.hwp5ChartCreateProfileVersion = 0;
    },
  ],
  [
    'history',
    (f) => {
      f.state.nativeHistoryStats.protocolVersion = 1;
    },
  ],
  [
    'readonly',
    (f) => {
      f.state.content.readOnly = true;
    },
  ],
  [
    'range',
    (f) => {
      f.state.selection = { ...f.state.selection, endUnit: 3 };
    },
  ],
  [
    'reference',
    (f) => {
      delete f.row.currentReference;
    },
  ],
  [
    'table',
    (f) => {
      f.row.tableCell = {};
    },
  ],
  [
    'format',
    (f) => {
      f.state.content.format = 'hwpx';
    },
  ],
])
  test('unsupported ' + name + ' cannot enter preview', async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.port.prepare(f.capture, draft(), profile));
    assert.equal(f.reads.length, 0);
  });
test('fresh caret owner loss while reading discards DTO before raster', async () => {
  const f = fixture();
  let release,
    painted = 0;
  f.reply(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  f.render(async () => {
    painted++;
  });
  const pending = f.port.prepare(f.capture, draft(), profile);
  f.stale();
  release({ kind: 'hwp5-chart-create-preview', preview: new Uint8Array([1]) });
  await assert.rejects(pending, /Stale/);
  assert.equal(painted, 0);
});
test('replacement/dispose after raster invalidates handoff', async () => {
  const f = fixture(),
    out = await f.port.prepare(f.capture, draft(), profile);
  f.replace();
  assert.equal(f.port.current(out), false);
  assert.throws(() => f.port.take(out), /Stale/);
  const g = fixture(),
    other = await g.port.prepare(g.capture, draft(), profile);
  g.port.dispose();
  assert.throws(() => g.port.take(other), /Stale/);
});
test('wrong resource kind or public error is never treated as preview bytes', async () => {
  for (const value of [
    { kind: 'chart-display', preview: new Uint8Array([1]) },
    { kind: 'hwp5-chart-create-preview', error: 'NoPreview', preview: new Uint8Array([1]) },
    { kind: 'hwp5-chart-create-preview', preview: [1] },
  ]) {
    const f = fixture();
    f.reply(async () => value);
    await assert.rejects(f.port.prepare(f.capture, draft(), profile), /Preview/);
  }
});
