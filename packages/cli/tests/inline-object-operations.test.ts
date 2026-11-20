// Actual CLI transaction code with controlled SDK responses. No engine execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDocumentOperations, validateDocumentOperations } from '../src/document-operations.ts';
import {
  checkedChartCreateRequest,
  checkedEquationInsertRequest,
} from '../../../js/hwpx-inline-object-insert.mjs';
const sha = 'a'.repeat(64);
const equation = () => ({
  script: 'x+y',
  width: 6000,
  height: 2000,
  baseLine: 80,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
});
const chart = () => ({
  size: { width: 6000, height: 2000 },
  data: { categories: ['A'], series: [{ name: 'S', values: ['1.50'] }] },
});
const createOp = (kind = 'chart-create', selector: any = { section: 1, paragraph: 4 }) => ({
  kind,
  coordinates: 'current-transaction',
  selector,
  unit: 3,
  expectedText: '앞😀뒤',
  payload: kind === 'chart-create' ? chart() : equation(),
});
const table = () => ({
  kind: 'table-insert',
  coordinates: 'current-transaction',
  section: 1,
  paragraph: 3,
  unit: 0,
  rows: 2,
  columns: 2,
  width: 20000,
  rowHeight: 4000,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 1 },
});
function host(options: any = {}) {
  const events: any[] = [],
    requests: any[] = [];
  let edited = false,
    revision = 0;
  const sdk: any = {
    inlineObjectPlacementVersion: () => (options.old ? 0 : 1),
    supportsChartCreationAbi: () => true,
    supportsEquationInsertionAbi: () => true,
    chartCreateProfileVersion: () => 1,
    enableHistoryV2() {
      events.push('history');
    },
    insertTable() {
      events.push('table');
      edited = true;
      revision++;
      return '9007199254740993';
    },
    anchorText() {
      throw Error('MustUseOwnerObservation');
    },
    inlineObjectOwner(selector: any) {
      events.push({ query: structuredClone(selector) });
      return {
        schemaVersion: 1,
        section: selector.section,
        ...('paragraph' in selector ? { paragraph: selector.paragraph } : {}),
        expected_text: options.wrongText ? 'changed' : '앞😀뒤',
        owner: selector.created_cell
          ? {
              kind: 'createdCell',
              identity: selector.created_cell.identity,
              row: selector.created_cell.row,
              column: selector.created_cell.column,
              binding: { session: 's1', revision, serial: String(revision) },
            }
          : {
              kind: 'sourceCell',
              table_node: 5,
              list_node: 8,
              binding: { session: 's1', revision, serial: String(revision) },
            },
      };
    },
    createChart(request: any) {
      events.push('chart');
      requests.push(checkedChartCreateRequest(request));
      edited = true;
      revision++;
      return options.ambiguous
        ? { application: 'unknown', changed: null, error: 'NativeUnknown' }
        : { nativeCode: 1, application: 'applied', changed: true };
    },
    insertEquation(request: any) {
      events.push('equation');
      requests.push(checkedEquationInsertRequest(request));
      edited = true;
      revision++;
      return { nativeCode: 1, application: 'applied', changed: true };
    },
  };
  const document: any = {
    format: options.hwp5 ? 'hwp5' : 'hwpx',
    sourceSha256: sha,
    sectionCount: 2,
    sdk,
    save() {
      events.push('save');
      return new Uint8Array([edited ? 2 : 1]);
    },
    close() {
      events.push('close');
      if (options.closeFail) throw Error('CloseFailed');
    },
  };
  return {
    events,
    requests,
    document,
    async run(operations: any[]) {
      return applyDocumentOperations(
        { bytes: new Uint8Array([1]), wasm: new Uint8Array([1]), expectedSha256: sha, operations },
        {
          async openDocument() {
            events.push('open');
            if (options.mutate) options.mutate();
            return document;
          },
        },
      );
    },
  };
}
for (const kind of ['chart-create', 'equation-insert'])
  test(`CLI controlled transaction ${kind} uses source-cell Native owner and one final publication`, async () => {
    const h = host();
    const result = await h.run([createOp(kind)]);
    assert.equal(result.appliedOperations, 1);
    assert.equal(result.layoutRequiresReflow, true);
    assert.deepEqual([...result.bytes], [2]);
    const query = h.events.findIndex((e) => typeof e === 'object' && e.query);
    assert.equal(h.events[query + 1], kind === 'chart-create' ? 'chart' : 'equation');
    assert.equal(h.events.filter((e) => e === 'save').length, 1);
    assert.equal(h.events.at(-1), 'close');
    assert.equal(
      kind === 'chart-create' ? h.requests[0].target.owner.kind : h.requests[0].owner.kind,
      'sourceCell',
    );
  });
