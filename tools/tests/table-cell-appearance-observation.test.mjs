import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeTableCellAppearance } from '../../js/table-cell-appearance-observation.mjs';
const captured = JSON.parse(
  readFileSync(
    new URL('./fixtures/table-cell-appearance-observation.json', import.meta.url),
    'utf8',
  ),
);
const target = (format) => ({
  section: 0,
  tableNode: format === 'hwp5' ? 20 : 59,
  listNode: format === 'hwp5' ? 21 : 66,
});
function fixture(format) {
  const content = structuredClone(captured.cases[format]),
    owner = target(format);
  const cell = content.tables[0].cells.find((cell) => cell.listNode === owner.listNode);
  const report = content.tableBorderSources?.find((report) => report.section === 0);
  const binding = report?.cells.find(
    (cell) => cell.table_node === owner.tableNode && cell.list_node === owner.listNode,
  );
  const style =
    format === 'hwp5'
      ? content.hwp5BorderFillSources[cell.layoutSource.border_fill_id - 1]
      : report.styles[binding.style_index];
  return {
    content,
    cell,
    report,
    binding,
    style,
    owner,
    observe: () => observeTableCellAppearance(content, owner),
  };
}
for (const format of ['hwp5', 'hwpx'])
  test(`round1 actual ${format} Noori current resource has independently expected #e7e7a5`, () => {
    const f = fixture(format),
      before = structuredClone(f.content),
      result = f.observe();
    assert.equal(result.state, 'known');
    assert.equal(result.fill.state, 'known');
    assert.equal(result.fill.kind, 'solid');
    assert.equal(result.fill.color, '#e7e7a5');
    assert.equal(result.source.styleId, format === 'hwp5' ? 19 : 0);
    for (const name of ['left', 'right', 'top', 'bottom']) {
      assert.equal(result.edges[name].state, 'known');
      assert.equal(result.edges[name].style, 'SOLID');
    }
    assert.deepEqual(
      Object.values(result.edges).map((edge) => edge.width),
      format === 'hwp5' ? [70, 70, 70, 70] : [70, 15, 70, 12],
    );
    assert.equal(result.edges.left.color, '#654321');
    assert.deepEqual(f.content, before);
    assert.equal(Object.isFrozen(result.fill.raw), true);
  });
for (const format of ['hwp5', 'hwpx']) {
  for (const mode of [
    'owner',
    'duplicate-table',
    'duplicate-cell',
    'partial',
    'limited',
    'missing-resource',
    'duplicate-style',
    'source-error',
  ])
    test(`round1 ${format} ${mode} cannot claim current values`, () => {
      const f = fixture(format);
      if (mode === 'owner') f.owner.listNode++;
      if (mode === 'duplicate-table') f.content.tables.push(structuredClone(f.content.tables[0]));
      if (mode === 'duplicate-cell') f.content.tables[0].cells.push(structuredClone(f.cell));
      if (mode === 'partial') f.content.tables[0].partial = true;
      if (mode === 'limited') f.content.limited = true;
      if (mode === 'missing-resource') {
        if (format === 'hwp5') f.cell.layoutSource.border_fill_id = 9999;
        else f.binding.style_index = 9999;
      }
      if (mode === 'duplicate-style') {
        if (format === 'hwp5') f.content.hwp5BorderFillSources.push(structuredClone(f.style));
        else f.report.styles.push(structuredClone(f.style));
      }
      if (mode === 'source-error') {
        if (format === 'hwp5') f.content.hwp5BorderFillSourceError = 'Failure';
        else f.content.tableBorderSourceErrors = [{ section: 0, error: 'Failure' }];
      }
      assert.equal(f.observe().state, 'unavailable');
    });
}
test('round1 HWP5 exact current owner binding is checked, not only its style ID', () => {
  for (const field of ['table_record_node', 'list_node']) {
    const f = fixture('hwp5');
    f.cell.layoutSource[field]++;
    assert.equal(f.observe().state, 'unavailable');
  }
});
test('round1 HWPX style ID/index and duplicate owner source cannot disagree', () => {
  const wrong = fixture('hwpx');
  wrong.binding.border_fill_id = 999;
  assert.equal(wrong.observe().state, 'unavailable');
  const duplicate = fixture('hwpx');
  duplicate.report.cells.push(structuredClone(duplicate.binding));
  assert.equal(duplicate.observe().state, 'unavailable');
});
function noFillH5(style) {
  Object.assign(style, {
    fill_flags: 0,
    fill_known: true,
    pattern: null,
    gradient: null,
    image: null,
    alpha: null,
    unknown_fill_bytes: null,
    additional_present: true,
    additional_bytes: 0,
    extra_bytes: 0,
  });
}
function noFillHX(style) {
  Object.assign(style, {
    fill_node: null,
    fill_report: null,
    semantic_fill_colors: [],
    semantic_face_colors: [],
  });
}
for (const format of ['hwp5', 'hwpx'])
  test(`round1 ${format} none is explicit and black remains an actual solid color`, () => {
    const f = fixture(format);
    if (format === 'hwp5') f.style.pattern.background = 0;
    else {
      f.style.fill_report.nodes[0].raw[0] = '#000000';
      f.style.semantic_fill_colors[0].rgb = 0;
      f.style.semantic_face_colors[0].rgb = 0;
    }
    assert.equal(f.observe().fill.color, '#000000');
    assert.equal(f.observe().fill.state, 'known');
    if (format === 'hwp5') noFillH5(f.style);
    else noFillHX(f.style);
    const fill = f.observe().fill;
    assert.equal(fill.state, 'none');
    assert.equal(fill.kind, 'none');
    assert.equal(Object.hasOwn(fill, 'color'), false);
  });
