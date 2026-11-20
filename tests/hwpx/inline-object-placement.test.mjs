import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedInlineObjectOwner,
  checkedInlineObjectTarget,
} from '../../js/hwpx-inline-object-placement.mjs';
import {
  checkedEquationInsertRequest,
  checkedChartCreateRequest,
  createHwpxInlineObjectInsertApi,
} from '../../js/hwpx-inline-object-insert.mjs';

const binding = { session: 's7', revision: 9, serial: '9007199254740993' };
const equation = {
  section: 0,
  paragraph: 1,
  start: 0,
  expectedText: '',
  script: 'x',
  width: 200,
  height: 100,
  baseLine: 80,
  baseUnit: 1000,
  version: 'v',
  font: 'f',
};
const chart = {
  target: { section: 0, paragraph: 1, unit: 0, expected_text: '' },
  size: { width: 200, height: 100 },
  data: { categories: ['A'], series: [{ name: 'S', values: ['1'] }] },
};

test('legacy body chart three-field wire and equation bytes remain exact', () => {
  assert.equal(JSON.stringify(checkedChartCreateRequest(chart)), JSON.stringify(chart));
  assert.equal(JSON.stringify(checkedEquationInsertRequest(equation)), JSON.stringify(equation));
  assert.deepEqual(Object.keys(checkedChartCreateRequest(chart)), ['target', 'size', 'data']);
});
test('typed body/source cell/created cell owners copy all nested proof fields', () => {
  for (const owner of [
    { kind: 'body', binding },
    { kind: 'sourceCell', binding, table_node: 4, list_node: 7 },
    { kind: 'createdCell', binding, identity: '18446744073709551615', row: 2, column: 3 },
  ]) {
    const copy = checkedInlineObjectOwner(owner);
    assert.deepEqual(copy, owner);
    assert.notEqual(copy.binding, owner.binding);
    const target = {
      section: 2,
      ...(owner.kind === 'createdCell' ? {} : { paragraph: 5 }),
      unit: 0,
      expected_text: '',
      owner,
    };
    assert.deepEqual(checkedChartCreateRequest({ ...chart, target }).target, target);
  }
});
test('created cell has no fake paragraph; nonlegacy section requires proof', () => {
  const owner = { kind: 'createdCell', binding, identity: '3', row: 0, column: 0 };
  const { paragraph, ...withoutParagraph } = equation;
  const request = { ...withoutParagraph, section: 2, owner };
  assert.equal(Object.hasOwn(checkedEquationInsertRequest(request), 'paragraph'), false);
  assert.throws(
    () => checkedEquationInsertRequest({ ...request, paragraph }),
    /InvalidInlineObjectRequest/,
  );
  assert.throws(() => checkedInlineObjectTarget({ ...chart.target, section: 1 }), /OwnerRequired/);
});
test('owned caret affinity is explicit while legacy body wire rejects new unproved fields', () => {
  const owner = { kind: 'body', binding };
  for (const affinity of ['forward', 'backward']) {
    const target = { ...chart.target, owner, affinity };
    assert.deepEqual(checkedChartCreateRequest({ ...chart, target }).target, target);
    const request = { ...equation, owner, affinity };
    assert.deepEqual(checkedEquationInsertRequest(request), request);
  }
  assert.throws(() =>
    checkedChartCreateRequest({ ...chart, target: { ...chart.target, affinity: 'forward' } }),
  );
  assert.throws(() =>
    checkedChartCreateRequest({
      ...chart,
      target: { ...chart.target, owner, affinity: 'pretend' },
    }),
  );
});
test('owner proof rejects malformed decimal, mixed discriminants, accessors and unknown fields', () => {
  const original = { kind: 'createdCell', binding, identity: '3', row: 0, column: 0 };
  for (const bad of [
    { ...original, identity: '03' },
    { ...original, identity: '18446744073709551616' },
    { ...original, row: -0 },
    { ...original, table_node: 4 },
    { ...original, kind: 'pretend' },
    { ...original, binding: { ...binding, serial: '1e2' } },
    { ...original, binding: { ...binding, session: 's0' } },
  ])
    assert.throws(() => checkedInlineObjectOwner(bad));
  let reads = 0;
  assert.throws(() =>
    checkedInlineObjectOwner({
      ...original,
      get binding() {
        reads++;
        return binding;
      },
    }),
  );
  assert.equal(reads, 0);
});
test('old engine accepts legacy unchanged but refuses new placement before memory allocation', () => {
  let allocations = 0;
  const api = createHwpxInlineObjectInsertApi({
    wasm: { hwpx_edit_create_chart: () => 1 },
    memory: {
      allocate() {
        allocations++;
        throw Error('AllocationForbidden');
      },
    },
    check() {},
  });
  assert.equal(api.inlineObjectPlacementVersion(), 0);
  const owner = { kind: 'sourceCell', binding, table_node: 4, list_node: 7 };
  assert.throws(
    () => api.createChart({ ...chart, target: { ...chart.target, section: 2, owner } }),
    /PlacementUnavailable/,
  );
  assert.equal(allocations, 0);
});
test('SDK owner query copies Native-issued provenance and pairs input/output cleanup without engine execution', () => {
  let inputs = 0,
    inputFrees = 0,
    outputFrees = 0,
    captured;
  const selector = {
    section: 2,
    created_cell: { identity: '9007199254740993', row: 0, column: 1 },
  };
  const observation = {
    schemaVersion: 1,
    section: 2,
    expected_text: '앞😀뒤',
    owner: { kind: 'createdCell', binding, ...selector.created_cell },
  };
  const output = new TextEncoder().encode(JSON.stringify(observation));
  let input;
  const api = createHwpxInlineObjectInsertApi({
    check() {},
    wasm: {
      hwpx_edit_inline_object_placement_version: () => 1,
      hwpx_edit_inline_object_owner: () => {
        captured = JSON.parse(new TextDecoder().decode(input));
        return 1;
      },
      hwpx_edit_output_ptr: () => 0,
      hwpx_edit_output_len: () => output.length,
      hwpx_edit_output_free: () => {
        outputFrees++;
      },
    },
    memory: {
      withBytes(bytes, invoke) {
        inputs++;
        input = bytes;
        try {
          return invoke(0, bytes.length);
        } finally {
          inputFrees++;
        }
      },
      copy: () => output.slice(),
      error: () => Error('NativeRejected'),
    },
  });
  assert.equal(api.inlineObjectPlacementVersion(), 1);
  const received = api.inlineObjectOwner(selector);
  assert.deepEqual(captured, selector);
  assert.deepEqual(received, observation);
  assert.notEqual(received.owner.binding, binding);
  assert.deepEqual([inputs, inputFrees, outputFrees], [1, 1, 1]);
});
