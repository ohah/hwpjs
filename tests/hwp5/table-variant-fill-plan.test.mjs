import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hwp5TableBorderPaintPlan,
  hwp5TableBorderPaintIndex,
} from '../../web/preview/hwp5-table-border-plan.mjs';
import { paintTableBorder } from '../../web/preview/table-border-paint.mjs';
import { validDrawingFill } from '../../web/preview/drawing-fill-validation.mjs';

const style = () => ({
  attributes: 0,
  fill_known: true,
  fill_flags: 1,
  unknown_fill_bytes: null,
  extra_bytes: 0,
  additional_bytes: 0,
  pattern: { background: 0x030201, foreground: 0x332211, kind: -1 },
  image: null,
  gradient: null,
  alpha: { pattern: 0, gradient: null, image: null },
  borders: Array.from({ length: 5 }, () => ({ kind: 0, width: 0, color: 0 })),
});
const linear = () => ({
  ...style(),
  fill_flags: 4,
  additional_bytes: 1,
  pattern: null,
  alpha: { pattern: null, gradient: 0, image: null },
  gradient: {
    kind: 1,
    angle: 90,
    center_x: 50,
    center_y: 50,
    blur: 2,
    blur_center: 50,
    colors: [0x0000ff, 0xff0000],
    positions: [],
  },
});

// Independent paired official UI/HWP/HWPX exports, not the writer or drawing raw enum.
// Provenance: tools/tests/fixtures/hwp5-official-hatch-oracle.json.
const officialKinds = ['HORIZONTAL', 'VERTICAL', 'SLASH', 'BACK_SLASH', 'CROSS', 'CROSS_DIAGONAL'];
for (const [raw, kind] of officialKinds.entries())
  test(
    'official TABLE hatch raw' +
      raw +
      ' maps ' +
      kind +
      ' with independent BGR face/foreground expectations',
    () => {
      const source = style();
      source.pattern.kind = raw;
      const before = structuredClone(source),
        plan = hwp5TableBorderPaintPlan(source);
      assert.equal(plan.state, 'none');
      assert.deepEqual(plan.fill, {
        state: 'pattern',
        background: '#010203',
        color: '#112233',
        kind,
        rasterParity: 'unverified',
      });
      assert.equal(validDrawingFill(plan.fill), true);
      assert.deepEqual(source, before);
    },
  );

test('none, solid sentinel and opaque legacy solid remain distinct from unknown/image fills', () => {
  const source = style();
  assert.deepEqual(hwp5TableBorderPaintPlan(source).fill, { state: 'solid', color: '#010203' });
  assert.deepEqual(hwp5TableBorderPaintPlan({ ...source, alpha: null }).fill, {
    state: 'solid',
    color: '#010203',
  });
  assert.equal(
    hwp5TableBorderPaintPlan({ ...source, pattern: { ...source.pattern, background: 0xffffffff } })
      .fill,
    undefined,
  );
  assert.deepEqual(
    hwp5TableBorderPaintPlan({ ...source, fill_flags: 0, pattern: null, alpha: null }),
    { state: 'none' },
  );
});

test('linear TABLE gradient reuses common steps with independently fixed red/blue stop values', () => {
  const source = linear(),
    before = structuredClone(source),
    plan = hwp5TableBorderPaintPlan(source);
  assert.deepEqual(plan.fill, {
    state: 'linear_gradient',
    angle: 90,
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 0.5, color: '#ff0000' },
      { offset: 0.5, color: '#0000ff' },
      { offset: 1, color: '#0000ff' },
    ],
    rasterParity: 'unverified',
  });
  assert.equal(validDrawingFill(plan.fill), true);
  const three = linear();
  three.gradient.blur = 3;
  assert.deepEqual(hwp5TableBorderPaintPlan(three).fill.stops, [
    { offset: 0, color: '#ff0000' },
    { offset: 0.25, color: '#ff0000' },
    { offset: 0.25, color: '#800080' },
    { offset: 0.75, color: '#800080' },
    { offset: 0.75, color: '#0000ff' },
    { offset: 1, color: '#0000ff' },
  ]);
  const shifted = linear();
  shifted.gradient.blur_center = 25;
  assert.deepEqual(
    hwp5TableBorderPaintPlan(shifted).fill.stops.map((stop) => stop.offset),
    [0, 0.25, 0.25, 1],
  );
  const empty = linear();
  empty.gradient.blur = 0;
  assert.deepEqual(hwp5TableBorderPaintPlan(empty), { state: 'none' });
  assert.deepEqual(source, before);
});