for (const format of ['hwp5', 'hwpx'])
  test(`round1 ${format} an observed NONE edge never invents missing width or color`, () => {
    const f = fixture(format);
    if (format === 'hwp5') f.style.borders[0] = { kind: 0, width: 255, color: 0xffffffff };
    else f.style.edges[0] = { style: 'NONE', width: null, color: null };
    const edge = f.observe().edges.left;
    assert.equal(edge.state, 'none');
    assert.equal(edge.style, 'NONE');
    assert.equal(Object.hasOwn(edge, 'width'), false);
    assert.equal(Object.hasOwn(edge, 'color'), false);
  });
test('round1 HWP5 unsupported style does not borrow a same-index HWPX enum', () => {
  const f = fixture('hwp5');
  f.style.borders[0].kind = 7;
  assert.equal(f.observe().edges.left.state, 'unsupported');
  assert.equal(Object.hasOwn(f.observe().edges.left, 'style'), false);
  f.style.borders[0].kind = 8;
  assert.equal(f.observe().edges.left.style, 'DOUBLE_SLIM');
});

for (const mode of [
  'missing',
  'unverified',
  'wrong-encoding',
  'double-swap',
  'missing-semantic',
  'wrong-owner',
  'duplicate-color',
])
  test(`round2 HWPX ${mode} color proof refuses canonical values rather than guessing channels`, () => {
    const f = fixture('hwpx');
    if (mode === 'missing') delete f.style.source_color_profile;
    if (mode === 'unverified') f.style.source_color_profile.verified = false;
    if (mode === 'wrong-encoding') f.style.source_color_profile.encoding = 'rgb24';
    if (mode === 'double-swap') {
      f.style.semantic_fill_colors[0].rgb = 0xa5e7e7;
      f.style.semantic_face_colors[0].rgb = 0xa5e7e7;
    }
    if (mode === 'missing-semantic') delete f.style.semantic_fill_colors;
    if (mode === 'wrong-owner') f.style.semantic_fill_colors[0].node++;
    if (mode === 'duplicate-color')
      f.style.semantic_fill_colors.push(structuredClone(f.style.semantic_fill_colors[0]));
    const observed = f.observe();
    assert.equal(observed.fill.state, 'unavailable');
    assert.notEqual(observed.fill.state, 'none');
    assert.equal(Object.hasOwn(observed.fill, 'color'), false);
    if (!['missing', 'unverified'].includes(mode)) assert.equal(observed.edges.left.state, 'known');
  });
