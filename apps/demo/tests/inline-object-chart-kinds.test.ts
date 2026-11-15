import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all, fire } from './fake-dom.mjs';
import { createInlineObjectInsertDataGrid } from '../src/inline-object-insert-data-grid.ts';
import { createInlineObjectInsertDialog } from '../src/inline-object-insert-dialog.ts';
import { createChartTypeOptions } from '../src/inline-object-insert-chart-type-options.ts';
import { checkedChartCreateOptions } from '../../../js/hwpx-inline-object-insert.mjs';
import { profiles } from '../../../tests/chart-kinds-fixtures.mjs';

function fixture() {
  const doc = new Document(),
    create = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const node = create(tag);
    Object.assign(node, {
      insertBefore(child: typeof node, before: typeof node | null) {
        if (before === null) node.append(child);
        else {
          assert.equal(before.parentElement, node);
          child.remove();
          child.parentElement = node;
          node.children.splice(node.children.indexOf(before), 0, child);
        }
        return child;
      },
      showModal() {
        node.open = true;
      },
      close() {
        node.open = false;
      },
    });
    return node;
  };
  const host = doc.createElement('main');
  const visible = (node: ReturnType<typeof create>) => {
    for (let p: typeof node | undefined = node; p; p = p.parentElement) if (p.hidden) return false;
    return true;
  };
  const nodes = (predicate: (node: ReturnType<typeof create>) => boolean) =>
    all(host, (node: ReturnType<typeof create>) => visible(node) && predicate(node));
  function input(label: string) {
    const found = nodes((n) => n.getAttribute('aria-label') === label);
    assert.equal(found.length, 1, label);
    return found[0];
  }
  function edit(label: string, value: string) {
    const n = input(label);
    n.value = value;
    fire(n, 'input');
    return n;
  }
  function select(label: string, value: string) {
    const n = input(label);
    n.value = value;
    fire(n, 'change');
    return n;
  }
  function button(text: string) {
    const found = nodes((n) => n.tagName === 'BUTTON' && n.textContent === text);
    assert.equal(found.length, 1, text);
    return found[0];
  }
  function fill() {
    for (const node of nodes((n) => n.tagName === 'INPUT')) {
      const label = node.getAttribute('aria-label') ?? '';
      if (label.includes('이름')) node.value = 'S';
      else if (/^(범주|날짜) \d+$/.test(label)) node.value = 'A';
      else if (label.endsWith(' X')) node.value = '17';
      else if (label.endsWith(' 크기')) node.value = '9';
      else node.value = '5';
    }
  }
  return {
    doc,
    host,
    root: host as unknown as HTMLElement,
    nodes,
    input,
    edit,
    select,
    button,
    fill,
  };
}

