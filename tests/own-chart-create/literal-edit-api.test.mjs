import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHwp5ChartLiteralEditApi,
  checkedHwp5LiteralEdits,
} from '../../js/hwp5-chart-literal-edit.mjs';
import { createHwp5ChartDataCommands } from '../../web/preview/hwp5-chart-data-command.mjs';
import { HWP5_CHART_LITERAL_BAR_PROFILE as BAR, HWP5_CHART_LITERAL_LINE_PROFILE as LINE } from '../../js/hwp5-chart-literal-profiles.mjs';
import { model, context } from '../hwpx/chart-family-model.mjs';
const edits = [{ value: { series: 0, category: 0, expected: '10', value: '73' } }];
function fixture({ changed = true, staleAt = '', code = 1, cleanup = false, profile = BAR, version = 1, previewProfile = profile, kind = profile === LINE ? 'lineChart' : 'barChart', mutateData = () => {} } = {}) {
  let epoch = 1,
    next,
    ptr = 0,
    commits = 0,
    painted = 0,
    encoded = 0,
    finalBody,
    finalImage;
  const buffers = new Map(),
    requests = [];
  const witness = () => ({
    profile,
    ticket: {
      document: { lo: 1, hi: 2 },
      generation: { lo: 3, hi: 4 },
      owner: { lo: 5, hi: 6 },
      epoch: { lo: epoch, hi: 8 },
    },
    viewEpoch: { lo: epoch, hi: 10 },
    historyRevision: 0,
    owners: [
      {
        section: 0,
        physical_id: 1,
        resource_sha256: Array(32).fill(5),
        owner: { control_node: 9 },
      },
    ],
    source_xml_sha256: Array(32).fill(2),
    pixel_width: 128,
    pixel_height: 96,
  });
  const lease = () => ({
    schemaVersion: 1,
    scope: 'hwp5-chart-literal-edit-lease',
    executionAuthority: false,
    witness: witness(),
    literals: { categories: ['a', 'b', 'c'], series: [{ name: 's', values: ['10', '20', '30'] }] },
    limits: {},
  });
  const data = model(kind, [[73, 20, 30]]);
  delete data.pair;
  delete data.host;
  if (kind === 'barChart') data.plot_settings[0].direction = { node: 4, value: 'col' };
  data.plot_settings[0].grouping = { node: 5, value: kind === 'barChart' ? 'clustered' : 'standard' };
  mutateData(data);
  const memory = {
    withBytes(bytes, fn) {
      const id = ++ptr;
      buffers.set(id, bytes.slice());
      const out = fn(id, bytes.length);
      if (cleanup && commits) throw Error('outer-free');
      buffers.delete(id);
      return out;
    },
    error: () => Error('NativeRefusal'),
  };
  const decode = (id) => JSON.parse(new TextDecoder().decode(buffers.get(id)));
  const wasm = {
    hwp5_edit_chart_literal_edit_profile_version() {
      return version;
    },
    hwp5_edit_chart_literal_edit_lease(section, control) {
      assert.equal(section, 0);
      assert.equal(control, 9);
      next = lease();
      return 1;
    },
    hwp5_edit_chart_literal_edit_preview(id, _len) {
      const r = decode(id);
      requests.push(r);
      next = {
        schemaVersion: 1,
        scope: 'hwp5-chart-literal-edit-preview',
        executionAuthority: false,
        changed,
        ...(previewProfile === null ? {} : { profile: previewProfile }),
        xml_sha256: Array(32).fill(7),
        pixel_width: 128,
        pixel_height: 96,
        data,
      };
      return 1;
    },
    hwp5_edit_chart_literal_edit_commit(id, len, image, size) {
      finalBody = decode(id);
      finalImage = size ? buffers.get(image) : null;
      commits++;
      epoch++;
      return code;
    },
  };
  const api = createHwp5ChartLiteralEditApi({
    wasm,
    memory,
    check() {},
    u32: (n) => n,
    output(action) {
      assert.equal(action(), 1);
      return { bytes: new TextEncoder().encode(JSON.stringify(next)) };
    },
  });
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.set(new TextEncoder().encode('IHDR'), 12);
  const dv = new DataView(png.buffer);
  dv.setUint32(8, 13);
  dv.setUint32(16, 128);
  dv.setUint32(20, 96);
  const canvases = [];
  class Canvas {
    constructor() {
      this.width = 0;
      this.height = 0;
      canvases.push(this);
    }
    getContext() {
      painted++;
      return context().ctx;
    }
    async convertToBlob() {
      encoded++;
      if (staleAt === 'blob') epoch++;
      return {
        type: 'image/png',
        size: 33,
        arrayBuffer: async () => {
          if (staleAt === 'array') epoch++;
          return png.buffer.slice(0);
        },
      };
    }
  }
  return {
    api,
    wasm,
    Canvas,
    canvases,
    requests,
    stats: () => ({ commits, painted, encoded, finalBody, finalImage }),
    stale() {
      epoch++;
    },
  };
}
const withCanvas = async (f, fn) => {
  const before = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = f.Canvas;
  try {
    await fn();
  } finally {
    globalThis.OffscreenCanvas = before;
  }
};
test('optional four exact signatures and version are independently required', () => {
  const f = fixture();
  assert.equal(f.api.supportsHwp5ChartLiteralEditAbi(), true);
  delete f.wasm.hwp5_edit_chart_literal_edit_commit;
  assert.equal(f.api.supportsHwp5ChartLiteralEditAbi(), false);
  const g = fixture();
  g.wasm.hwp5_edit_chart_literal_edit_preview = () => 1;
  assert.equal(g.api.supportsHwp5ChartLiteralEditAbi(), false);
});
test('private capture rejects JSON clones, expired tickets, extra PNG and duplicate logical edits before mutation', async () => {
  const f = fixture(),
    c = f.api.captureHwp5ChartData(0, 9);
  await assert.rejects(f.api.editHwp5ChartData(structuredClone(c), edits), /Stale/);
  await assert.rejects(f.api.editHwp5ChartData(c, edits, new Uint8Array([1])), /Arguments/);
  assert.throws(() => checkedHwp5LiteralEdits([...edits, ...edits]), /Duplicate/);
  assert.throws(() => checkedHwp5LiteralEdits([{ ...edits[0], rendered: {} }]), /Invalid/);
  f.stale();
  await assert.rejects(f.api.editHwp5ChartData(c, edits), /Stale/);
  assert.equal(f.stats().commits, 0);
});
test('final shared painter is invoked once and only its PNG and new XML hash reach single commit', async () => {
  const f = fixture();
  await withCanvas(f, async () => {
    const c = f.api.captureHwp5ChartData(0, 9),
      r = await f.api.editHwp5ChartData(c, edits);
    assert.equal(r.application, 'applied');
    const v = f.stats();
    assert.equal(v.commits, 1);
    assert.equal(v.painted, 1);
    assert.equal(v.encoded, 1);
    assert.equal(v.finalImage.length, 33);
    assert.deepEqual(v.finalBody.rendered.source_xml_sha256, Array(32).fill(7));
    assert.deepEqual(f.requests[0].witness.ticket.owner, { lo: 5, hi: 6 });
    assert.equal(f.canvases[0].width, 0);
    await assert.rejects(f.api.editHwp5ChartData(c, edits), /Stale/);
  });
});
for (const phase of ['blob', 'array'])
  test('stale ' + phase + ' await prevents commit and releases raster', async () => {
    const f = fixture({ staleAt: phase });
    await withCanvas(f, async () => {
      await assert.rejects(
        f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits),
        /Stale/,
      );
      assert.equal(f.stats().commits, 0);
      assert.equal(f.canvases[0].width, 0);
    });
  });