test('round2 a verified RGB profile consumes canonical semantic RGB exactly once', () => {
  const f = fixture('hwpx');
  f.style.source_color_profile = { id: 'authored-verified-rgb', encoding: 'rgb24', verified: true };
  f.style.semantic_fill_colors[0].rgb = 0xa5e7e7;
  f.style.semantic_face_colors[0].rgb = 0xa5e7e7;
  assert.equal(f.observe().fill.color, '#a5e7e7');
});
function h5Variant(kind) {
  const f = fixture('hwp5');
  noFillH5(f.style);
  if (kind === 'hatch')
    Object.assign(f.style, {
      fill_flags: 1,
      pattern: { background: 0x0000ff, foreground: 0xff0000, kind: 4 },
      alpha: { pattern: 0, gradient: null, image: null },
    });
  if (kind === 'linear')
    Object.assign(f.style, {
      fill_flags: 4,
      additional_bytes: 1,
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
      alpha: { pattern: null, gradient: 0, image: null },
    });
  if (kind === 'image')
    Object.assign(f.style, {
      fill_flags: 2,
      image: { mode: 0, picture: { contrast: 0, brightness: 0, effect: 0, bin_data_id: 1 } },
      alpha: { pattern: null, gradient: null, image: 0 },
    });
  return f;
}
test('round2 HWP5 hatch observes independent foreground/background through COLORREF', () => {
  const f = h5Variant('hatch'),
    out = f.observe();
  assert.equal(out.state, 'known');
  assert.equal(out.fill.kind, 'hatch');
  assert.equal(out.fill.pattern, 'CROSS');
  assert.equal(out.fill.background, '#ff0000');
  assert.equal(out.fill.color, '#0000ff');
});
test('round2 HWP5 linear fill uses the shared gradient plan without flattening colors', () => {
  const out = h5Variant('linear').observe();
  assert.equal(out.fill.state, 'known');
  assert.equal(out.fill.kind, 'linear');
  assert.equal(out.fill.angle, 90);
  assert.equal(out.fill.stops[0].color, '#ff0000');
  assert.equal(out.fill.stops.at(-1).color, '#0000ff');
});
test('round2 an HWP5 image is read-only unsupported while four known edges survive', () => {
  const out = h5Variant('image').observe();
  assert.equal(out.state, 'unsupported');
  assert.equal(out.fill.kind, 'image');
  assert.equal(out.fill.raw.image.picture.bin_data_id, 1);
  assert.equal(out.edges.left.state, 'known');
});
for (const kind of ['mixed', 'unknown', 'alpha', 'extension', 'missing-color'])
  test(`round2 HWP5 ${kind} fill does not become a fake solid or none`, () => {
    const f = h5Variant('hatch');
    if (kind === 'mixed') {
      f.style.fill_flags = 3;
      f.style.image = h5Variant('image').style.image;
      f.style.alpha.image = 0;
    }
    if (kind === 'unknown')
      Object.assign(f.style, {
        fill_flags: 128,
        fill_known: false,
        unknown_fill_bytes: 4,
        pattern: null,
        gradient: null,
        image: null,
        alpha: null,
        additional_present: null,
        additional_bytes: null,
        extra_bytes: null,
      });
    if (kind === 'alpha') f.style.alpha.pattern = 128;
    if (kind === 'extension') {
      f.style.alpha = null;
      f.style.extra_bytes = 2;
    }
    if (kind === 'missing-color') f.style.pattern.foreground = 0xffffffff;
    const out = f.observe();
    assert.notEqual(out.fill.state, 'known');
    assert.notEqual(out.fill.state, 'none');
    assert.equal(out.edges.left.state, 'known');
  });
