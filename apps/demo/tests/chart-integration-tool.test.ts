import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { Document, all, fire } from './fake-dom.mjs';
import { EditorState } from '../../../packages/core/src/state/editor-state.ts';
import * as core from '../../../packages/core/src/commands/inline-object-insert.ts';
import {
  createHwpxInlineObjectInsertApi,
  checkedChartCreateRequest,
} from '../../../js/hwpx-inline-object-insert.mjs';
import {
  observedChartCreateProfileVersion,
  requireChartCreateProfile,
} from '../../../web/preview/chart-create-capability.mjs';
import { profiles } from '../../../tests/chart-kinds-fixtures.mjs';
import definitions from '../src/inline-object-insert-chart-type-options.json' with { type: 'json' };

// Only the CSS host boundary is stubbed. Tool, port, dialog, grid, Core capture,
// Runtime capability helper, transport validation and Native ABI JS wrapper run.
const hook = nodeModule.registerHooks?.({
  load(url, context, next) {
    return url.endsWith('.css')
      ? { format: 'module', source: 'export {};', shortCircuit: true }
      : next(url, context);
  },
});
const { createInlineObjectInsertTool } = await import('../src/inline-object-insert-tool.ts');
hook?.deregister();
const target = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
  coordinateSpace: 'display',
  format: 'hwpx',
  owner: 'section:0:body',
  section: 0,
  paragraph: 0,
  startUnit: 0,
  endUnit: 0,
  affinity: 'forward',
} as const;
function fixture(...versions: unknown[]) {
  const initial = versions.length ? versions[0] : 1;
  const doc = new Document(),
    create = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const n = create(tag);
    Object.assign(n, {
      insertBefore(child: typeof n, before: typeof n | null) {
        if (before === null) n.append(child);
        else {
          child.remove();
          child.parentElement = n;
          n.children.splice(n.children.indexOf(before), 0, child);
        }
        return child;
      },
      showModal() {
        n.open = true;
      },
      close() {
        n.open = false;
      },
    });
    return n;
  };
  const host = doc.createElement('main');
  Object.assign(host, {
    querySelector: () => all(host, (n: any) => n.tagName === 'DIALOG' && n.open)[0] ?? null,
  });
  let version = initial,
    allocations = 0,
    calls = 0;
  const wire: any[] = [];
  const native = {
    hwpx_edit_chart_create_profile_version: () => version,
    hwpx_edit_create_chart: () => {
      ++calls;
      return 1;
    },
  };
  const api = createHwpxInlineObjectInsertApi({
    wasm: native,
    memory: {
      withBytes(bytes, invoke) {
        ++allocations;
        wire.push(JSON.parse(new TextDecoder().decode(bytes)));
        return invoke(1, bytes.length);
      },
      error: () => Error('native'),
    },
    check() {},
  });
  function snapshot() {
    return new EditorState({
      ...target,
      status: 'ready',
      stateVersion: 7,
      selection: target,
      content: {
        format: 'hwpx',
        chartCreationAvailable: true,
        chartCreateProfileVersion: observedChartCreateProfileVersion(
          api,
          'hwpx',
          true,
          { protocolVersion: 2 },
          false,
        ),
        paragraphs: [
          {
            section: 0,
            paragraph: 0,
            text: '',
            selectionOwner: 'section:0:body',
            editable: true,
            plainEditable: true,
          },
        ],
      },
      nativeHistoryRevision: 4,
      nativeHistoryStats: { protocolVersion: 2 },
    } as any);
  }
  let state = snapshot();
  const listeners = new Set<() => void>();
  const status: string[] = [];
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async dispatchCommand(command: any, payload: any) {
      assert.equal(command, core.CREATE_CHART_COMMAND);
      const captured = core.captureInlineObjectInsertPayload(payload, 'chart');
      const message = core.inlineObjectInsertMessage(captured, state, 'chart') as any;
      requireChartCreateProfile(api, message.request, 'hwpx', true, { protocolVersion: 2 }, false);
      const result = api.createChart(message.request);
      assert.equal(result.application, 'applied');
      return { status: 'committed-with-snapshot' };
    },
  };
  const tool = createInlineObjectInsertTool({
    root: host as unknown as HTMLElement,
    editor: editor as any,
    core,
    onStatus: (text) => status.push(text),
    onClose() {},
  });
  function visible(n: any) {
    for (let p = n; p; p = p.parentElement) if (p.hidden) return false;
    return true;
  }
  const nodes = (predicate: (n: any) => boolean) =>
    all(host, (n: any) => visible(n) && predicate(n));
  function input(label: string) {
    const ns = nodes((n) => n.getAttribute('aria-label') === label);
    assert.equal(ns.length, 1, label);
    return ns[0];
  }
  function select(label: string, value: string) {
    const n = input(label);
    n.value = value;
    fire(n, 'change');
  }
  function fill() {
    for (const n of nodes((n) => n.tagName === 'INPUT')) {
      const label = n.getAttribute('aria-label') ?? '';
      n.value = ['width', 'height'].includes(n.name)
        ? '20'
        : label.includes('이름')
          ? 'S'
          : /^(범주|날짜) \d+$/.test(label)
            ? 'A'
            : label.endsWith(' X')
              ? '17'
              : label.endsWith(' 크기')
                ? '9'
                : '5';
    }
  }
  const submit = async () => {
    fire(nodes((n) => n.tagName === 'FORM')[0], 'submit');
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return {
    tool,
    host,
    nodes,
    input,
    select,
    fill,
    submit,
    wire,
    status,
    counts: () => ({ calls, allocations }),
    revoke() {
      version = 0;
    },
    publish() {
      state = snapshot();
      for (const fn of listeners) fn();
    },
  };
}
test('actual tool/port/dialog/Core/ABI-wrapper path submits all sixteen profiles with captured observed capability', async () => {
  for (const profile of profiles) {
    const f = fixture();
    f.tool.open('chart');
    f.select('차트 종류', profile.kind);
    const definition = definitions.find((d) => d.kind === profile.kind)!;
    for (const option of definition.fields) f.select(option.label, String(profile[option.key]));
    f.fill();
    await f.submit();
    assert.deepEqual(f.counts(), { calls: 1, allocations: 1 }, profile.kind);
    assert.deepEqual(f.wire[0].chart, profile);
    assert.deepEqual(f.wire[0].target, { section: 0, paragraph: 1, unit: 0, expected_text: '' });
    if (profile.kind === 'bubbleChart')
      assert.deepEqual(f.wire[0].data.series[0], {
        name: 'S',
        values: ['5'],
        x_values: ['17'],
        bubble_sizes: ['9'],
      });
    if (profile.kind === 'stockChart')
      assert.deepEqual(
        f.wire[0].data.series.map((s: any) => s.stock_role),
        ['high', 'low', 'close'],
      );
    if (profile.kind.startsWith('surface')) assert.equal(f.wire[0].data.series.length, 2);
    assert.equal(f.host.children.length, 0);
    f.tool.dispose();
  }
});
test('old/unknown capability leaves typed choices disabled while legacy tool submit is byte-compatible', async () => {
  for (const version of [0, undefined, 2, '1', true]) {
    const f = fixture(version);
    f.tool.open('chart');
    for (const option of f.nodes((n) => n.tagName === 'OPTION'))
      assert.equal(option.disabled, option.value !== 'legacy');
    await f.submit();
    assert.deepEqual(f.counts(), { calls: 1, allocations: 1 });
    assert.equal(Object.hasOwn(f.wire[0], 'chart'), false);
    f.tool.dispose();
  }
});
test('capability revocation is rechecked after UI capture and before any allocation or Native mutation', async () => {
  const f = fixture();
  f.tool.open('chart');
  f.select('차트 종류', 'bubbleChart');
  f.fill();
  f.revoke();
  await f.submit();
  assert.deepEqual(f.counts(), { calls: 0, allocations: 0 });
  assert(f.status.some((s) => s.includes('ChartCreateProfileUnavailable')));
  f.tool.dispose();
  const g = fixture();
  g.tool.open('chart');
  g.select('차트 종류', 'bubbleChart');
  g.fill();
  g.revoke();
  g.publish();
  assert.equal(g.input('차트 종류').disabled, true);
  await g.submit();
  assert.deepEqual(g.counts(), { calls: 0, allocations: 0 });
  g.tool.dispose();
});