for (const kind of ['chart-create', 'equation-insert'])
  test(`CLI controlled transaction ${kind} resolves prior table identity without fake paragraph`, async () => {
    const h = host();
    const operation = createOp(kind, {
      section: 1,
      created_cell: { operation: 0, row: 0, column: 1 },
    });
    const result = await h.run([table(), operation]);
    assert.equal(result.appliedOperations, 2);
    assert.equal(result.operationResults[0].identity, '9007199254740993');
    const request = kind === 'chart-create' ? h.requests[0].target : h.requests[0];
    assert.equal(Object.hasOwn(request, 'paragraph'), false);
    assert.equal(request.owner.kind, 'createdCell');
    assert.equal(request.owner.identity, '9007199254740993');
    assert.deepEqual(h.events.find((e) => typeof e === 'object').query, {
      section: 1,
      created_cell: { identity: '9007199254740993', row: 0, column: 1 },
    });
  });
test('CLI captures lexical payload and selector before asynchronous open', async () => {
  const operation = createOp();
  const h = host({
    mutate() {
      operation.payload.data.series[0].values[0] = '999';
      operation.selector.paragraph = 99;
    },
  });
  await h.run([operation]);
  assert.equal(h.requests[0].data.series[0].values[0], '1.50');
  assert.equal(h.requests[0].target.paragraph, 4);
});
test('old capability refuses whole plan before prior table mutation', async () => {
  const h = host({ old: true });
  await assert.rejects(
    h.run([
      table(),
      createOp('chart-create', { section: 1, created_cell: { operation: 0, row: 0, column: 1 } }),
    ]),
    /InlineObjectPlacementUnavailable/,
  );
  assert.deepEqual(h.events, ['open', 'close']);
});
test('HWP5 creation is explicitly unavailable independently of HWPX ABI', async () => {
  const h = host({ hwp5: true });
  await assert.rejects(h.run([createOp()]), /Hwp5InlineObjectCreationUnavailable/);
  assert.deepEqual(h.events, ['open', 'close']);
});
test('wrong current text after prior table creates no output and closes the isolated session', async () => {
  const h = host({ wrongText: true });
  await assert.rejects(
    h.run([
      table(),
      createOp('chart-create', { section: 1, created_cell: { operation: 0, row: 0, column: 1 } }),
    ]),
    /OperationTextPreconditionFailed/,
  );
  assert(!h.events.includes('chart'));
  assert(!h.events.includes('save'));
  assert.equal(h.events.at(-1), 'close');
});
test('ambiguous primitive completion is not retried or saved', async () => {
  const h = host({ ambiguous: true });
  await assert.rejects(h.run([createOp()]), /NativeUnknown/);
  assert.equal(h.events.filter((e) => e === 'chart').length, 1);
  assert(!h.events.includes('save'));
  assert.equal(h.events.at(-1), 'close');
});
test('creation failure and close failure preserve both errors', async () => {
  const h = host({ ambiguous: true, closeFail: true });
  await assert.rejects(h.run([createOp()]), (error: any) => {
    assert.equal(error.message, 'DocumentOperationsAndCloseFailed');
    assert.equal(error.errors[0].message, 'NativeUnknown');
    assert.equal(error.errors[1].message, 'CloseFailed');
    return true;
  });
});
test('invalid prior-operation references refuse before open or mutation', async () => {
  for (const operation of [0, 1, 2]) {
    const op = createOp('chart-create', {
      section: 1,
      created_cell: { operation, row: 0, column: 1 },
    });
    assert.throws(() => validateDocumentOperations([op]), /InvalidCreatedTableOperationReference/);
  }
  assert.throws(
    () =>
      validateDocumentOperations([
        createOp(),
        createOp('chart-create', { section: 1, created_cell: { operation: 0, row: 0, column: 1 } }),
      ]),
    /InvalidCreatedTableOperationReference/,
  );
  for (const created_cell of [
    { operation: 0, row: 2, column: 1 },
    { operation: 0, row: 0, column: 2 },
  ])
    assert.throws(
      () =>
        validateDocumentOperations([
          table(),
          createOp('chart-create', { section: 1, created_cell }),
        ]),
      /InvalidCreatedTableOperationReference/,
    );
  const first = table();
  first.section = 0;
  assert.throws(
    () =>
      validateDocumentOperations([
        first,
        createOp('chart-create', { section: 1, created_cell: { operation: 0, row: 0, column: 1 } }),
      ]),
    /InvalidCreatedTableOperationReference/,
  );
});
test('operation refuses caller-minted proof mixed addresses malformed unit and unknown keys', () => {
  const operation = createOp();
  for (const selector of [
    { section: 1, paragraph: 4, owner: { kind: 'body' } },
    { section: 1, paragraph: 4, created_cell: { identity: '1', row: 0, column: 0 } },
    { section: 1, created_cell: { identity: '1', operation: 0, row: 0, column: 0 } },
  ])
    assert.throws(() => validateDocumentOperations([{ ...operation, selector }]));
  assert.throws(
    () => validateDocumentOperations([{ ...operation, unit: 2 }]),
    /InvalidScalarBoundary/,
  );
  assert.throws(() => validateDocumentOperations([{ ...operation, unit: -0 }]));
  assert.throws(() => validateDocumentOperations([{ ...operation, physical_paragraph: 1 }]));
});