function hxVariant(kind) {
  const f = fixture('hwpx'),
    report = f.style.fill_report,
    brush = report.brushes[0],
    base = report.nodes[0];
  const node = (kind, element, parent = null) => ({
    ...structuredClone(base),
    kind,
    element_index: element,
    parent_node_index: parent,
    raw: Array(19).fill(null),
    direct_children: 0,
    recognized_children: 0,
    unknown_enums: 0,
    non_six_hex_colors: 0,
    other_attributes: 0,
  });
  const root = node(
    kind === 'linear' ? 'gradation' : kind === 'image' ? 'img_brush' : 'win_brush',
    321,
  );
  if (kind === 'hatch') {
    root.raw[0] = '#0000FF';
    root.raw[1] = '#FF0000';
    root.raw[2] = 'CROSS';
    root.raw[3] = '0';
    report.nodes = [root];
    report.kind_counts = [1, 0, 0, 0, 0];
    brush.child_counts = [1, 0, 0];
    f.style.semantic_fill_colors = [
      { node: 321, field: 'winBrush.faceColor', rgb: 0xff0000 },
      { node: 321, field: 'winBrush.hatchColor', rgb: 0x0000ff },
    ];
    f.style.semantic_face_colors = [{ node: 321, field: 'winBrush.faceColor', rgb: 0xff0000 }];
  } else if (kind === 'linear') {
    for (const [i, value] of [
      [4, 'LINEAR'],
      [5, '90'],
      [6, '50'],
      [7, '50'],
      [8, '2'],
      [9, '2'],
      [10, '50'],
      [11, '0'],
    ])
      root.raw[i] = value;
    root.direct_children = root.recognized_children = 2;
    const a = node('color', 322, 0),
      b = node('color', 323, 0);
    a.raw[13] = '#0000FF';
    b.raw[13] = '#FF0000';
    report.nodes = [root, a, b];
    report.kind_counts = [0, 1, 0, 2, 0];
    brush.child_counts = [0, 1, 0];
    f.style.semantic_fill_colors = [
      { node: 322, field: 'color.value', rgb: 0xff0000 },
      { node: 323, field: 'color.value', rgb: 0x0000ff },
    ];
    f.style.semantic_face_colors = [];
  } else {
    root.raw[12] = 'TOTAL';
    root.direct_children = root.recognized_children = 1;
    const image = node('image', 322, 0);
    for (const [i, value] of [
      [14, 'image1'],
      [15, '0'],
      [16, '0'],
      [17, 'REAL_PIC'],
      [18, '0'],
    ])
      image.raw[i] = value;
    report.nodes = [root, image];
    report.kind_counts = [0, 0, 1, 0, 1];
    brush.child_counts = [0, 0, 1];
    f.style.semantic_fill_colors = [];
    f.style.semantic_face_colors = [];
  }
  report.non_six_hex_colors = 0;
  report.unknown_enums = 0;
  brush.direct_children = 1;
  brush.other_attributes = 0;
  return f;
}
for (const kind of ['hatch', 'linear', 'image'])
  test(`round2 HWPX ${kind} remains distinct with verified source colors`, () => {
    const out = hxVariant(kind).observe();
    assert.equal(out.fill.kind, kind);
    assert.equal(out.fill.state, kind === 'image' ? 'unsupported' : 'known');
    assert.equal(out.edges.left.state, 'known');
    if (kind === 'hatch') {
      assert.equal(out.fill.background, '#ff0000');
      assert.equal(out.fill.color, '#0000ff');
    }
    if (kind === 'linear') {
      assert.equal(out.fill.stops[0].color, '#ff0000');
      assert.equal(out.fill.stops.at(-1).color, '#0000ff');
    }
    if (kind === 'image') assert.equal(out.fill.image.resourceId, 'image1');
  });
test('round2 HWPX unknown resource extensions cannot prove no-fill', () => {
  const f = fixture('hwpx');
  noFillHX(f.style);
  f.style.unknown_children = 1;
  assert.equal(f.observe().fill.state, 'unsupported');
  assert.notEqual(f.observe().fill.state, 'none');
});

