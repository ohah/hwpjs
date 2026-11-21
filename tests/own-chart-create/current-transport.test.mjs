import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwp5CurrentReferenceApi } from '../../js/hwp5-current-references.mjs';
import {
  HWP5_CHART_CREATE_PROFILE as profile,
  checkedHwp5ChartCreateOptions,
} from '../../js/hwp5-chart-create.mjs';
import { model, context } from '../hwpx/chart-family-model.mjs';
import {
  HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE as horizontalProfile,
  HWP5_LINE_CHART_CREATE_PROFILE as lineProfile,
} from '../../js/hwp5-chart-create-profiles.mjs';
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const png = new Uint8Array(
  readFileSync(
    new URL('../../src/hwp5/chart/test_fixtures/create-transport-bars-64.png', import.meta.url),
  ),
);
const options = () => ({
  profile,
  width: 12000,
  height: 12000,
  categories: ['One', 'Two', 'Three'],
  series: [{ name: 'Own', values: [10, 20, 30] }],
  preview: { width: 64, height: 64 },
});
function harness({
  version = 1,
  authoringProfile = profile,
  previewKind = 'barChart',
  direction = 'col',
} = {}) {
  let next = 64,
    closed = false,
    epoch = '1',
    diagnostic = 'NativeRefused',
    calls = 0,
    applyCode = 1,
    cleanup = false,
    cleanupOnce = false;
  const allocated = new Map();
  let outputBytes;
  const release = (ptr) => {
    allocated.delete(ptr);
    if (cleanup && cleanupOnce) {
      cleanupOnce = false;
      throw Error('CleanupFault');
    }
  };
  const mem = {
    withBytes(bytes, action) {
      const ptr = next;
      next += bytes.length + 16;
      allocated.set(ptr, bytes.slice());
      try {
        return action(ptr, bytes.length);
      } finally {
        release(ptr);
      }
    },
    error: () => Error(diagnostic),
  };
  const parse = (ptr) => JSON.parse(decoder.decode(allocated.get(ptr)));
  const currentRef = { epoch, kind: 'original', section: 0, id: '0', row: 0, column: 0 };
  const display = model(previewKind, [[10, 20, 30]]);
  delete display.host;
  delete display.pair;
  if (previewKind === 'barChart')
    display.plot_settings[0].direction = { node: 4, value: direction };
  display.plot_settings[0].grouping = {
    node: 5,
    value: previewKind === 'barChart' ? 'clustered' : 'standard',
  };
  const wasm = {
    hwp5_edit_current_references(_section, _first, _count) {
      outputBytes = encoder.encode(
        JSON.stringify({ version: 1, total: 1, first: 0, references: [{ ...currentRef, epoch }] }),
      );
      return 1;
    },
    hwp5_edit_copy_current_text(ptr, _size) {
      if (parse(ptr).epoch !== epoch) {
        diagnostic = 'StaleCurrentReference';
        return 0;
      }
      outputBytes = new Uint8Array([13, 0]);
      return 1;
    },
    hwp5_edit_splice_current() {
      return 1;
    },
    hwp5_edit_chart_create_profile_version() {
      return version;
    },
    hwp5_edit_chart_create_preview(rp, rs, p, _n) {
      assert.equal(parse(rp).epoch, epoch);
      assert.equal(parse(p).profile, authoringProfile);
      outputBytes = encoder.encode(
        JSON.stringify({
          schemaVersion: 1,
          scope: 'hwp5-chart-create-preview',
          executionAuthority: false,
          xml_sha256: Array(32).fill(7),
          data: display,
        }),
      );
      return 1;
    },
    hwp5_edit_create_chart_current(rp, rs, p, n, ip, _ins) {
      calls++;
      assert.equal(parse(rp).epoch, epoch);
      const request = parse(p);
      assert.equal(request.profile, authoringProfile);
      assert.deepEqual(request.expected_text_utf16le, [13, 0]);
      assert.deepEqual(request.data.series[0].values, ['10', '20', '30']);
      assert.deepEqual(request.source_xml_sha256, Array(32).fill(7));
      assert.deepEqual(allocated.get(ip), png);
      cleanupOnce = true;
      return applyCode;
    },
  };
  const output = (action) => {
    if (action() !== 1) throw mem.error();
    return { bytes: outputBytes.slice() };
  };
  const api = createHwp5CurrentReferenceApi({
    wasm,
    memory: mem,
    check: () => {
      if (closed) throw Error('EditorClosed');
    },
    output,
    success: (n) => assert.equal(n, 1),
    u32: (n) => {
      assert.ok(Number.isInteger(n) && n >= 0);
      return n;
    },
    referenceScope: 'test',
  });
  const reference = api.currentReferences(0).references[0];
  const record = context();
  let canvases = 0;
  const renderer = {
    createCanvas() {
      canvases++;
      return {
        getContext: () => record.ctx,
        convertToBlob: async () => new Blob([png], { type: 'image/png' }),
      };
    },
    current: () => true,
  };
  return {
    api,
    wasm,
    reference,
    request: () => ({ reference, start: 0, ...options(), profile: authoringProfile }),
    renderer,
    record,
    allocated,
    calls: () => calls,
    canvases: () => canvases,
    bump: () => {
      epoch = String(BigInt(epoch) + 1n);
    },
    close: () => {
      closed = true;
    },
    code: (n) => {
      applyCode = n;
    },
    cleanup: () => {
      cleanup = true;
    },
    currentRef,
  };
}
test('scoped current creation calls actual shared painter and one atomic Native transport, then frees all buffers', async () => {
  const h = harness();
  const out = await h.api.createChart(h.request(), h.renderer);
  assert.equal(out.application, 'applied');
  assert.equal(out.nativeCode, 1);
  assert.equal(h.calls(), 1);
  assert.ok(h.record.calls.filter(([n]) => n === 'fillRect').length >= 3);
  assert.ok(out.chartPreviewWarnings.includes('SourceStylesNotApplied'));
  assert.equal(h.allocated.size, 0);
});
test('readonly preview returns Native values without canvas or create entry', () => {
  const h = harness();
  const wire = h.api.chartCreatePreview(h.request());
  assert.equal(JSON.parse(decoder.decode(wire)).executionAuthority, false);
  assert.equal(h.calls(), 0);
  assert.equal(h.canvases(), 0);
  assert.equal(h.allocated.size, 0);
});
test('older ABI, wrong arity and wrong profile never advertise or execute creation', async () => {
  for (const mutate of [
    (h) => {
      delete h.wasm.hwp5_edit_create_chart_current;
    },
    (h) => {
      h.wasm.hwp5_edit_create_chart_current = () => 1;
    },
    (h) => {
      h.wasm.hwp5_edit_chart_create_profile_version = () => 4;
    },
  ]) {
    const h = harness();
    mutate(h);
    assert.equal(h.api.supportsChartCreationAbi(), false);
    await assert.rejects(
      h.api.createChart(h.request(), h.renderer),
      /InlineObjectInsertionUnavailable/,
    );
    assert.equal(h.calls(), 0);
  }
});
test('a reference from another editor is refused before Native preview or paint', async () => {
  const h = harness(),
    other = harness();
  await assert.rejects(
    h.api.createChart({ ...h.request(), reference: other.reference }, h.renderer),
    /InvalidCurrentReferenceScope/,
  );
  assert.equal(h.canvases(), 0);
  assert.equal(h.calls(), 0);
});
test('created-cell owner cannot become a body caret creation', async () => {
  const h = harness();
  h.currentRef.kind = 'cell';
  h.currentRef.id = '5';
  const ref = h.api.currentReferences(0).references[0];
  await assert.rejects(
    h.api.createChart({ ...h.request(), reference: ref }, h.renderer),
    /UnsupportedChartInsertOwner/,
  );
  assert.equal(h.calls(), 0);
});
test('epoch change while encoding discards PNG and never enters Native mutation', async () => {
  const h = harness();
  h.renderer.createCanvas = () => ({
    getContext: () => h.record.ctx,
    convertToBlob: async () => {
      h.bump();
      return new Blob([png], { type: 'image/png' });
    },
  });
  await assert.rejects(h.api.createChart(h.request(), h.renderer), /StaleChartCreatePreview/);
  assert.equal(h.calls(), 0);
  assert.equal(h.allocated.size, 0);
});
test('closed editor and host capture invalidation during raster encoding both refuse without mutation', async () => {
  for (const invalidate of [
    (h) => h.close(),
    (h) => {
      h.renderer.current = () => false;
    },
  ]) {
    const h = harness();
    h.renderer.createCanvas = () => ({
      getContext: () => h.record.ctx,
      convertToBlob: async () => {
        invalidate(h);
        return new Blob([png], { type: 'image/png' });
      },
    });
    await assert.rejects(h.api.createChart(h.request(), h.renderer), /StaleChartCreatePreview/);
    assert.equal(h.calls(), 0);
  }
});
test('poison and Native refusal outcomes remain distinct, without retry', async () => {
  for (const [code, application] of [
    [0, 'unapplied'],
    [3, 'unknown'],
  ]) {
    const h = harness();
    h.code(code);
    const out = await h.api.createChart(h.request(), h.renderer);
    assert.equal(out.application, application);
    assert.equal(out.nativeCode, code);
    assert.equal(h.calls(), 1);
  }
});
test('cleanup failure after primitive success keeps applied outcome and cannot retry', async () => {
  const h = harness();
  h.cleanup();
  const out = await h.api.createChart(h.request(), h.renderer);
  assert.equal(out.application, 'applied');
  assert.equal(out.cleanupError, 'CleanupFault');
  assert.equal(h.calls(), 1);
  assert.equal(h.allocated.size, 0);
});
test('profile, aspect, accessor and extra raster payload admission are strict and owned', () => {
  assert.throws(
    () => checkedHwp5ChartCreateOptions({ ...options(), profile: 'auto' }),
    /UnsupportedChartCreateProfile/,
  );
  assert.throws(
    () => checkedHwp5ChartCreateOptions({ ...options(), preview: { width: 128, height: 64 } }),
    /InvalidHwp5ChartPreviewAspect/,
  );
  assert.throws(
    () => checkedHwp5ChartCreateOptions({ ...options(), png }),
    /InvalidInlineObjectRequest/,
  );
  const o = options();
  Object.defineProperty(o, 'series', {
    get() {
      throw Error('AccessorInvoked');
    },
    enumerable: true,
  });
  assert.throws(() => checkedHwp5ChartCreateOptions(o), /InvalidInlineObjectRequest/);
  const initial = options(),
    owned = checkedHwp5ChartCreateOptions(initial);
  initial.series[0].values[0] = 999;
  assert.equal(owned.series[0].values[0], 10);
  assert.ok(Object.isFrozen(owned.series[0].values));
});

