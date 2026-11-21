import { chartBarLayout } from '../../web/preview/chart-bar-layout.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHwp5ChartLiteralEditApi,
  checkedHwp5LiteralEdits,
} from '../../js/hwp5-chart-literal-edit.mjs';
import { createHwp5ChartDataCommands } from '../../web/preview/hwp5-chart-data-command.mjs';
import {
  HWP5_CHART_LITERAL_BAR_PROFILE as BAR,
  HWP5_CHART_LITERAL_LINE_PROFILE as LINE,
  HWP5_CHART_LITERAL_HORIZONTAL_BAR_PROFILE as HORIZONTAL,
  HWP5_CHART_LITERAL_PIE_PROFILE as PIE,
} from '../../js/hwp5-chart-literal-profiles.mjs';
import { model, context } from '../hwpx/chart-family-model.mjs';
const edits = [{ value: { series: 0, category: 0, expected: '10', value: '73' } }];
function fixture({
  changed = true,
  staleAt = '',
  code = 1,
  cleanup = false,
  profile = BAR,
  version = 1,
  previewProfile = profile,
  kind = profile === PIE ? 'pieChart' : profile === LINE ? 'lineChart' : 'barChart',
  mutateData = () => {},
} = {}) {
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
  if (kind === 'barChart')
    data.plot_settings[0].direction = { node: 4, value: profile === HORIZONTAL ? 'bar' : 'col' };
  data.plot_settings[0].grouping = {
    node: 5,
    value: kind === 'barChart' ? 'clustered' : 'standard',
  };
  if (profile === PIE) {
    data.axes = [];
    data.axis_links = [];
    Object.assign(data.plot_settings[0], {
      grouping: null,
      axis_references: [],
      vary_colors: { node: 31, value: true },
      first_slice_angle: { node: 32, value: 0 },
    });
  }
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
  assert.throws(
    () => fixture({ version: 1, profile: LINE }).api.captureHwp5ChartData(0, 9),
    /InvalidChartLiteralLease/,
  );
  assert.throws(
    () => fixture({ version: 2, profile: 'arbitrary' }).api.captureHwp5ChartData(0, 9),
    /UnsupportedChartLiteralEditProfile/,
  );
  assert.equal(fixture({ version: 5 }).api.supportsHwp5ChartLiteralEditAbi(), false);
});
for (const previewProfile of [BAR, null, 'arbitrary'])
  test(
    'line lease refuses mismatched or absent profile before raster ' + previewProfile,
    async () => {
      const f = fixture({ profile: LINE, version: 2, previewProfile });
      await withCanvas(f, async () => {
        await assert.rejects(
          f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits),
          /InvalidChartLiteralPreview/,
        );
        assert.equal(f.stats().commits, 0);
        assert.equal(f.stats().painted, 0);
      });
    },
  );
for (const mutateData of [
  (d) => {
    d.plots[0].kind = 'barChart';
  },
  (d) => {
    d.plots.push(structuredClone(d.plots[0]));
  },
  (d) => {
    d.plot_settings[0].grouping.value = 'stacked';
  },
  (d) => {
    d.series_settings[0].smooth = { node: 333, value: true };
  },
])
  test(
    'line profile rejects a different plot mixed plots or arbitrary style ' + mutateData.toString(),
    async () => {
      const f = fixture({ profile: LINE, version: 2, mutateData });
      await withCanvas(f, async () => {
        await assert.rejects(f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits));
        assert.equal(f.stats().commits, 0);
        assert.equal(f.stats().painted, 0);
      });
    },
  );
for (const staleAt of ['blob', 'array'])
  test(
    'line late ' + staleAt + ' rejects stale lease and releases surface without commit',
    async () => {
      const f = fixture({ profile: LINE, version: 2, staleAt });
      await withCanvas(f, async () => {
        await assert.rejects(
          f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits),
          /Stale/,
        );
        assert.equal(f.stats().commits, 0);
        assert.equal(f.canvases[0].width, 0);
      });
    },
  );
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