for (const format of ['hwp5', 'hwpx'])
  test(`round3 ${format} follows the current resource binding instead of the first captured style`, () => {
    const f = fixture(format),
      first = f.observe();
    assert.equal(first.fill.color, '#e7e7a5');
    const style = structuredClone(f.style);
    if (format === 'hwp5') {
      style.id = f.content.hwp5BorderFillSources.length + 1;
      style.record_index = f.content.hwp5BorderFillSources.at(-1).record_index + 1;
      style.pattern.background = 0;
      f.content.hwp5BorderFillSources.push(style);
      f.cell.layoutSource.border_fill_id = style.id;
    } else {
      style.id = Math.max(...f.report.styles.map((style) => style.id)) + 1;
      style.node = Math.max(...f.report.styles.map((style) => style.node)) + 10;
      style.fill_node = style.node + 1;
      style.fill_report.brushes[0].element_index = style.fill_node;
      style.fill_report.brushes[0].parent_element_index = style.node;
      const node = style.fill_report.nodes[0];
      node.element_index = style.fill_node + 1;
      node.raw[0] = '#000000';
      style.semantic_fill_colors = style.semantic_fill_colors.map((value) => ({
        ...value,
        node: node.element_index,
        rgb: value.rgb === null ? null : 0,
      }));
      style.semantic_face_colors = style.semantic_face_colors.map((value) => ({
        ...value,
        node: node.element_index,
        rgb: 0,
      }));
      f.binding.style_index = f.report.styles.length;
      f.binding.border_fill_id = style.id;
      f.report.styles.push(style);
    }
    const rebound = f.observe();
    assert.equal(rebound.state, 'known');
    assert.equal(rebound.fill.color, '#000000');
    assert.equal(rebound.source.styleId, style.id);
    assert.equal(first.fill.color, '#e7e7a5');
  });
for (const format of ['hwp5', 'hwpx'])
  test(`round3 ${format} outer-frozen mutable descendants do not become a stale cache`, () => {
    const f = fixture(format);
    Object.freeze(f.content);
    const old = f.observe();
    if (format === 'hwp5') f.style.pattern.background = 0;
    else {
      f.style.fill_report.nodes[0].raw[0] = '#000000';
      f.style.semantic_fill_colors[0].rgb = 0;
      f.style.semantic_face_colors[0].rgb = 0;
    }
    assert.equal(f.observe().fill.color, '#000000');
    assert.equal(old.fill.color, '#e7e7a5');
  });
for (const format of ['hwp5', 'hwpx'])
  test(`round3 ${format} result owns nested raw arrays and never freezes or aliases the input`, () => {
    const f = fixture(format),
      out = f.observe();
    assert.equal(Object.isFrozen(f.style), false);
    const raw = format === 'hwp5' ? out.fill.raw.pattern : out.fill.raw.fill_report.nodes[0].raw;
    assert.equal(Object.isFrozen(raw), true);
    assert.throws(() => {
      raw.extra = 'mutation';
    }, TypeError);
    if (format === 'hwp5') f.style.pattern.background = 0;
    else f.style.fill_report.nodes[0].raw[0] = '#000000';
    assert.equal(out.fill.color, '#e7e7a5');
    assert.equal(
      format === 'hwp5'
        ? out.fill.raw.pattern.background
        : out.fill.raw.fill_report.nodes[0].raw[0],
      format === 'hwp5' ? 10872807 : '#A5E7E7',
    );
  });