test('normal document sizes use nearest-pixel preview without changing document geometry', () => {
  const base = { ...options(), width: 20001, height: 12000, preview: { width: 270, height: 162 } };
  const out = checkedHwp5ChartCreateOptions(base);
  assert.equal(out.width, 20001);
  assert.equal(out.height, 12000);
  assert.deepEqual(out.preview, { width: 270, height: 162 });
  assert.throws(
    () => checkedHwp5ChartCreateOptions({ ...base, preview: { width: 270, height: 163 } }),
    /InvalidHwp5ChartPreviewAspect/,
  );
  const tall = checkedHwp5ChartCreateOptions({
    ...base,
    width: 12000,
    height: 20001,
    preview: { width: 162, height: 270 },
  });
  assert.equal(tall.width, 12000);
  assert.equal(tall.height, 20001);
});

test('line creation on profile v2 uses the same kind and XML digest for painting and commit', async () => {
  const h = harness({ version: 2, authoringProfile: lineProfile, previewKind: 'lineChart' });
  assert.equal(h.api.chartCreateProfileVersion(), 2);
  const out = await h.api.createChart(h.request(), h.renderer);
  assert.equal(out.application, 'applied');
  assert.equal(h.calls(), 1);
  assert.equal(h.canvases(), 1);
  assert.ok(h.record.calls.some(([name]) => name === 'lineTo'));
  assert.equal(h.allocated.size, 0);
});
test('old engines and mismatched Native plot output cannot persist a line request', async () => {
  for (const [version, pattern] of [
    [1, /UnsupportedChartCreateProfile/],
    [2, /UnsupportedChartCreatePreviewKind/],
  ]) {
    const h = harness({ version, authoringProfile: lineProfile });
    await assert.rejects(h.api.createChart(h.request(), h.renderer), pattern);
    assert.equal(h.calls(), 0);
    assert.equal(h.canvases(), 0);
    assert.equal(h.allocated.size, 0);
  }
});