test('horizontal v3 owns direction profile and one painter commit while v1 and v2 refuse', async () => {
  for (const version of [1, 2])
    assert.throws(
      () => fixture({ profile: HORIZONTAL, version }).api.captureHwp5ChartData(0, 9),
      /InvalidChartLiteralLease/,
    );
  const f = fixture({ profile: HORIZONTAL, version: 3 });
  await withCanvas(f, async () => {
    const capture = f.api.captureHwp5ChartData(0, 9);
    const result = await f.api.editHwp5ChartData(capture, edits);
    assert.equal(result.application, 'applied');
    assert.equal(f.stats().finalBody.witness.profile, HORIZONTAL);
    assert.equal(f.stats().commits, 1);
    assert.equal(f.stats().painted, 1);
    assert.equal(f.stats().encoded, 1);
    assert.equal(f.canvases[0].width, 0);
    await assert.rejects(f.api.editHwp5ChartData(capture, edits), /Stale/);
  });
});
for (const mutateData of [
  (d) => {
    d.plot_settings[0].direction.value = 'col';
  },
  (d) => {
    d.plot_settings[0].direction = null;
  },
  (d) => {
    d.plot_settings[0].grouping.value = 'stacked';
  },
  (d) => {
    d.plots[0].kind = 'bar3DChart';
  },
  (d) => {
    d.plots.push(structuredClone(d.plots[0]));
  },
])
  test(
    'horizontal profile refuses noncanonical direction or plot before canvas ' + mutateData,
    async () => {
      const f = fixture({ profile: HORIZONTAL, version: 3, mutateData });
      await withCanvas(f, async () => {
        await assert.rejects(f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits));
        assert.equal(f.stats().commits, 0);
        assert.equal(f.stats().painted, 0);
      });
    },
  );
for (const previewProfile of [BAR, LINE, null])
  test('horizontal preview refuses profile substitution ' + previewProfile, async () => {
    const f = fixture({ profile: HORIZONTAL, version: 3, previewProfile });
    await withCanvas(f, async () => {
      await assert.rejects(
        f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits),
        /InvalidChartLiteralPreview/,
      );
      assert.equal(f.stats().commits, 0);
      assert.equal(f.stats().painted, 0);
    });
  });
for (const staleAt of ['blob', 'array'])
  test('horizontal stale ' + staleAt + ' cannot commit', async () => {
    const f = fixture({ profile: HORIZONTAL, version: 3, staleAt });
    await withCanvas(f, async () => {
      await assert.rejects(
        f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits),
        /Stale/,
      );
      assert.equal(f.stats().commits, 0);
      assert.equal(f.canvases[0].width, 0);
    });
  });
test('horizontal no-op retains profile without painter; v3 keeps column and line', async () => {
  const f = fixture({ profile: HORIZONTAL, version: 3, changed: false, code: 2 });
  const result = await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
  assert.equal(result.nativeCode, 2);
  assert.equal(f.stats().painted, 0);
  assert.equal(f.stats().finalBody.rendered, null);
  for (const profile of [BAR, LINE]) {
    const old = fixture({ profile, version: 3 });
    await withCanvas(old, async () => {
      await old.api.editHwp5ChartData(old.api.captureHwp5ChartData(0, 9), edits);
      assert.equal(old.stats().commits, 1);
    });
  }
});

test('horizontal bar layout uses independent value width and category height', () => {
  const d = model('barChart', [
    [30, -10, 0],
    [20, -20, 10],
  ]);
  d.plot_settings[0].grouping = { node: 5, value: 'clustered' };
  d.plot_settings[0].direction = { node: 4, value: 'col' };
  const column = chartBarLayout(d, d.plots[0].node);
  d.plot_settings[0].direction.value = 'bar';
  const horizontal = chartBarLayout(d, d.plots[0].node);
  assert.equal(horizontal.state, 'ready');
  assert.equal(horizontal.direction, 'bar');
  assert.equal(horizontal.bars.length, 6);
  for (let i = 0; i < horizontal.bars.length; ++i) {
    const h = horizontal.bars[i].rectangle,
      c = column.bars[i].rectangle;
    assert.ok(Math.abs(h.x - (1 - c.y - c.height)) < 1e-12);
    assert.ok(Math.abs(h.y - (1 - c.x - c.width)) < 1e-12);
    assert.equal(h.width, c.height);
    assert.equal(h.height, c.width);
  }
});

