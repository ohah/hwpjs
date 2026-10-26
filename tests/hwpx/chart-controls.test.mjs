import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartControls } from '../../web/preview/chart-controls.mjs';
import { createChartCanvasControls } from '../../web/preview/chart-canvas-controls.mjs';
import { chartAnchorAtPoint } from '../../web/preview/chart-anchor-geometry.mjs';
import { createChartOlePolicyControls } from '../../web/preview/chart-ole-policy-controls.mjs';

test('chart controls disable charts without supported points and reject invalid selections', async () => {
  const element = () => ({
    value: '',
    listeners: new Map(),
    addEventListener(kind, fn) {
      this.listeners.set(kind, fn);
    },
    removeEventListener(kind) {
      this.listeners.delete(kind);
    },
    replaceChildren(...children) {
      this.children = children;
      this.value = children[0]?.value ?? '';
    },
  });
  const form = element(),
    fields = element(),
    targets = element(),
    points = element(),
    input = element(),
    note = element();
  form.ownerDocument = { createElement: element };
  const requests = [];
  const controls = createChartControls({
    form,
    fields,
    targets,
    points,
    input,
    note,
    ready: () => true,
    request: (message) => {
      requests.push(message);
      return true;
    },
  });
  const load = async (values) => {
    controls.message({
      kind: 'enable',
      content: { chartEditAvailable: true, chartTargets: [{ section: 0, wrapper: 9 }] },
    });
    await Promise.resolve();
    controls.message({ ...requests.shift(), chart: { values: { points: values } } });
  };
  await load([]);
  assert.equal(fields.disabled, true, 'a chart with no values has no editable selection');
  await load([{ kind: 'string_cache', index: 0, value: 'title' }]);
  assert.equal(fields.disabled, true, 'numeric-only ABI must not enable a string-only chart');
  await load([{ kind: 'numeric_cache', index: 0, value: '4.30' }]);
  assert.equal(fields.disabled, false);
  for (const value of ['', '-1', '0.5', 'NaN', 'Infinity', '5']) {
    points.value = value;
    points.listeners.get('change')();
    assert.equal(fields.disabled, true, `invalid selected ordinal ${JSON.stringify(value)}`);
    form.listeners.get('submit')({ preventDefault() {} });
    assert.equal(requests.length, 0);
  }
  controls.close();
});

test('chart policy change permits same-file reselection without requesting session mutation', () => {
  const checkbox = new EventTarget(),
    file = { value: 'selected.hwpx' },
    note = { textContent: '' };
  const controls = createChartOlePolicyControls({ checkbox, file, note });
  checkbox.dispatchEvent(new Event('change'));
  assert.equal(file.value, '');
  assert.match(note.textContent, /현재 편집 세션은 바뀌지 않았습니다/);
  controls.close();
  controls.close();
  file.value = 'kept.hwpx';
  checkbox.dispatchEvent(new Event('change'));
  assert.equal(file.value, 'kept.hwpx');
});

test('chart string textarea preserves untouched CR spelling and commits explicit multiline drafts', async () => {
  const element = () => ({
    value: '',
    listeners: new Map(),
    addEventListener(kind, fn) {
      this.listeners.set(kind, fn);
    },
    removeEventListener(kind) {
      this.listeners.delete(kind);
    },
    replaceChildren(...children) {
      this.children = children;
      this.value = children[0]?.value ?? '';
    },
  });
  const form = element(),
    fields = element(),
    targets = element(),
    points = element(),
    input = element(),
    note = element();
  form.ownerDocument = { createElement: element };
  let visible = '';
  Object.defineProperty(input, 'value', {
    get: () => visible,
    set: (value) => {
      visible = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    },
  });
  const requests = [];
  const controls = createChartControls({
    form,
    fields,
    targets,
    points,
    input,
    note,
    ready: () => true,
    request: (message) => {
      requests.push(message);
      return true;
    },
  });
  controls.message({
    kind: 'enable',
    content: {
      chartEditAvailable: true,
      chartStringEditAvailable: true,
      chartTargets: [{ section: 0, wrapper: 9 }],
    },
  });
  await Promise.resolve();
  const query = requests.shift();
  const chart = {
    values: { points: [{ kind: 'string_cache', index: 0, cache_node: 2, value: 'a\r\nb' }] },
  };
  controls.message({ ...query, chart });
  assert.equal(points.children.length, 1);
  assert.equal(input.value, 'a\nb');
  const submit = () => form.listeners.get('submit')({ preventDefault() {} });
  submit();
  assert.equal(
    requests.shift().value,
    'a\r\nb',
    'untouched textarea normalization must not rewrite canonical value',
  );
  input.value = 'x\ny';
  input.listeners.get('input')();
  submit();
  assert.deepEqual(requests.shift(), {
    kind: 'chart-point',
    section: 0,
    wrapper: 9,
    point: 0,
    value: 'x\ny',
  });
  assert.equal(chart.values.points[0].value, 'a\r\nb');
  controls.close();
  assert.equal(input.listeners.size, 0);
});