test('Native identical edits no-op sends null raster and does not require a canvas', async () => {
  const f = fixture({ changed: false, code: 2 });
  const r = await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
  assert.equal(r.nativeCode, 2);
  assert.equal(f.stats().painted, 0);
  assert.equal(f.stats().finalBody.rendered, null);
  assert.equal(f.stats().finalImage, null);
});
test('observed applied result survives outer PNG cleanup failure without retry', async () => {
  const f = fixture({ cleanup: true });
  await withCanvas(f, async () => {
    const r = await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
    assert.equal(r.application, 'applied');
    assert.equal(r.refreshRequired, true);
    assert.match(r.cleanupError, /outer-free/);
    assert.equal(f.stats().commits, 1);
  });
});
test('worker keys are scoped to issuing editor and reject caller PNG payloads', async () => {
  const f = fixture({ changed: false, code: 2 });
  let current = f.api;
  const commands = createHwp5ChartDataCommands(
    () => current,
    () => true,
  );
  const m = { kind: 'hwp5-chart-data-capture', section: 0, controlNode: 9 },
    r = commands.capture(m);
  await assert.rejects(
    commands.apply({
      kind: 'hwp5-chart-data-apply',
      leaseKey: r.leaseKey,
      edits,
      png: new Uint8Array([1]),
    }),
    /Invalid/,
  );
  current = fixture().api;
  await assert.rejects(
    commands.apply({ kind: 'hwp5-chart-data-apply', leaseKey: r.leaseKey, edits }),
    /Stale/,
  );
  assert.equal(f.stats().commits, 0);
  current = f.api;
  await assert.rejects(
    commands.apply({ kind: 'hwp5-chart-data-apply', leaseKey: r.leaseKey, edits }),
    /Stale/,
  );
  const next = commands.capture(m);
  await commands.apply({ kind: 'hwp5-chart-data-apply', leaseKey: next.leaseKey, edits });
  assert.equal(f.stats().commits, 1);
  await assert.rejects(
    commands.apply({ kind: 'hwp5-chart-data-apply', leaseKey: r.leaseKey, edits }),
    /Stale/,
  );
});