test('actual grid collect handles all sixteen families and preserves typed roles', () => {
  for (const profile of profiles) {
    const f = fixture(),
      grid = createInlineObjectInsertDataGrid(f.root, () => {});
    grid.setProfile(profile);
    f.fill();
    const data = grid.collect();
    const result = checkedChartCreateOptions({ width: 1, height: 1, ...data, chart: profile });
    assert.deepEqual(result.chart, profile);
    if (profile.kind === 'bubbleChart') {
      assert.deepEqual(data.categories, []);
      assert.deepEqual(data.series[0].x_values, [17]);
      assert.deepEqual(data.series[0].values, [5]);
      assert.deepEqual(data.series[0].bubble_sizes, [9]);
    }
    if (profile.kind === 'stockChart')
      assert.deepEqual(
        data.series.map((s) => s.stock_role),
        ['high', 'low', 'close'],
      );
    if (profile.kind.startsWith('surface')) {
      assert.equal(data.series.length, 2);
      assert.equal(data.categories.length, 2);
    }
  }
});
test('new typed numeric cells stay blank; missing X/size is refused and focused', () => {
  const f = fixture(),
    grid = createInlineObjectInsertDataGrid(f.root, () => {});
  grid.setProfile({ kind: 'bubbleChart' });
  f.edit('계열 1 이름', 'B');
  assert.equal(f.input('점 1, 계열 1 X').value, '');
  assert.equal(f.input('점 1, 계열 1 Y').value, '');
  assert.equal(f.input('점 1, 계열 1 크기').value, '');
  assert.throws(() => grid.collect(), /X/);
  assert.equal(f.doc.activeElement, f.input('점 1, 계열 1 X'));
  f.edit('점 1, 계열 1 X', '12.5');
  f.edit('점 1, 계열 1 Y', '-3');
  assert.throws(() => grid.collect(), /크기/);
  f.edit('점 1, 계열 1 크기', '-1');
  assert.throws(() => grid.collect(), /0 이상/);
  f.edit('점 1, 계열 1 크기', '2');
  assert.deepEqual(grid.collect().series[0], {
    name: 'B',
    values: [-3],
    x_values: [12.5],
    bubble_sizes: [2],
  });
});
test('grid stable maps survive row/series deletion and add; collect reads actual column names', () => {
  const f = fixture(),
    grid = createInlineObjectInsertDataGrid(f.root, () => {});
  grid.setProfile({ kind: 'scatterChart', scatter_style: 'marker' });
  fire(f.button('점 행 추가'), 'click');
  fire(f.button('계열 열 추가'), 'click');
  f.fill();
  f.edit('계열 1 이름', 'first');
  f.edit('계열 2 이름', 'second');
  f.edit('점 1, 계열 1 X', '11');
  f.edit('점 2, 계열 1 X', '12');
  f.edit('점 1, 계열 2 X', '21');
  f.edit('점 2, 계열 2 X', '22');
  fire(f.input('계열 1 삭제'), 'click');
  fire(f.input('행 1 삭제'), 'click');
  assert.deepEqual(grid.collect(), {
    categories: [],
    series: [{ name: 'second', values: [5], x_values: [22] }],
  });
  fire(f.button('계열 열 추가'), 'click');
  assert.equal(f.input('점 1, 계열 2 X').value, '');
  assert.throws(() => grid.collect(), /계열 이름/);
});
test('profile changes retain independent drafts and never cast category values into X or size', () => {
  const f = fixture(),
    grid = createInlineObjectInsertDataGrid(f.root, () => {});
  const legacy = grid.collect();
  grid.setProfile({ kind: 'bubbleChart' });
  f.fill();
  f.edit('점 1, 계열 1 크기', '25');
  const bubble = grid.collect();
  grid.setProfile();
  assert.deepEqual(grid.collect(), legacy);
  grid.setProfile({ kind: 'scatterChart', scatter_style: 'marker' });
  assert.equal(f.input('점 1, 계열 1 X').value, '');
  grid.setProfile({ kind: 'bubbleChart' });
  assert.deepEqual(grid.collect(), bubble);
  grid.setDisabled(true);
  assert.equal(f.input('점 1, 계열 1 크기').disabled, true);
  grid.setDisabled(false);
  assert.equal(f.input('점 1, 계열 1 크기').disabled, false);
});
test('actual JSON kind selector exposes sixteen exact kinds, option fields and capability state', () => {
  const f = fixture();
  let current: any;
  const selector = createChartTypeOptions(f.root, (p) => {
    current = p;
  });
  assert.equal(f.nodes((n) => n.tagName === 'OPTION').length, 17);
  for (const option of f.nodes((n) => n.tagName === 'OPTION'))
    assert.equal(option.disabled, option.value !== 'legacy');
  selector.setProfileVersion(1);
  for (const p of profiles) {
    f.select('차트 종류', p.kind);
    assert.equal(current.kind, p.kind);
  }
  f.select('차트 종류', 'barChart');
  f.select('막대 방향', 'bar');
  f.select('계열 묶음', 'percentStacked');
  assert.deepEqual(selector.read(), {
    kind: 'barChart',
    bar_direction: 'bar',
    grouping: 'percentStacked',
  });
  f.select('차트 종류', 'stockChart');
  f.select('주가 데이터 역할', 'openHighLowClose');
  assert.deepEqual(selector.read(), { kind: 'stockChart', stock_layout: 'openHighLowClose' });
  selector.setProfileVersion(0);
  assert.throws(() => selector.read(), /Unavailable/);
});
test('actual dialog submit collects explicit X/Y/size and gates old engines before callback', () => {
  const f = fixture(),
    outputs: any[] = [];
  const dialog = createInlineObjectInsertDialog(f.root, 'chart', {
    onInsert: (o) => outputs.push(o),
    onDismiss() {},
    chartCreateProfileVersion: 1,
  });
  f.select('차트 종류', 'bubbleChart');
  f.fill();
  // Width/height have no grid aria label and must retain their unit drafts.
  for (const node of f.nodes((n) => n.tagName === 'INPUT' && ['width', 'height'].includes(n.name)))
    node.value = '20';
  fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
  assert.equal(outputs.length, 1);
  assert.deepEqual(outputs[0].chart, { kind: 'bubbleChart' });
  assert.deepEqual(outputs[0].series[0], {
    name: 'S',
    values: [5],
    x_values: [17],
    bubble_sizes: [9],
  });
  dialog.setChartProfileVersion(0);
  fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
  assert.equal(outputs.length, 1);
  dialog.setBusy(true);
  assert.equal(f.input('차트 종류').disabled, true);
  dialog.destroy();
  assert.equal(f.host.children.length, 0);
});
test('actual dialog legacy submission has no chart opt-in and OHLC enforces real roles', () => {
  const f = fixture(),
    outputs: any[] = [];
  createInlineObjectInsertDialog(f.root, 'chart', {
    onInsert: (o) => outputs.push(o),
    onDismiss() {},
    chartCreateProfileVersion: 1,
  });
  fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
  assert.equal(outputs.length, 1);
  assert.equal(Object.hasOwn(outputs[0], 'chart'), false);
  f.select('차트 종류', 'stockChart');
  f.select('주가 데이터 역할', 'openHighLowClose');
  f.fill();
  for (const node of f.nodes((n) => n.tagName === 'INPUT' && ['width', 'height'].includes(n.name)))
    node.value = '20';
  fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
  assert.equal(outputs.length, 2);
  assert.deepEqual(
    outputs[1].series.map((s: any) => s.stock_role),
    ['open', 'high', 'low', 'close'],
  );
  f.edit('범주 1, 계열 3 값', '100');
  fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
  assert.equal(outputs.length, 2);
});
