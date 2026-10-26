import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartPointTable } from '../../web/preview/chart-point-table.mjs';
import { createChartControls } from '../../web/preview/chart-controls.mjs';

class Element extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.ownerDocument = { createElement: (name) => new Element(name) };
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...children);
    this.value = children[0]?.value ?? '';
  }
  focus() {
    this.focused = true;
  }
  setAttribute(name, value) {
    (this.attributes ??= new Map()).set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes?.get(name) ?? null;
  }
  contains(child) {
    for (let node = child; node; node = node.parent) if (node === this) return true;
    return false;
  }
  closest() {
    return this.tag === 'button' ? this : this.parent?.closest();
  }
}
const click = (body, target) => {
  const event = new Event('click');
  Object.defineProperty(event, 'target', { value: target });
  body.dispatchEvent(event);
};

test('chart target transitions invalidate pending queries even while busy', async (t) => {
  const form = new Element(),
    fields = new Element(),
    targets = new Element(),
    points = new Element(),
    input = new Element(),
    note = new Element();
  let ready = true;
  const requests = [],
    controls = createChartControls({
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
  t.after(() => controls.close());
  controls.message({
    kind: 'enable',
    content: {
      chartEditAvailable: true,
      chartTargets: [
        { section: 0, wrapper: 9 },
        { section: 0, wrapper: 10 },
      ],
    },
  });
  await Promise.resolve();
  const stale = requests.shift();
  ready = false;
  for (const target of ['1', '0']) {
    targets.value = target;
    targets.dispatchEvent(new Event('change'));
  }
  assert.equal(requests.length, 0, 'busy transitions must not send new queries');
  controls.message({
    ...stale,
    chart: { values: { points: [{ kind: 'numeric_cache', index: 0, value: 'stale' }] } },
  });
  assert.equal(
    input.value,
    '',
    'returning to the same target must not revive its obsolete response',
  );
  assert.equal(points.children.length, 0);
  ready = true;
  targets.dispatchEvent(new Event('change'));
  const fresh = requests.shift();
  assert.ok(fresh.requestId > stale.requestId);
  controls.message({
    ...fresh,
    chart: { values: { points: [{ kind: 'numeric_cache', index: 0, value: 'current' }] } },
  });
  assert.equal(input.value, 'current');
  assert.equal(fields.disabled, false);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(requests.shift().value, 'current');
});

test('chart Escape discards only uncommitted drafts and preserves raw native spelling', async (t) => {
  const form = new Element(),
    fields = new Element(),
    targets = new Element(),
    points = new Element(),
    input = new Element(),
    note = new Element();
  let visible = '',
    ready = true;
  Object.defineProperty(input, 'value', {
    get: () => visible,
    set: (value) => {
      visible = String(value).replace(/\r\n?/g, '\n');
    },
  });
  const requests = [],
    controls = createChartControls({
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
  t.after(() => controls.close());
  controls.message({
    kind: 'enable',
    content: {
      chartEditAvailable: true,
      chartStringEditAvailable: true,
      chartTargets: [{ section: 0, wrapper: 9 }],
    },
  });
  await Promise.resolve();
  const chart = { values: { points: [{ index: 0, kind: 'string_cache', value: '원래\r\n다음' }] } };
  controls.message({ ...requests.shift(), chart });
  await Promise.resolve();
  const key = (values = {}, prevented = false) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { key: 'Escape', ...values });
    let stopped = 0;
    const stop = event.stopPropagation.bind(event);
    event.stopPropagation = () => {
      stopped++;
      stop();
    };
    if (prevented) event.preventDefault();
    input.dispatchEvent(event);
    return { event, stopped };
  };
  assert.equal(input.value, '원래\n다음');
  assert.equal(key().event.defaultPrevented, false);
  input.value = '임시값';
  input.dispatchEvent(new Event('input'));
  for (const values of [
    { isComposing: true },
    { keyCode: 229 },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { repeat: true },
    { key: 'Enter' },
  ]) {
    const result = key(values);
    assert.equal(result.event.defaultPrevented, false);
    assert.equal(result.stopped, 0);
    assert.equal(input.value, '임시값');
  }
  assert.equal(key({}, true).stopped, 0);
  assert.equal(input.value, '임시값');
  ready = false;
  assert.equal(key().event.defaultPrevented, false);
  assert.equal(input.value, '임시값');
  ready = true;
  const discarded = key();
  assert.equal(discarded.event.defaultPrevented, true);
  assert.equal(discarded.stopped, 1);
  assert.equal(input.value, '원래\n다음');
  assert.equal(requests.length, 0);
  assert.equal(chart.values.points[0].value, '원래\r\n다음');
  assert.equal(note.textContent, '미적용 차트 입력을 취소했습니다.');
  assert.equal(
    key().event.defaultPrevented,
    false,
    'an unchanged Escape belongs to the surrounding UI',
  );
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(
    requests.shift().value,
    '원래\r\n다음',
    'discard must restore untouched native CR spelling rather than commit textarea normalization',
  );
  input.value = '닫힌 뒤';
  input.dispatchEvent(new Event('input'));
  controls.close();
  assert.equal(key().event.defaultPrevented, false);
  assert.equal(input.value, '닫힌 뒤');
  assert.equal(requests.length, 0);
});

test('chart current marker reads only canonical ordinal selection across pages and refused picks', () => {
  const body = new Element(),
    previous = new Element(),
    next = new Element(),
    note = new Element();
  const chart = {
    values: {
      points: Array.from({ length: 130 }, () => ({
        index: 0,
        kind: 'numeric_cache',
        value: 'original',
      })),
    },
  };
  const baseline = structuredClone(chart);
  let selected = 65,
    reads = 0;
  const picks = [];
  const table = createChartPointTable({
    body,
    previous,
    next,
    note,
    getChart: () => chart,
    getSelected: () => {
      reads++;
      return selected;
    },
    accepts: () => true,
    ready: () => true,
    select: (ordinal) => {
      picks.push(ordinal);
      return false;
    },
  });
  const current = () =>
    body.children.flatMap((row) =>
      row.children[0].children[0].getAttribute('aria-current') === 'true'
        ? [row.children[0].children[0].dataset.chartPoint]
        : [],
    );
  table.reveal(65);
  assert.deepEqual(current(), ['65']);
  assert.equal(body.children[1].children[0].children[0].style.fontWeight, '700');
  assert.equal(body.children[0].children[0].children[0].style.fontWeight, '');
  click(body, body.children[0].children[0].children[0]);
  table.refresh();
  assert.deepEqual(picks, [64]);
  assert.deepEqual(current(), ['65'], 'a refused pick must not create table-owned selection');
  selected = 66;
  table.refresh();
  assert.deepEqual(current(), ['66']);
  for (selected of [null, undefined, -1, 0.5, NaN, Infinity, '66', 130]) {
    table.refresh();
    assert.deepEqual(current(), []);
  }
  selected = 0;
  table.reveal(0);
  assert.deepEqual(current(), ['0']);
  assert.deepEqual(chart, baseline, 'selection display must not mutate native values');
  table.close();
  const afterClose = reads;
  table.refresh();
  assert.equal(reads, afterClose);
  assert.equal(body.children.length, 0);
});

test('chart table selection shares canonical form submission and clears stale rows on refresh', async () => {
  const form = new Element(),
    fields = new Element(),
    targets = new Element(),
    points = new Element(),
    input = new Element(),
    note = new Element();
  const body = new Element(),
    previous = new Element(),
    next = new Element(),
    pageNote = new Element();
  const nodes = {
    '[data-chart-point-body]': body,
    '[data-chart-point-previous]': previous,
    '[data-chart-point-next]': next,
    '[data-chart-point-page]': pageNote,
  };
  form.querySelector = (selector) => nodes[selector] ?? null;
  const requests = [];
  let ready = true;
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
  const content = {
    chartEditAvailable: true,
    chartStringEditAvailable: true,
    chartTargets: [{ section: 0, wrapper: 9 }],
  };
  controls.message({ kind: 'enable', content });
  await Promise.resolve();
  const chart = {
    values: {
      points: Array.from({ length: 130 }, (_, index) => ({
        index,
        kind: 'numeric_cache',
        value: String(index),
      })),
    },
  };
  controls.message({ ...requests.shift(), chart });
  assert.equal(body.children[0].children[0].children[0].getAttribute('aria-current'), 'true');
  next.dispatchEvent(new Event('click'));
  const old = body.children[1].children[0].children[0];
  click(body, old);
  assert.equal(points.value, '65');
  assert.equal(input.value, '65');
  assert.equal(input.focused, true);
  assert.equal(body.children[1].children[0].children[0].getAttribute('aria-current'), 'true');
  assert.equal(body.children[0].children[0].children[0].getAttribute('aria-current'), 'false');
  assert.equal(requests.length, 0, 'table selection never submits an edit');
  input.value = '7.70';
  input.dispatchEvent(new Event('input'));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.deepEqual(requests.shift(), {
    kind: 'chart-point',
    section: 0,
    wrapper: 9,
    point: 65,
    value: '7.70',
  });
  assert.equal(chart.values.points[65].value, '65', 'draft must not mutate canonical values');
  controls.message({ kind: 'chart-point', content });
  await Promise.resolve();
  assert.equal(body.children.length, 0, 'old values are unavailable while querying');
  const current = {
    values: {
      points: chart.values.points.map((point, i) =>
        i === 65 ? { ...point, value: '7.70' } : point,
      ),
    },
  };
  controls.message({ ...requests.shift(), chart: current });
  assert.equal(input.value, '7.70');
  assert.equal(body.children[1].children[1].textContent, '7.70');
  assert.equal(body.children[1].children[0].children[0].getAttribute('aria-current'), 'true');
  assert.match(pageNote.textContent, /2\/3쪽/);
  click(body, old);
  assert.equal(requests.length, 0);
  ready = false;
  controls.message({ kind: 'save' });
  assert.equal(fields.disabled, true);
  assert.ok(body.children.every((row) => row.children[0].children[0].disabled));
  controls.message({ kind: 'load', error: 'InvalidDocument' });
  assert.equal(
    form.hidden,
    true,
    'failed new document must not keep previous chart targets visible',
  );
  assert.equal(targets.children.length, 0);
  assert.equal(points.children.length, 0);
  assert.equal(input.value, '');
  assert.equal(body.children.length, 0);
  controls.message({ kind: 'chart-points', requestId: 2, section: 0, wrapper: 9, chart: current });
  assert.equal(body.children.length, 0, 'late previous-document query must stay rejected');
  ready = true;
  controls.message({ kind: 'enable', content });
  await Promise.resolve();
  const unlockedQuery = requests.shift();
  controls.message({ ...unlockedQuery, chart: current });
  assert.equal(points.value, '0', 'a fresh session must not retain the old selected point');
  assert.equal(input.value, '0');
  assert.equal(body.children[0].children[0].children[0].getAttribute('aria-current'), 'true');
  controls.message({ kind: 'unlock', error: 'WrongPassword' });
  assert.equal(form.hidden, true);
  assert.equal(input.value, '');
  assert.equal(body.children.length, 0);
  controls.message({ ...unlockedQuery, chart: current });
  assert.equal(body.children.length, 0, 'late pre-unlock query must stay rejected');
  controls.close();
  controls.close();
  assert.equal(body.children.length, 0);
  assert.equal(form.hidden, true);
  click(body, old);
  assert.equal(requests.length, 0);
});

test('chart table paginates all canonical values and selection never writes a draft', () => {
  const body = new Element(),
    previous = new Element(),
    next = new Element(),
    note = new Element();
  let chart = {
    values: {
      points: Array.from({ length: 130 }, (_, index) => ({
        index,
        kind: index === 64 ? 'string_cache' : 'numeric_cache',
        value: index === 0 ? '<img>\r\n\t😀' : String(index),
      })),
    },
  };
  let ready = true;
  const selected = [];
  const table = createChartPointTable({
    body,
    previous,
    next,
    note,
    getChart: () => chart,
    accepts: (kind) => kind === 'numeric_cache',
    ready: () => ready,
    select: (index) => selected.push(index),
  });
  table.refresh();
  assert.equal(body.children.length, 64);
  assert.equal(body.children[0].children[1].textContent, '<img>\r\n\t😀');
  assert.equal(body.children[0].children[1].style.whiteSpace, 'pre-wrap');
  assert.equal(previous.disabled, true);
  assert.match(note.textContent, /1\/3쪽.*130/);
  const first = body.children[0].children[0].children[0];
  click(body, first);
  assert.deepEqual(selected, [0]);
  next.dispatchEvent(new Event('click'));
  assert.equal(body.children.length, 64);
  assert.equal(body.children[0].children[0].children[0].disabled, true);
  click(body, first);
  assert.deepEqual(selected, [0], 'detached old rows must not select a current point');
  next.dispatchEvent(new Event('click'));
  assert.equal(body.children.length, 2);
  assert.equal(next.disabled, true);
  table.reveal(65);
  const target = body.children[1].children[0].children[0];
  click(body, target);
  assert.deepEqual(selected, [0, 65]);
  for (const invalid of ['', '-1', '0.5', '1e0', '130', '9007199254740992']) {
    target.dataset.chartPoint = invalid;
    click(body, target);
  }
  assert.deepEqual(selected, [0, 65]);
  ready = false;
  table.refresh();
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, true);
  assert.ok(body.children.every((row) => row.children[0].children[0].disabled));
  chart = { values: { points: [{ kind: 'numeric_cache', index: 0, value: 'new current value' }] } };
  ready = true;
  table.refresh();
  assert.equal(body.children[0].children[1].textContent, 'new current value');
  assert.equal(chart.values.points[0].value, 'new current value');
  table.close();
  table.close();
  assert.equal(body.children.length, 0);
  click(body, target);
  next.dispatchEvent(new Event('click'));
  assert.deepEqual(selected, [0, 65]);
});