test('standard line v2 owns typed profile through lease preview safe painter and one commit', async () => {
  const f = fixture({ profile: LINE, version: 2 });
  await withCanvas(f, async () => {
    const capture = f.api.captureHwp5ChartData(0, 9);
    const result = await f.api.editHwp5ChartData(capture, edits);
    assert.equal(result.application, 'applied');
    assert.equal(f.requests[0].witness.profile, LINE);
    assert.equal(f.stats().finalBody.witness.profile, LINE);
    assert.equal(f.stats().commits, 1);
    assert.equal(f.stats().painted, 1);
    assert.equal(f.stats().encoded, 1);
    assert.equal(f.canvases[0].width, 0);
    await assert.rejects(f.api.editHwp5ChartData(capture, edits), /Stale/);
    assert.equal(f.stats().commits, 1);
  });
});
test('capability v1 bar and v2 bar retain old signatures and missing old bar preview field', async () => {
  for (const version of [1, 2]) {
    const f = fixture({ version, previewProfile: null });
    await withCanvas(f, async () => {
      await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
      assert.equal(f.stats().commits, 1);
    });
  }
  assert.throws(() => fixture({ version: 1, profile: LINE }).api.captureHwp5ChartData(0, 9), /InvalidChartLiteralLease/);
  assert.throws(() => fixture({ version: 2, profile: 'arbitrary' }).api.captureHwp5ChartData(0, 9), /UnsupportedChartLiteralEditProfile/);
  assert.equal(fixture({ version: 3 }).api.supportsHwp5ChartLiteralEditAbi(), false);
});
for (const previewProfile of [BAR, null, 'arbitrary'])
  test('line lease refuses mismatched or absent profile before raster '+previewProfile, async () => {
    const f = fixture({ profile: LINE, version: 2, previewProfile });
    await withCanvas(f, async () => {
      await assert.rejects(f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits), /InvalidChartLiteralPreview/);
      assert.equal(f.stats().commits, 0);
      assert.equal(f.stats().painted, 0);
    });
  });
for (const mutateData of [
  (d) => { d.plots[0].kind = 'barChart'; },
  (d) => { d.plots.push(structuredClone(d.plots[0])); },
  (d) => { d.plot_settings[0].grouping.value = 'stacked'; },
  (d) => { d.series_settings[0].smooth = { node: 333, value: true }; },
])
  test('line profile rejects a different plot mixed plots or arbitrary style '+mutateData.toString(), async () => {
    const f = fixture({ profile: LINE, version: 2, mutateData });
    await withCanvas(f, async () => {
      await assert.rejects(f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits));
      assert.equal(f.stats().commits, 0);
      assert.equal(f.stats().painted, 0);
    });
  });
for (const staleAt of ['blob', 'array'])
  test('line late '+staleAt+' rejects stale lease and releases surface without commit', async () => {
    const f = fixture({ profile: LINE, version: 2, staleAt });
    await withCanvas(f, async () => {
      await assert.rejects(f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits), /Stale/);
      assert.equal(f.stats().commits, 0);
      assert.equal(f.canvases[0].width, 0);
    });
  });
test('line no-op preserves typed witness and uses no raster', async () => {
  const f = fixture({ profile: LINE, version: 2, changed: false, code: 2 });
  const result = await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
  assert.equal(result.nativeCode, 2);
  assert.equal(f.stats().painted, 0);
  assert.equal(f.stats().finalBody.rendered, null);
  assert.equal(f.stats().finalBody.witness.profile, LINE);
});

test('line stale capture before preview cannot allocate raster or reach commit', async () => {
  const f = fixture({ profile: LINE, version: 2 });
  const capture = f.api.captureHwp5ChartData(0, 9);
  f.stale();
  await assert.rejects(f.api.editHwp5ChartData(capture, edits), /Stale/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.stats().commits, 0);
  assert.equal(f.stats().painted, 0);
});
