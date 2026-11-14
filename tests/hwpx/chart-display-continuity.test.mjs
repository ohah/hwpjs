import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartDisplayResources } from '../../web/preview/chart-display-resources.mjs';
import { projectDraftChartTargets } from '../../web/preview/chart-draft.mjs';
import { projectDraftAnchoredObjects } from '../../web/preview/anchored-object-draft.mjs';
import {
  createChartPreviewResourceReader,
  compatibleChartPreviewKeys,
} from '../../web/preview/chart-preview-resource-reader.mjs';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const frame = () => ({
  geometry: {
    width: 20000,
    height: 12000,
    width_relative: 4,
    height_relative: 2,
    treat_as_character: true,
    horizontal_offset: 0,
    vertical_offset: 0,
  },
  position: { flags: [0, 1], relations: [4, 2] },
});
const chart = (wrapper = 3) => ({
  kind: 'chart_display',
  pair: { section_ordinal: 0, wrapper_node: wrapper },
  host: { wrapper_node: wrapper, ...frame() },
  values: [10, 20, 30],
});
const target = { section: 0, wrapper: 3, paragraph: 0, anchorUnit: 3, error_name: null };
const content = () => ({
  paragraphs: [{ section: 0, paragraph: 0, text: 'abc\ufffc' }],
  chartTargets: [{ ...target }],
  oles: [
    {
      section: 0,
      oleNode: 9,
      chartWrapper: 3,
      paragraph: 0,
      anchorUnit: 3,
      state: 'located',
      representation: 'chart-alternative',
      source: { ...frame(), binary_item_id: 'chart-ole', transform_identity: true },
    },
  ],
});

test('chart and OLE draft positions share UTF16 projection without changing Native metadata', () => {
  const source = content(),
    before = JSON.stringify(source),
    draft = { section: 0, paragraph: 0, text: '😀abc\ufffc' };
  assert.equal(projectDraftChartTargets(source, draft)[0].anchorUnit, 5);
  assert.equal(projectDraftAnchoredObjects(source, source.oles, draft)[0].anchorUnit, 5);
  assert.deepEqual(projectDraftChartTargets(source, { ...draft, text: 'abc' }), []);
  assert.equal(JSON.stringify(source), before);
  assert.equal(projectDraftChartTargets({}, draft), undefined);
  assert.strictEqual(projectDraftChartTargets(source, null), source.chartTargets);
});

test('same Native owner/frame may paint a provisional chart while editing still sees no current value', async () => {
  const jobs = [],
    resources = createChartDisplayResources({
      read: () => {
        const job = deferred();
        jobs.push(job);
        return job.promise;
      },
    }),
    source = content();
  const loaded = resources.load(0, 3);
  jobs[0].resolve(chart());
  await loaded;
  const value = resources.get(0, 3).value;
  resources.refresh(source.chartTargets, compatibleChartPreviewKeys(source, source));
  assert.equal(resources.get(0, 3).value, null);
  const provisional = createChartPreviewResourceReader(source, resources)(0, 3);
  assert.strictEqual(provisional.value, value);
  assert.equal(provisional.provisional, true);
  assert.equal(
    createChartPreviewResourceReader(source, resources, { allowProvisional: false })(0, 3).value,
    null,
  );
  const next = resources.load(0, 3);
  assert.strictEqual(next, resources.load(0, 3));
  jobs[1].resolve({ ...chart(), values: [99] });
  await next;
  assert.deepEqual(resources.get(0, 3).value.values, [99]);
  assert.equal(resources.get(0, 3).previewValue, null);
});

test('changed geometry/provider/document and ambiguous owners never receive an old chart preview', async () => {
  const resources = createChartDisplayResources({ read: async () => chart() }),
    source = content();
  await resources.load(0, 3);
  for (const mutate of [
    (c) => c.oles[0].source.geometry.width++,
    (c) => (c.oles[0].source.binary_item_id = 'different'),
    (c) => (c.oles[0].source.transform_identity = false),
    (c) => c.oles.push({ ...c.oles[0] }),
  ]) {
    const next = structuredClone(source);
    mutate(next);
    assert.equal(compatibleChartPreviewKeys(source, next).size, 0);
  }
  resources.refresh(source.chartTargets, new Set(['0:3']));
  const changed = content();
  changed.oles[0].source.geometry.width++;
  assert.equal(createChartPreviewResourceReader(changed, resources)(0, 3).value, null);
  resources.clear();
  assert.equal(resources.get(0, 3), null);
  await resources.load(0, 3);
  resources.close();
  assert.equal(resources.get(0, 3), null);
});