test('chart glyph hits respect source spelling, affine rotation, clip and singular matrices', () => {
  const chart = { section: 0, wrapper: 9, paragraph: 0, anchorUnit: 0, error_name: null };
  const content = {
    chartEditAvailable: true,
    chartTargets: [chart],
    paragraphs: [{ section: 0, paragraph: 0, text: '\ufffc' }],
  };
  const row = {
    section: 0,
    paragraph: 0,
    editable: true,
    startUnit: 0,
    endUnit: 1,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 8 },
    ],
    x: 10,
    y: 20,
    textTop: 0,
    textHeight: 8,
  };
  assert.equal(chartAnchorAtPoint(content, { rows: [row] }, 14, 24), chart);
  assert.equal(
    chartAnchorAtPoint(
      content,
      { rows: [{ ...row, transform: [0, 1, -1, 0, 100, 200] }] },
      76,
      214,
    ),
    chart,
  );
  assert.equal(
    chartAnchorAtPoint(content, { rows: [{ ...row, transform: [0, 0, 0, 0, 0, 0] }] }, 14, 24),
    null,
  );
  assert.equal(
    chartAnchorAtPoint(
      content,
      { rows: [{ ...row, pageClip: { x: 0, y: 0, width: 10, height: 10 } }] },
      14,
      24,
    ),
    null,
  );
  assert.equal(
    chartAnchorAtPoint(
      { ...content, paragraphs: [{ section: 0, paragraph: 0, text: 'A' }] },
      { rows: [row] },
      14,
      24,
    ),
    null,
  );
  assert.equal(
    chartAnchorAtPoint({ ...content, chartEditAvailable: false }, { rows: [row] }, 14, 24),
    null,
  );
  assert.equal(
    chartAnchorAtPoint(
      { ...content, chartTargets: [{ ...chart, error_name: 'MissingProtectedDisplayAnchor' }] },
      { rows: [row] },
      14,
      24,
    ),
    null,
  );
  assert.equal(chartAnchorAtPoint(content, { rows: [row] }, NaN, 24), null);
});

test('chart canvas maps zoom and scroll, ignores modified clicks and detaches', () => {
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20 });
  const viewport = { scrollTop: 100, scrollLeft: 40 };
  let ready = false,
    calls = 0;
  const chart = { section: 0, wrapper: 9 };
  const renderer = {
    viewScale: () => 2,
    chartAtLogicalPoint(x, y) {
      calls++;
      assert.equal(x, 30);
      assert.equal(y, 60);
      return chart;
    },
  };
  const selected = [];
  const controller = createChartCanvasControls({
    canvas,
    viewport,
    renderer,
    ready: () => ready,
    select: (value) => {
      selected.push(value);
      return true;
    },
  });
  const click = (extra = {}) => {
    const event = new Event('pointerdown', { cancelable: true });
    Object.assign(event, { button: 0, clientX: 30, clientY: 40, ...extra });
    canvas.dispatchEvent(event);
    return event;
  };
  assert.equal(click().defaultPrevented, false);
  ready = true;
  assert.equal(click({ shiftKey: true }).defaultPrevented, false);
  assert.equal(click().defaultPrevented, true);
  assert.deepEqual(selected, [chart]);
  controller.close();
  click();
  assert.equal(calls, 1);
});

test('chart drafts reject stale queries, wait for readiness and detach listeners', async () => {
  const element = () => ({
    value: '',
    listeners: new Map(),
    addEventListener(kind, fn) {
      this.listeners.set(kind, fn);
    },
    removeEventListener(kind) {
      this.listeners.delete(kind);
    },
    replaceChildren(...children) {
      this.children = children;
      this.value = children[0]?.value ?? '';
    },
  });
  const form = element(),
    fields = element(),
    targets = element(),
    points = element(),
    input = element(),
    note = element();
  form.ownerDocument = { createElement: element };
  let ready = true;
  const requests = [];
  const controls = createChartControls({
    form,
    fields,
    targets,
    points,
    input,
    note,
    ready: () => ready,
    request: (message) => {
      requests.push(message);
      return true;
    },
  });
  controls.message({
    kind: 'enable',
    content: { chartEditAvailable: true, chartTargets: [{ section: 0, wrapper: 9 }] },
  });
  await Promise.resolve();
  const query = requests.shift();
  assert.equal(query.kind, 'chart-points');
  const chart = {
    values: {
      points: [
        { kind: 'string_cache', index: 0, value: 'title' },
        { kind: 'numeric_cache', index: 0, value: '4.30' },
        { kind: 'numeric_cache', index: 1, value: '9.20' },
      ],
    },
  };
  controls.message({ ...query, requestId: query.requestId - 1, chart });
  assert.equal(fields.disabled, true);
  controls.message({ ...query, chart });
  assert.equal(points.children.length, 2);
  assert.equal(points.value, '1');
  assert.equal(input.value, '4.30');
  input.value = '6.70';
  const submit = () => form.listeners.get('submit')({ preventDefault() {} });
  ready = false;
  submit();
  assert.equal(requests.length, 0);
  ready = true;
  submit();
  assert.deepEqual(requests.shift(), {
    kind: 'chart-numeric-point',
    section: 0,
    wrapper: 9,
    point: 1,
    value: '6.70',
  });
  assert.equal(chart.values.points[1].value, '4.30', 'draft does not mutate canonical response');
  points.value = '2';
  points.listeners.get('change')();
  assert.equal(input.value, '9.20');
  controls.message({
    kind: 'chart-numeric-point',
    content: { chartEditAvailable: true, chartTargets: [{ section: 0, wrapper: 9 }] },
  });
  await Promise.resolve();
  const refresh = requests.shift();
  controls.message({
    ...refresh,
    chart: {
      values: {
        points: chart.values.points.map((row, index) =>
          index === 2 ? { ...row, value: '7.70' } : row,
        ),
      },
    },
  });
  assert.equal(points.value, '2', 'refresh retains selected point, not first numeric value');
  assert.equal(input.value, '7.70');
  controls.close();
  assert.equal(form.listeners.size + targets.listeners.size + points.listeners.size, 0);
  assert.equal(form.hidden, true);
});