test('line input uses the typed cache budget without narrowing the legacy bar budget', () => {
  const series = [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }];
  const input = (categories) => ({
    ...options(),
    categories: Array.from({ length: categories }, (_, i) => String(i)),
    series: series.map(({ name }) => ({ name, values: Array(categories).fill(1) })),
  });
  assert.equal(
    checkedHwp5ChartCreateOptions({ ...input(2730), profile: lineProfile }).categories.length,
    2730,
  );
  assert.throws(
    () => checkedHwp5ChartCreateOptions({ ...input(2731), profile: lineProfile }),
    /ChartPointLimitExceeded/,
  );
  assert.equal(checkedHwp5ChartCreateOptions(input(2731)).categories.length, 2731);
});

test('new horizontal profile paints and commits only the matching native chart', async () => {
  const good = harness({ version: 3, authoringProfile: horizontalProfile, direction: 'bar' });
  assert.equal(good.api.chartCreateProfileVersion(), 3);
  assert.equal((await good.api.createChart(good.request(), good.renderer)).application, 'applied');
  assert.equal(good.calls(), 1);
  assert.equal(good.canvases(), 1);
  assert.equal(good.allocated.size, 0);
  for (const [version, direction, reason] of [
    [1, 'bar', /UnsupportedChartCreateProfile/],
    [2, 'bar', /UnsupportedChartCreateProfile/],
    [3, 'col', /UnsupportedChartCreatePreviewDirection/],
    [4, 'bar', /InlineObjectInsertionUnavailable/],
  ]) {
    const wrong = harness({ version, authoringProfile: horizontalProfile, direction });
    await assert.rejects(wrong.api.createChart(wrong.request(), wrong.renderer), reason);
    assert.equal(wrong.calls(), 0);
    assert.equal(wrong.canvases(), 0);
    assert.equal(wrong.allocated.size, 0);
  }
});