test('stale surface read retries once with a fresh invocation; permanent and repeated errors do not loop', async () => {
  let reads = 0;
  const resources = createChartDisplayResources({
    read: async () => {
      if (++reads === 1) throw Error('StaleSurfaceResource');
      return chart();
    },
  });
  await resources.load(0, 3);
  assert.equal(reads, 2);
  assert.equal(resources.get(0, 3).error, null);
  assert.ok(resources.get(0, 3).value);
  for (const message of ['StaleSurfaceResource', 'NativeRejected']) {
    let calls = 0;
    const failed = createChartDisplayResources({
      read: async () => {
        calls++;
        throw Error(message);
      },
    });
    await failed.load(0, 3);
    await failed.load(0, 3);
    assert.equal(calls, message === 'StaleSurfaceResource' ? 2 : 1);
    assert.equal(failed.get(0, 3).error, message);
    assert.equal(failed.get(0, 3).previewValue, null);
  }
});

test('refresh ABA ignores an old completion and counts retained previews against the same total budget', async () => {
  const jobs = [],
    resources = createChartDisplayResources({
      read: () => {
        const job = deferred();
        jobs.push(job);
        return job.promise;
      },
    });
  const first = resources.load(0, 3);
  resources.refresh([target]);
  const second = resources.load(0, 3);
  jobs[0].resolve({ ...chart(), values: [1] });
  await first;
  assert.equal(resources.get(0, 3).value, null);
  jobs[1].resolve(chart());
  await second;
  assert.deepEqual(resources.get(0, 3).value.values, [10, 20, 30]);
  const units = JSON.stringify(chart()).length;
  let large = false;
  const limited = createChartDisplayResources({
    maxSnapshotUnits: units + 100,
    maxTotalUnits: units * 2,
    read: async (s, w) => (large && w === 3 ? { ...chart(w), extra: 'x'.repeat(30) } : chart(w)),
  });
  await limited.load(0, 3);
  await limited.load(0, 4);
  limited.refresh([target, { ...target, wrapper: 4 }], new Set(['0:3', '0:4']));
  large = true;
  await limited.load(0, 3);
  assert.equal(limited.get(0, 3).error, 'ChartDisplayUnitsLimitExceeded');
  assert.ok(limited.get(0, 4).previewValue);
  await limited.load(0, 5);
  assert.ok(limited.get(0, 5).value);
});

test('a synchronous failing reader publishes its pending handle before a reentrant change listener', async () => {
  let calls = 0,
    observed;
  const resources = createChartDisplayResources({
    read: () => {
      calls++;
      throw Error('NativeRejected');
    },
    onChange: () => {
      observed = resources.load(0, 3);
    },
  });
  const pending = resources.load(0, 3);
  await pending;
  assert.strictEqual(observed, pending);
  assert.equal(calls, 1);
});

test('a provisional owner must join one current target and paragraph at the same anchor', async () => {
  const resources = createChartDisplayResources({ read: async () => chart() }),
    source = content();
  await resources.load(0, 3);
  resources.refresh(source.chartTargets, compatibleChartPreviewKeys(source, source));
  for (const mutate of [
    (c) => {
      c.paragraphs.push({ section: 0, paragraph: 1, text: '\ufffc' });
      c.chartTargets[0].paragraph = 1;
      c.chartTargets[0].anchorUnit = 0;
    },
    (c) => c.chartTargets.push({ ...c.chartTargets[0] }),
    (c) => c.paragraphs.push({ ...c.paragraphs[0] }),
    (c) => (c.paragraphs[0].text = 'abcd'),
  ]) {
    const next = structuredClone(source);
    mutate(next);
    assert.equal(compatibleChartPreviewKeys(source, next).size, 0);
    assert.equal(createChartPreviewResourceReader(next, resources)(0, 3).value, null);
  }
});

test('refresh and clear scrub snapshots captured by unresolved retired requests', async () => {
  const jobs = [],
    resources = createChartDisplayResources({
      read: () => {
        const job = deferred();
        jobs.push(job);
        return job.promise;
      },
    }),
    source = content();
  const initial = resources.load(0, 3);
  jobs[0].resolve(chart());
  await initial;
  resources.refresh(source.chartTargets, compatibleChartPreviewKeys(source, source));
  const pending = resources.load(0, 3),
    retired = resources.get(0, 3);
  assert.ok(retired.previewValue);
  resources.refresh(source.chartTargets, compatibleChartPreviewKeys(source, source));
  assert.equal(retired.previewValue, null);
  assert.equal(retired.units, 0);
  const transferred = resources.get(0, 3);
  assert.ok(transferred.previewValue);
  resources.clear();
  assert.equal(transferred.previewValue, null);
  assert.equal(transferred.units, 0);
  jobs[1].resolve(chart());
  await pending;
  assert.equal(resources.get(0, 3), null);
});