test('typed UI rejects bounded lexical and number roundtrip losses before Core/Native allocation', async () => {
  for (const [kind, label, value] of [
    ['pieChart', '범주 1, 계열 1 값', '-1e-5000'],
    ['pieChart', '범주 1, 계열 1 값', '0e10001'],
    ['pieChart', '범주 1, 계열 1 값', '0e-10001'],
    ['pieChart', '범주 1, 계열 1 값', '0'.repeat(129)],
    ['pieChart', '범주 1, 계열 1 값', '1.0000000000000001'],
    ['pieChart', '범주 1, 계열 1 값', '4e-324'],
    ['bubbleChart', '점 1, 계열 1 크기', '-1e-5000'],
    ['scatterChart', '점 1, 계열 1 X', '1e-5000'],
  ]) {
    const f = fixture();
    f.tool.open('chart');
    f.select('차트 종류', kind);
    f.fill();
    f.input(label).value = value;
    await f.submit();
    assert.deepEqual(f.counts(), { calls: 0, allocations: 0 }, `${kind}: ${value}`);
    assert.equal(f.input(label).value, value, 'authored text is retained for correction');
    assert.equal(f.input(label).getAttribute('aria-invalid'), 'true');
    assert.equal(f.wire.length, 0);
    f.tool.dispose();
  }
});
test('typed HLC and OHLC reject authored near-equal prices without silently making them equal', async () => {
  for (const [layout, prices] of [
    ['highLowClose', ['1', '1.0000000000000001', '1']],
    ['highLowClose', ['1', '0', '1.0000000000000001']],
    ['openHighLowClose', ['1.0000000000000001', '1', '0', '1']],
  ] as const) {
    const f = fixture();
    f.tool.open('chart');
    f.select('차트 종류', 'stockChart');
    f.select('주가 데이터 역할', layout);
    f.fill();
    prices.forEach((value, i) => {
      f.input(`범주 1, 계열 ${i + 1} 값`).value = value;
    });
    await f.submit();
    assert.deepEqual(f.counts(), { calls: 0, allocations: 0 });
    assert.equal(f.wire.length, 0);
    f.tool.dispose();
  }
});
test('typed tool accepts decimal/scientific notation and true signed zeros through canonical decimal roundtrip', async () => {
  for (const [value, expected] of [
    ['0.1', '0.1'],
    ['1.25e2', '125'],
    ['+1.00e-1', '0.1'],
    ['5e-324', '5e-324'],
    ['-0', '0'],
    ['-0e-10000', '0'],
    ['0e10000', '0'],
    ['.000', '0'],
  ]) {
    const f = fixture();
    f.tool.open('chart');
    f.select('차트 종류', 'pieChart');
    f.fill();
    f.input('범주 1, 계열 1 값').value = value;
    await f.submit();
    assert.deepEqual(f.counts(), { calls: 1, allocations: 1 }, value);
    assert.equal(f.wire[0].data.series[0].values[0], expected);
    f.tool.dispose();
  }
  const f = fixture();
  f.tool.open('chart');
  f.select('차트 종류', 'stockChart');
  f.fill();
  ['3e-1', '1e-1', '2e-1'].forEach((value, i) => {
    f.input(`범주 1, 계열 ${i + 1} 값`).value = value;
  });
  await f.submit();
  assert.deepEqual(f.counts(), { calls: 1, allocations: 1 });
  assert.deepEqual(
    f.wire[0].data.series.map((s: any) => s.values[0]),
    ['0.3', '0.1', '0.2'],
  );
  f.tool.dispose();
});
test('typed admission does not change legacy grid conversion or direct lexical wire domain', async () => {
  const f = fixture();
  f.tool.open('chart');
  f.fill();
  f.input('범주 1, 계열 1 값').value = '-1e-5000';
  f.input('범주 2, 계열 1 값').value = '0e10001';
  await f.submit();
  assert.deepEqual(f.counts(), { calls: 1, allocations: 1 });
  assert.equal(Object.hasOwn(f.wire[0], 'chart'), false);
  assert.deepEqual(f.wire[0].data.series[0].values, ['0', '0', '5']);
  f.tool.dispose();
  const wire = {
    target: { section: 0, paragraph: 1, unit: 0, expected_text: '' },
    size: { width: 1, height: 1 },
    chart: { kind: 'pieChart' },
    data: { categories: ['A'], series: [{ name: 'S', values: ['1e-5000'] }] },
  };
  assert.equal(
    checkedChartCreateRequest(wire).data.series[0].values[0],
    '1e-5000',
    'direct wire preserves admitted tiny lexical value',
  );
  for (const value of ['-1e-5000', '0e10001']) {
    wire.data.series[0].values[0] = value;
    assert.throws(() => checkedChartCreateRequest(wire), /InvalidChartNumber/);
  }
});
