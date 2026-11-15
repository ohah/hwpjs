import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHwpxInlineObjectInsertApi } from '../../js/hwpx-inline-object-insert.mjs';
import { observedChartCreateProfileVersion } from '../../web/preview/chart-create-capability.mjs';

// Source-unit boundary fixture: real Runtime routing/publication with mocked JS
// reader/editor exports and display host. No WASM instance/compiler/Native run.
let fixture;
globalThis.__chartCapabilityRuntimeFixture = () => fixture;
const hook = registerHooks({
  load(url, context, next) {
    if (url.endsWith('/js/hwpx-editor.mjs'))
      return {
        format: 'module',
        source:
          'export async function createHwpxEditor(){return globalThis.__chartCapabilityRuntimeFixture().editor;}',
        shortCircuit: true,
      };
    if (url.endsWith('/js/hwpx.mjs'))
      return {
        format: 'module',
        source:
          'export async function createHwpxReader(){return {close(){},readTextEvents(){return {sections:[],sectionCount:1,paragraphCount:0};}};}',
        shortCircuit: true,
      };
    if (url.endsWith('/web/preview/hwpx-content.mjs'))
      return {
        format: 'module',
        source:
          'export const HWPX_DISPLAY_BOUNDS={maxUnits:200000,maxParagraphs:20000};export function displayHwpxContent(){globalThis.__chartCapabilityRuntimeFixture().displays++;return {format:"hwpx",sectionCount:1,paragraphs:[],tables:[],equations:[],controls:[]};}',
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { createReaderRuntime } = await import('../../web/preview/reader-runtime.mjs');
hook.deregister();
const token = Object.create(WebAssembly.Module.prototype);
const originalExports = WebAssembly.Module.exports;
WebAssembly.Module.exports = (module) => (module === token ? [] : originalExports(module));
test.after(() => {
  WebAssembly.Module.exports = originalExports;
  delete globalThis.__chartCapabilityRuntimeFixture;
});
const request = {
  target: { section: 0, paragraph: 1, unit: 0, expected_text: '' },
  size: { width: 1, height: 1 },
  data: {
    categories: [],
    series: [{ name: 'S', values: ['2'], x_values: ['3'], bubble_sizes: ['4'] }],
  },
  chart: { kind: 'bubbleChart' },
};
function setup(version = 1) {
  let current = version,
    protocol = 2,
    poisoned = false;
  const target = { calls: 0, allocations: 0, displays: 0, wire: [] };
  const native = {
    hwpx_edit_chart_create_profile_version: () => current,
    hwpx_edit_create_chart: () => {
      target.calls++;
      return 1;
    },
  };
  const api = createHwpxInlineObjectInsertApi({
    wasm: native,
    memory: {
      withBytes(bytes, invoke) {
        target.allocations++;
        target.wire.push(JSON.parse(new TextDecoder().decode(bytes)));
        return invoke(1, bytes.length);
      },
      error: () => Error('native'),
    },
    check() {},
  });
  const methods = {
    ...api,
    open() {},
    close() {},
    enableHistoryDefault() {},
    historyStats: () => ({ protocolVersion: protocol, poisoned }),
    historyRevision: () => 0,
    historyRevisions: () => [0],
    saveForDisplay: () => new Uint8Array([0]),
    canEdit: () => true,
  };
  const editor = new Proxy(methods, {
    get: (o, key) =>
      key in o
        ? o[key]
        : key === 'withReadObservations' || key === 'then'
          ? undefined
          : String(key).startsWith('supports')
            ? () => false
            : () => [],
  });
  fixture = { ...target, editor };
  // Keep primitive counters shared with the fixture read by the display module.
  Object.defineProperties(fixture, {
    calls: { get: () => target.calls },
    allocations: { get: () => target.allocations },
    wire: { get: () => target.wire },
  });
  return {
    runtime: createReaderRuntime({ wasmModule: token, allowReload: true }),
    counts: () => target,
    version(value) {
      current = value;
    },
    poison() {
      poisoned = true;
    },
    protocol(value) {
      protocol = value;
    },
    view: () => fixture,
  };
}
test('real Runtime publication observes version on load/enable/reused projection and rechecks mutation', async () => {
  const f = setup();
  try {
    const loaded = await f.runtime.request({
      kind: 'load',
      format: 'hwpx',
      bytes: new Uint8Array([1]),
    });
    assert.equal(loaded.error, undefined, JSON.stringify(loaded));
    assert.equal(loaded.content.chartCreateProfileVersion, 0);
    const displays = f.view().displays;
    const enabled = await f.runtime.request({ kind: 'enable' });
    assert.equal(enabled.error, undefined, JSON.stringify(enabled));
    assert.equal(enabled.content.chartCreateProfileVersion, 1);
    assert.equal(f.view().displays, displays, 'one-shot e41 load projection reused');
    const created = await f.runtime.request({ kind: 'create-chart', request });
    assert.equal(created.error, undefined, JSON.stringify(created));
    assert.equal(f.counts().calls, 1);
    assert.deepEqual(f.counts().wire[0], request);
    f.version(0);
    const rejected = await f.runtime.request({ kind: 'create-chart', request });
    assert.equal(rejected.error, 'ChartCreateProfileUnavailable');
    assert.equal(f.counts().calls, 1);
    assert.equal(f.counts().allocations, 1);
    const refreshed = await f.runtime.request({ kind: 'refresh' });
    assert.equal(refreshed.content.chartCreateProfileVersion, 0);
  } finally {
    await f.runtime.dispose();
  }
});
test('real Runtime rejects unknown capability and poisoned history before allocation while legacy stays separate', async () => {
  const f = setup(2);
  try {
    assert.equal(
      (await f.runtime.request({ kind: 'load', format: 'hwpx', bytes: new Uint8Array([1]) })).error,
      undefined,
    );
    const enabled = await f.runtime.request({ kind: 'enable' });
    assert.equal(enabled.content.chartCreateProfileVersion, 0);
    assert.equal(
      (await f.runtime.request({ kind: 'create-chart', request })).error,
      'ChartCreateProfileUnavailable',
    );
    assert.equal(f.counts().allocations, 0);
    const legacy = {
      target: request.target,
      size: request.size,
      data: { categories: ['A'], series: [{ name: 'S', values: ['1'] }] },
    };
    assert.equal(
      (await f.runtime.request({ kind: 'create-chart', request: legacy })).error,
      undefined,
    );
    assert.equal(f.counts().calls, 1);
    f.version(1);
    f.poison();
    assert.equal(
      (await f.runtime.request({ kind: 'create-chart', request })).error,
      'ChartCreateProfileUnavailable',
    );
    assert.equal(f.counts().calls, 1);
  } finally {
    await f.runtime.dispose();
  }
});
test('capability projection never guesses support from create-chart presence or truthy query results', () => {
  for (const value of [undefined, 0, 2, '1', true, 1n, NaN])
    assert.equal(
      observedChartCreateProfileVersion(
        { chartCreateProfileVersion: () => value },
        'hwpx',
        true,
        { protocolVersion: 2 },
        false,
      ),
      0,
    );
  for (const [format, enabled, stats, poisoned] of [
    ['hwp5', true, { protocolVersion: 2 }, false],
    ['hwpx', false, { protocolVersion: 2 }, false],
    ['hwpx', true, { protocolVersion: 1 }, false],
    ['hwpx', true, { protocolVersion: 2 }, true],
    ['hwpx', true, { protocolVersion: 2, poisoned: true }, false],
  ])
    assert.equal(
      observedChartCreateProfileVersion(
        { chartCreateProfileVersion: () => 1 },
        format,
        enabled,
        stats,
        poisoned,
      ),
      0,
    );
});