test('round3 HWPX decimal widths are exact members of the shared hundredth-mm domain', () => {
  const f = fixture('hwpx');
  for (const width of ['0.700 mm', '0.70 mm', '0.7 mm']) {
    f.style.edges[0].width = width;
    assert.equal(f.observe().edges.left.width, 70);
  }
  for (const width of ['0.700000000001 mm', '0.45 mm', '0.7 pt', '', null]) {
    f.style.edges[0].width = width;
    const edge = f.observe().edges.left;
    assert.equal(Object.hasOwn(edge, 'width'), false);
    assert.equal(edge.state, 'unavailable');
  }
});
for (const format of ['hwp5', 'hwpx'])
  test(`round3 ${format} linear metadata is observed explicitly rather than filled with defaults`, () => {
    const f = format === 'hwp5' ? h5Variant('linear') : hxVariant('linear');
    const fill = f.observe().fill;
    assert.deepEqual([fill.centerX, fill.centerY, fill.step, fill.stepCenter], [50, 50, 2, 50]);
    if (format === 'hwp5') f.style.gradient.center_x = 999;
    else f.style.fill_report.nodes[0].raw[6] = null;
    const unknown = f.observe().fill;
    assert.equal(Object.hasOwn(unknown, 'centerX'), false);
    assert.notEqual(unknown.raw, undefined);
  });