const invalid = [
  [
    'unknown flags',
    (s) => {
      s.fill_known = false;
    },
  ],
  [
    'opaque tail',
    (s) => {
      s.extra_bytes = 1;
    },
  ],
  [
    'unknown bytes',
    (s) => {
      s.unknown_fill_bytes = 1;
    },
  ],
  [
    'pattern extension',
    (s) => {
      s.additional_bytes = 1;
    },
  ],
  [
    'pattern nonzero alpha',
    (s) => {
      s.alpha.pattern = 1;
    },
  ],
  [
    'mixed image',
    (s) => {
      s.fill_flags = 3;
      s.image = {};
    },
  ],
  [
    'image only',
    (s) => {
      s.fill_flags = 2;
      s.pattern = null;
      s.image = {};
    },
  ],
  [
    'hatch raw6',
    (s) => {
      s.pattern.kind = 6;
    },
  ],
  [
    'hatch fractional raw',
    (s) => {
      s.pattern.kind = 0.5;
    },
  ],
  [
    'unknown hatch face',
    (s) => {
      s.pattern.kind = 0;
      s.pattern.background = 0xffffffff;
    },
  ],
  [
    'unknown hatch foreground',
    (s) => {
      s.pattern.kind = 0;
      s.pattern.foreground = 0xffffffff;
    },
  ],
];
for (const [name, change] of invalid)
  test('unsupported ' + name + ' never flattens to a working solid', () => {
    const source = style();
    change(source);
    const plan = hwp5TableBorderPaintPlan(source);
    assert.equal(plan.state, 'unavailable');
    assert.equal(plan.fill, undefined);
  });
for (const [name, change] of [
  [
    'radial',
    (s) => {
      s.gradient.kind = 2;
    },
  ],
  [
    'explicit positions',
    (s) => {
      s.gradient.positions = [0, 100];
    },
  ],
  [
    'missing blur center',
    (s) => {
      s.gradient.blur_center = null;
    },
  ],
  [
    'missing additional byte',
    (s) => {
      s.additional_bytes = 0;
    },
  ],
  [
    'gradient nonzero alpha',
    (s) => {
      s.alpha.gradient = 1;
    },
  ],
  [
    'gradient extra image alpha',
    (s) => {
      s.alpha.image = 0;
    },
  ],
  [
    'unverified gradient color',
    (s) => {
      s.gradient.colors[1] = 0xffffffff;
    },
  ],
  [
    'single gradient step',
    (s) => {
      s.gradient.blur = 1;
    },
  ],
  [
    'noninteger gradient angle',
    (s) => {
      s.gradient.angle = NaN;
    },
  ],
  [
    'out of range center',
    (s) => {
      s.gradient.center_x = 101;
    },
  ],
])
  test('unsupported linear ' + name + ' stays unavailable', () => {
    const source = linear();
    change(source);
    const plan = hwp5TableBorderPaintPlan(source);
    assert.equal(plan.state, 'unavailable');
    assert.equal(plan.fill, undefined);
  });

test('verified pattern/gradient fills survive independent unsupported border diagnostics', () => {
  for (const source of [
    Object.assign(style(), { pattern: { background: 0x030201, foreground: 0x332211, kind: 2 } }),
    linear(),
  ]) {
    const fill = hwp5TableBorderPaintPlan(source).fill;
    const plan = hwp5TableBorderPaintPlan({ ...source, attributes: 1 });
    assert.equal(plan.state, 'unavailable');
    assert.deepEqual(plan.fill, fill);
  }
});

function recordingContext() {
  const calls = [],
    tileCalls = [];
  const tile = {
    getContext: () => ({
      fillRect: (...a) => tileCalls.push(['fillRect', ...a]),
      beginPath() {},
      moveTo: (...a) => tileCalls.push(['moveTo', ...a]),
      lineTo: (...a) => tileCalls.push(['lineTo', ...a]),
      stroke() {},
    }),
  };
  return {
    calls,
    tileCalls,
    ctx: {
      canvas: { ownerDocument: { createElement: () => tile } },
      save() {},
      restore() {},
      fillRect: (...a) => calls.push(['fillRect', ...a]),
      createPattern: () => ({ pattern: true }),
      createLinearGradient: (...a) => {
        calls.push(['gradient', ...a]);
        return { addColorStop: (...s) => calls.push(['stop', ...s]) };
      },
    },
  };
}
test('TABLE plans pass existing common painter: canonical diagonal tile paths and linear coordinates', () => {
  // Context-call expectations prove adapter geometry, not official body-raster parity.
  for (const [raw, ends] of [
    [
      2,
      [
        [0, 0],
        [6, 6],
      ],
    ],
    [
      3,
      [
        [6, 0],
        [0, 6],
      ],
    ],
  ]) {
    const source = style();
    source.pattern.kind = raw;
    const r = recordingContext();
    assert.equal(
      paintTableBorder(
        r.ctx,
        { x: 10, y: 20, width: 60, height: 40 },
        hwp5TableBorderPaintPlan(source),
        5,
      ),
      true,
    );
    assert.deepEqual(
      r.tileCalls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo'),
      [
        ['moveTo', ...ends[0]],
        ['lineTo', ...ends[1]],
      ],
    );
    assert.deepEqual(r.calls, [['fillRect', 10, 15, 60, 40]]);
  }
  const r = recordingContext();
  assert.equal(
    paintTableBorder(
      r.ctx,
      { x: 10, y: 20, width: 60, height: 40 },
      hwp5TableBorderPaintPlan(linear()),
      5,
    ),
    true,
  );
  assert.deepEqual(r.calls, [
    ['gradient', 10, 35, 70, 35],
    ['stop', 0, '#ff0000'],
    ['stop', 0.5, '#ff0000'],
    ['stop', 0.5, '#0000ff'],
    ['stop', 1, '#0000ff'],
    ['fillRect', 10, 15, 60, 40],
  ]);
});