for (const version of [1, 2, 3])
  test('pie literal old capability refuses ' + version, () => {
    assert.throws(
      () => fixture({ profile: PIE, version }).api.captureHwp5ChartData(0, 9),
      /InvalidChartLiteralLease/,
    );
  });
test('pie v4 capture profile is observation and private painter commits once with schema one', async () => {
  const f = fixture({ profile: PIE, version: 4 });
  await withCanvas(f, async () => {
    const capture = f.api.captureHwp5ChartData(0, 9);
    assert.equal(capture.profile, PIE);
    await f.api.editHwp5ChartData(capture, edits);
    assert.equal(f.stats().commits, 1);
    assert.equal(f.stats().encoded, 1);
    assert.equal(f.stats().finalBody.schemaVersion, 1);
    assert.equal(f.stats().finalBody.witness.profile, PIE);
    await assert.rejects(f.api.editHwp5ChartData({ ...capture }, edits), /Stale/);
  });
});
for (const value of ['-1', '-1e-5000', '1e-5000', 'NaN', 'Infinity', '1e-320'])
  test('pie raw rejection retains capture before preview/painter/commit ' + value, async () => {
    const f = fixture({ profile: PIE, version: 4 });
    const capture = f.api.captureHwp5ChartData(0, 9);
    await assert.rejects(
      f.api.editHwp5ChartData(capture, [
        { value: { series: 0, category: 0, expected: '10', value } },
      ]),
    );
    assert.equal(f.requests.length, 0);
    assert.equal(f.stats().commits, 0);
    assert.equal(f.stats().painted, 0);
    assert.equal(f.api.isHwp5ChartDataCurrent(capture), true);
  });
test('pie all-zero full draft rejected before preview', async () => {
  const f = fixture({ profile: PIE, version: 4 });
  await assert.rejects(
    f.api.editHwp5ChartData(
      f.api.captureHwp5ChartData(0, 9),
      ['10', '20', '30'].map((expected, category) => ({
        value: { series: 0, category, expected, value: '0' },
      })),
    ),
    /EmptyPieMagnitude/,
  );
  assert.equal(f.requests.length, 0);
  assert.equal(f.stats().commits, 0);
});
for (const mutateData of [
  (d) => {
    d.plot_settings[0].first_slice_angle.value = 20;
  },
  (d) => {
    d.series_settings[0].explosion = { node: 99, value: 1 };
  },
  (d) => {
    d.axes.push({});
  },
  (d) => {
    d.points.find((p) => p.kind === 'numeric_literal').value = '-1';
  },
])
  test('pie noncanonical preview rejected before canvas ' + mutateData, async () => {
    const f = fixture({ profile: PIE, version: 4, mutateData });
    await withCanvas(f, async () => {
      await assert.rejects(f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits));
      assert.equal(f.stats().commits, 0);
      assert.equal(f.stats().painted, 0);
    });
  });
test('v4 retains v3 bar line horizontal edits', async () => {
  for (const profile of [BAR, LINE, HORIZONTAL]) {
    const f = fixture({ profile, version: 4 });
    await withCanvas(f, async () => {
      await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
      assert.equal(f.stats().commits, 1);
    });
  }
});

for (const staleAt of ['blob', 'array'])
  test('pie stale painter boundary refuses ' + staleAt, async () => {
    const f = fixture({ profile: PIE, version: 4, staleAt });
    await withCanvas(f, async () => {
      await assert.rejects(
        f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits),
        /Stale/,
      );
      assert.equal(f.stats().commits, 0);
      assert.equal(f.canvases[0].width, 0);
    });
  });
test('pie no-op does not encode or allocate canvas', async () => {
  const f = fixture({ profile: PIE, version: 4, changed: false, code: 2 });
  await f.api.editHwp5ChartData(f.api.captureHwp5ChartData(0, 9), edits);
  assert.equal(f.stats().painted, 0);
  assert.equal(f.stats().encoded, 0);
  assert.equal(f.stats().finalBody.rendered, null);
});