test('round3 malformed query keys cannot inject source format or request authority', () => {
  const f = fixture('hwp5');
  for (const owner of [
    { ...f.owner, format: 'forged' },
    { ...f.owner, token: {} },
    { ...f.owner, listNode: -1 },
    { ...f.owner, tableNode: NaN },
    Object.create(f.owner),
    null,
  ]) {
    const out = observeTableCellAppearance(f.content, owner);
    assert.equal(out.state, 'unavailable');
    assert.equal(out.source, undefined);
  }
  const result = f.observe();
  assert.equal(result.token, undefined);
  assert.equal(result.capabilities, undefined);
  assert.equal(result.dispatch, undefined);
});
test('round3 HWPX missing fill and absent resource do not become no-fill', () => {
  const f = fixture('hwpx');
  delete f.style.fill_report;
  assert.equal(f.observe().state, 'unavailable');
  assert.notEqual(f.observe().fill.state, 'none');
  const absent = fixture('hwpx');
  absent.binding.border_fill_id = null;
  absent.binding.style_index = null;
  assert.equal(absent.observe().state, 'unavailable');
  assert.notEqual(absent.observe().fill.state, 'none');
});
test('round3 partial component failures preserve unrelated observed values', () => {
  const f = fixture('hwpx');
  f.style.edges[0] = null;
  const partial = f.observe();
  assert.equal(partial.edges.left.state, 'unavailable');
  assert.equal(partial.edges.right.state, 'known');
  assert.equal(partial.fill.state, 'known');
  assert.equal(partial.fill.color, '#e7e7a5');
  const image = hxVariant('image').observe();
  assert.equal(image.fill.state, 'unsupported');
  assert.equal(image.edges.left.state, 'known');
});
test('round3 a duplicate section report is not silently selected by array order', () => {
  const f = fixture('hwpx');
  f.content.tableBorderSources.push(structuredClone(f.report));
  assert.equal(f.observe().state, 'unavailable');
});
test('round3 observation traverses a full table only once and has no geometry/selection dependency', () => {
  const f = fixture('hwp5'),
    cells = f.content.tables[0].cells;
  let reads = 0;
  f.content.tables[0].cells = new Proxy(cells, {
    get(target, key, receiver) {
      if (/^\d+$/.test(String(key))) reads++;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(f.observe().state, 'known');
  assert.equal(reads, cells.length);
});

test('round3 empty HWP5 fill with an unexplained extension is unsupported rather than none', () => {
  const f = fixture('hwp5');
  noFillH5(f.style);
  f.style.additional_bytes = 1;
  assert.equal(f.observe().fill.state, 'unsupported');
  assert.notEqual(f.observe().fill.state, 'none');
  assert.equal(f.observe().edges.left.state, 'known');
});

for (const [rawKind, expected] of [
  [0, 'HORIZONTAL'],
  [1, 'VERTICAL'],
  [2, 'SLASH'],
  [3, 'BACK_SLASH'],
  [4, 'CROSS'],
  [5, 'CROSS_DIAGONAL'],
])
  test(`hatch-domain HWP5 Native-owned Noori-derived BorderFill raw${rawKind} is ${expected}`, () => {
    const f = h5Variant('hatch');
    f.style.pattern.kind = rawKind;
    const result = f.observe();
    assert.equal(result.fill.state, 'known');
    assert.equal(result.fill.pattern, expected);
    assert.equal(result.fill.background, '#ff0000');
    assert.equal(result.fill.color, '#0000ff');
    assert.equal(result.fill.raw.pattern.kind, rawKind);
  });
test('hatch-domain HWP5 raw6 is unsupported, while raw-1 remains observed solid', () => {
  const f = h5Variant('hatch');
  f.style.pattern.kind = 6;
  assert.equal(f.observe().fill.state, 'unsupported');
  assert.equal(f.observe().fill.kind, 'hatch');
  f.style.pattern.kind = -1;
  assert.equal(f.observe().fill.state, 'known');
  assert.equal(f.observe().fill.kind, 'solid');
  assert.equal(f.observe().fill.color, '#ff0000');
  assert.equal(Object.hasOwn(f.observe().fill, 'pattern'), false);
});
for (const pattern of ['HORIZONTAL', 'VERTICAL', 'BACK_SLASH', 'SLASH', 'CROSS', 'CROSS_DIAGONAL'])
  test(`hatch-domain HWPX ${pattern} remains an XML enum with profile-canonical colors`, () => {
    const f = hxVariant('hatch');
    f.style.fill_report.nodes[0].raw[2] = pattern;
    const result = f.observe();
    assert.equal(result.fill.state, 'known');
    assert.equal(result.fill.pattern, pattern);
    assert.equal(result.fill.background, '#ff0000');
    assert.equal(result.fill.color, '#0000ff');
  });

for (const format of ['hwp5', 'hwpx']) {
  test(`source colors ${format} keeps two canonical source colors distinct from four generated stops`, () => {
    const f = format === 'hwp5' ? h5Variant('linear') : hxVariant('linear');
    const out = f.observe();
    assert.equal(out.fill.state, 'known');
    assert.deepEqual(out.fill.colors, ['#ff0000', '#0000ff']);
    assert.equal(out.fill.stops.length, 4);
    assert.equal(Object.isFrozen(out.fill.colors), true);
    assert.throws(() => out.fill.colors.push('#ffffff'), TypeError);
  });
  test(`source colors ${format} retains all three source colors without endpoint collapse`, () => {
    const f = format === 'hwp5' ? h5Variant('linear') : hxVariant('linear');
    if (format === 'hwp5') {
      f.style.gradient.colors.splice(1, 0, 0x00ff00);
      f.style.gradient.positions = [0, 50, 100];
    } else {
      const report = f.style.fill_report;
      const root = report.nodes[0];
      const third = structuredClone(report.nodes[2]);
      third.element_index = 324;
      third.raw[13] = '#00FF00';
      report.nodes.push(third);
      root.direct_children = root.recognized_children = 3;
      root.raw[9] = '3';
      report.kind_counts[3] = 3;
      f.style.semantic_fill_colors.push({ node: 324, field: 'color.value', rgb: 0x00ff00 });
    }
    const out = f.observe();
    assert.equal(out.fill.kind, 'linear');
    assert.deepEqual(
      out.fill.colors,
      format === 'hwp5' ? ['#ff0000', '#00ff00', '#0000ff'] : ['#ff0000', '#0000ff', '#00ff00'],
    );
    assert.equal(Object.isFrozen(out.fill.colors), true);
  });
}
test('source colors HWPX refuses a mismatched profile rather than double swapping gradient colors', () => {
  const f = hxVariant('linear');
  f.style.source_color_profile.encoding = 'rgb24';
  const out = f.observe();
  assert.equal(out.fill.state, 'unavailable');
  assert.equal(out.fill.colors, undefined);
});
test('source colors HWPX unverified profile never exposes a seed array', () => {
  const f = hxVariant('linear');
  f.style.source_color_profile.verified = false;
  assert.equal(f.observe().fill.colors, undefined);
});
test('source colors HWP5 unknown color does not become black in a seed array', () => {
  const f = h5Variant('linear');
  f.style.gradient.colors[0] = 0xffffffff;
  assert.equal(f.observe().fill.colors, undefined);
});