test('round2 invalid gradient shapes/colors/parameters and mixed payloads cannot bypass opaque gates', () => {
  for (const change of [
    (s) => {
      s.gradient = null;
    },
    (s) => {
      s.gradient.colors = null;
    },
    (s) => {
      s.gradient.colors = ['#ff0000', '#0000ff'];
    },
    (s) => {
      s.gradient.colors = [0xff];
    },
    (s) => {
      s.gradient.positions = null;
    },
    (s) => {
      s.gradient.angle = -1;
    },
    (s) => {
      s.gradient.angle = 2 ** 32;
    },
    (s) => {
      s.gradient.center_y = NaN;
    },
    (s) => {
      s.gradient.blur = 256;
    },
    (s) => {
      s.gradient.blur_center = 101;
    },
    (s) => {
      s.additional_bytes = 2;
    },
    (s) => {
      s.image = {};
    },
    (s) => {
      s.pattern = { background: 0, foreground: 0, kind: -1 };
    },
    (s) => {
      s.alpha = { pattern: 0, gradient: 0, image: null };
    },
    (s) => {
      s.extra_bytes = 1;
    },
  ]) {
    const source = linear();
    change(source);
    const plan = hwp5TableBorderPaintPlan(source);
    assert.equal(plan.state, 'unavailable');
    assert.equal(plan.fill, undefined);
  }
});

test('round2 legacy alpha absence and arbitrary valid centers retain common approximate-gradient contract', () => {
  const source = linear();
  source.alpha = null;
  source.gradient.center_x = 20;
  source.gradient.center_y = 80;
  const fill = hwp5TableBorderPaintPlan(source).fill;
  assert.equal(fill.state, 'linear_gradient');
  assert.equal(fill.rasterParity, 'unverified');
  assert.deepEqual(fill.stops, [
    { offset: 0, color: '#ff0000' },
    { offset: 0.5, color: '#ff0000' },
    { offset: 0.5, color: '#0000ff' },
    { offset: 1, color: '#0000ff' },
  ]);
});

test('round3 table index preserves owner/resource isolation for newly supported fills', () => {
  const pattern = style();
  pattern.id = 1;
  pattern.pattern.kind = 2;
  const gradient = linear();
  gradient.id = 2;
  const table = {
    section: 0,
    tableNode: 20,
    cells: [
      { listNode: 21, layoutSource: { table_record_node: 20, list_node: 21, border_fill_id: 1 } },
      { listNode: 22, layoutSource: { table_record_node: 20, list_node: 22, border_fill_id: 2 } },
    ],
  };
  const content = { hwp5BorderFillSources: [pattern, gradient], tables: [table] };
  const before = structuredClone(content),
    index = hwp5TableBorderPaintIndex(content);
  assert.equal(index.cells.get('0:20:21').fill.kind, 'SLASH');
  assert.equal(index.cells.get('0:20:22').fill.state, 'linear_gradient');
  assert.deepEqual(content, before);
  for (const change of [
    (c) => c.hwp5BorderFillSources.push({ ...pattern }),
    (c) => c.tables[0].cells.push(structuredClone(table.cells[0])),
    (c) => {
      c.tables[0].cells[0].layoutSource.list_node = 22;
    },
    (c) => {
      c.tables[0].cells[0].layoutSource.table_record_node = 99;
    },
    (c) => {
      c.tables[0].cells[0].layoutSource.border_fill_id = 99;
    },
  ]) {
    const candidate = structuredClone(content);
    change(candidate);
    const plan = hwp5TableBorderPaintIndex(candidate).cells.get('0:20:21');
    assert.equal(plan.state, 'unavailable');
    assert.equal(plan.fill, undefined);
  }
});
