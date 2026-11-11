import { generateSourceCellSplitFixtures } from './helpers/source-cell-split-fixtures.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { applyDocumentOperations, validateDocumentOperations } from '../src/document-operations.ts';
import { prepareSourceTableCellSplits } from '../src/mutations/source-table-cell-split.ts';
import { prepareOperationSession } from '../src/mutations/dispatch.ts';
import { openDocument } from '../src/engine.ts';
import { readDocumentModel } from '../src/document-model.ts';

const source = fileURLToPath(new URL('../../../', import.meta.url));
const {
  HWPJS_TEST_WASM: wasmPath,
  HWPJS_TEST_OLD_WASM: oldPath,
  HWPJS_TEST_FIXTURES: explicitFixtureDir,
  HWPJS_TEST_EVIDENCE: evidence,
} = process.env;
for (const input of [wasmPath, oldPath, evidence]) assert(input, 'ExplicitInputsRequired');
const binary = await readFile(wasmPath),
  oldBinary = await readFile(oldPath);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(binary), process.env.HWPJS_TEST_WASM_SHA256);
assert.equal(hash(oldBinary), process.env.HWPJS_TEST_OLD_SPLIT_WASM_SHA256);
assert.match(process.env.HWPJS_TEST_WASM_SHA256 ?? '', /^[a-f0-9]{64}$/);
assert.match(process.env.HWPJS_TEST_OLD_SPLIT_WASM_SHA256 ?? '', /^[a-f0-9]{64}$/);
await mkdir(evidence);
const fixtureDir = explicitFixtureDir || (await mkdtemp(join(tmpdir(), 'hwpjs-split-fixtures-')));
if (!explicitFixtureDir) {
  const generated = await generateSourceCellSplitFixtures({
    wasmModule: await WebAssembly.compile(binary),
    directory: fixtureDir,
  });
  await writeFile(join(evidence, 'generated-fixtures.json'), JSON.stringify(generated, null, 2));
}
const extentExpectation = process.env.HWPJS_TEST_HWP5_EXTENT_EXPECTATION;
assert(['reject', 'accept'].includes(extentExpectation), 'ExplicitHwp5ExtentExpectationRequired');
const extentOracle = process.env.HWPJS_TEST_HWP5_EXTENT_ORACLE;
if (extentExpectation === 'accept') {
  assert(extentOracle, 'ExplicitExtentOracleRequired');
  assert.match(process.env.HWPJS_TEST_HWP5_EXTENT_ORACLE_SHA256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(
    hash(await readFile(extentOracle)),
    process.env.HWPJS_TEST_HWP5_EXTENT_ORACLE_SHA256,
  );
}
async function verifyExtent(name, before, after) {
  const a = join(evidence, name + '-extent-before.hwp'),
    b = join(evidence, name + '-extent-after.hwp');
  await writeFile(a, before);
  await writeFile(b, after);
  for (const flags of [[], ['-O']]) {
    const good = spawnSync('python3', ['-B', ...flags, extentOracle, a, b], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    const bad = spawnSync('python3', ['-B', ...flags, extentOracle, a, a], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'ExtentOracleAcceptedUnchangedInput');
  }
}
const fixture = (name) => readFile(`${fixtureDir}/${name}`);
const missing = (path) => assert.rejects(access(path), { code: 'ENOENT' });
const utf8 = (path) => readFile(path, 'utf8');
async function opened(t, bytes, wasm = binary) {
  const document = await openDocument({ bytes, wasm });
  t.after(() => document.close());
  return document;
}
function tables(model) {
  return model.sections.flatMap((section) =>
    section.body.filter((block) => block.type === 'table'),
  );
}
const modelOf = (document) => readDocumentModel({ ...document });
const operation = (reference, extra = {}) => ({
  kind: 'source-table-cell-split',
  coordinates: 'current-transaction',
  reference,
  expectedRows: 2,
  expectedColumns: 2,
  top: 0,
  left: 0,
  bottom: 1,
  right: 1,
  rows: 2,
  columns: 3,
  mode: 'each',
  equalizeRows: true,
  ...extra,
});
async function referenceOf(t, bytes, index = 0) {
  const doc = await opened(t, bytes);
  return tables(await modelOf(doc))[index].reference;
}
const apply = (bytes, operations, extra = {}, dependencies = {}) =>
  applyDocumentOperations(
    {
      bytes,
      wasm: binary,
      expectedSha256: hash(bytes),
      operations,
      allowStaleLayout: true,
      ...extra,
    },
    dependencies,
  );
const cell = (row, column, rs, cs, width, height, original, extra = {}) => ({
  row,
  column,
  span: [rs, cs],
  size: [width, height],
  source: original,
  ...extra,
});
const singleGolden = {
  gridRows: 3,
  gridColumns: 4,
  cells: [
    cell(0, 0, 1, 1, 5000, 4000, [0, 0]),
    cell(0, 1, 1, 1, 5000, 4000, [0, 0], { blank: true }),
    cell(0, 2, 1, 1, 5000, 4000, [0, 0], { blank: true }),
    cell(0, 3, 2, 1, 15000, 8000, [0, 1]),
    cell(1, 0, 1, 1, 5000, 4000, [0, 0], { blank: true }),
    cell(1, 1, 1, 1, 5000, 4000, [0, 0], { blank: true }),
    cell(1, 2, 1, 1, 5000, 4000, [0, 0], { blank: true }),
    cell(2, 0, 1, 3, 15000, 8000, [1, 0]),
    cell(2, 3, 1, 1, 15000, 8000, [1, 1]),
  ],
};
const eachGolden = {
  gridRows: 2,
  gridColumns: 4,
  cells: [
    cell(0, 0, 1, 1, 7500, 8000, [0, 0]),
    cell(0, 1, 1, 1, 7500, 8000, [0, 0], { blank: true }),
    cell(0, 2, 1, 1, 7500, 8000, [0, 1]),
    cell(0, 3, 1, 1, 7500, 8000, [0, 1], { blank: true }),
    cell(1, 0, 1, 2, 15000, 8000, [1, 0]),
    cell(1, 2, 1, 2, 15000, 8000, [1, 1]),
  ],
};
const mergeGolden = {
  gridRows: 2,
  gridColumns: 2,
  cells: [
    cell(0, 0, 1, 1, 15000, 8000, [0, 0], {
      paragraphSources: [
        [0, 0],
        [0, 1],
      ],
    }),
    cell(0, 1, 1, 1, 15000, 8000, [0, 0], { blank: true }),
    cell(1, 0, 1, 1, 15000, 8000, [1, 0]),
    cell(1, 1, 1, 1, 15000, 8000, [1, 1]),
  ],
};
const mergedGolden = {
  gridRows: 2,
  gridColumns: 2,
  cells: [
    cell(0, 0, 1, 1, 15000, 8000, [0, 0]),
    cell(0, 1, 1, 1, 15000, 8000, [0, 0], { blank: true }),
    cell(1, 0, 1, 1, 15000, 8000, [0, 0], { blank: true }),
    cell(1, 1, 1, 1, 15000, 8000, [0, 0], { blank: true }),
  ],
};
async function oracle(name, before, after, format, golden = singleGolden) {
  const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
  const a = `${evidence}/${name}-before.${ext}`,
    b = `${evidence}/${name}-after.${ext}`;
  await writeFile(a, before);
  await writeFile(b, after);
  let args, invalid;
  if (format === 'hwpx') {
    const plan = { before: a, after: b, ...golden };
    const path = `${evidence}/${name}-plan.json`,
      bad = `${evidence}/${name}-invalid.json`;
    await writeFile(path, JSON.stringify(plan));
    const wrong = structuredClone(plan);
    wrong.cells[0].size[0]++;
    await writeFile(bad, JSON.stringify(wrong));
    args = [`${source}tests/hwpx/source-cell-split-bridges-oracle.py`, path];
    invalid = [[`${source}tests/hwpx/source-cell-split-bridges-oracle.py`, bad]];
  } else {
    const bad = Uint8Array.from(after),
      view = new DataView(bad.buffer);
    bad[(view.getUint32(48, true) + 1) * 2 ** view.getUint16(30, true) + 80] ^= 1;
    const badPath = `${evidence}/${name}-invalid-metadata.hwp`;
    await writeFile(badPath, bad);
    const script = `${source}tests/hwp5/source-table-cell-split-oracle.py`;
    args = [script, a, b];
    invalid = [
      [script, a, a],
      [script, a, badPath],
    ];
  }
  const result = [];
  for (const flags of [[], ['-O']]) {
    const valid = spawnSync('python3', ['-B', ...flags, ...args], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    for (const bad of invalid) {
      const negative = spawnSync('python3', ['-B', ...flags, ...bad], { encoding: 'utf8' });
      assert.equal(negative.status, 1, negative.stdout + negative.stderr);
    }
    result.push({ flags, result: JSON.parse(valid.stdout), negativeRejected: invalid.length });
  }
  await writeFile(`${evidence}/${name}-oracle.json`, JSON.stringify(result, null, 2));
}
async function exactReopen(t, bytes) {
  const document = await opened(t, bytes);
  const saved = await document.save({ allowStaleLayout: true });
  assert.deepEqual(
    Buffer.from(document.format === 'hwp5' ? saved.bytes : saved),
    Buffer.from(bytes),
  );
  return document;
}

test('strict shared split operation schema captures scalars and rejects forged/native authority and malformed requests before open', async () => {
  const ref = `hwpjs-object:${'a'.repeat(64)}/hwpx/s0/table/13`;
  const input = operation(ref);
  const captured = validateDocumentOperations([input]);
  input.rows = 63;
  assert.equal(captured[0].rows, 2);
  assert(Object.isFrozen(captured[0]));
  for (const extra of [
    { rows: 0 },
    { rows: 64 },
    { rows: 1, columns: 1 },
    { bottom: 0 },
    { right: 3 },
    { left: -1 },
    { expectedRows: 65536, expectedColumns: 65536 },
    { mode: 'all' },
    { equalizeRows: 1 },
    { binding: {} },
    { tableNode: 13 },
    { reference: ref.replace('/table/', '/image/') },
    { selectedCells: 1 },
  ])
    assert.throws(() => validateDocumentOperations([operation(ref, extra)]));
  let opened = false;
  await assert.rejects(
    applyDocumentOperations(
      {
        bytes: new Uint8Array([1]),
        wasm: binary,
        expectedSha256: 'a'.repeat(64),
        operations: [operation(ref), operation(ref, { rows: 64 })],
      },
      {
        openDocument() {
          opened = true;
          throw Error('No');
        },
      },
    ),
  );
  assert.equal(opened, false);
});

test('actual shared HWPX single, each, merge-then-split and merged-span source paths; independent XML and exact reopen', async (t) => {
  for (const [name, input, extra, golden] of [
    ['single', 'single.hwpx', {}, singleGolden],
    ['each', 'single.hwpx', { bottom: 1, right: 2, rows: 1, columns: 2 }, eachGolden],
    [
      'merge-then-split',
      'single.hwpx',
      { bottom: 1, right: 2, rows: 1, columns: 2, mode: 'merge-then-split' },
      mergeGolden,
    ],
    ['merged', 'merged.hwpx', { bottom: 2, right: 2, rows: 2, columns: 2 }, mergedGolden],
  ]) {
    const bytes = await fixture(input),
      ref = await referenceOf(t, bytes);
    const result = await apply(bytes, [operation(ref, extra)]);
    assert.equal(result.appliedOperations, 1);
    assert.equal(result.changed, true);
    assert.equal(result.layoutRequiresReflow, true);
    await exactReopen(t, result.bytes);
    await oracle(`service-${name}`, bytes, result.bytes, 'hwpx', golden);
  }
});

test('actual HWP5 single-unmerged profile and independent CFB; broader intents remain rejected and extent follows the explicit oracle contract', async (t) => {
  const bytes = await fixture('positive.hwp'),
    ref = await referenceOf(t, bytes);
  const result = await apply(bytes, [operation(ref)]);
  assert.equal(result.layoutRequiresReflow, true);
  await exactReopen(t, result.bytes);
  await oracle('service-hwp5', bytes, result.bytes, 'hwp5');
  for (const extra of [
    { right: 2 },
    { mode: 'merge-then-split', right: 2 },
    { equalizeRows: false },
  ])
    await assert.rejects(apply(bytes, [operation(ref, extra)]), /UnsupportedSourceTableSplit/);
  await assert.rejects(
    apply(bytes, [operation(ref)], { allowStaleLayout: false }),
    /StaleLayout|Layout/,
  );
  await assert.rejects(
    apply(bytes, [operation(ref)], { wasm: oldBinary }),
    /Hwp5SourceTableCellSplitAbiUnavailable/,
  );
  const bad = await fixture('outline-mismatch.hwp'),
    badRef = await referenceOf(t, bad);
  if (extentExpectation === 'reject')
    await assert.rejects(apply(bad, [operation(badRef)]), /UnsupportedSourceTableGrid/);
  else await verifyExtent('service', bad, (await apply(bad, [operation(badRef)])).bytes);
  await writeFile(
    `${evidence}/HWP5-KNOWN-LIMIT.json`,
    JSON.stringify(
      {
        inputSha256: hash(bad),
        nativeSha256: hash(binary),
        extentExpectation,
        expectedError: extentExpectation === 'reject' ? 'UnsupportedSourceTableGrid' : null,
        scope:
          'Explicit extent contract checked with the supplied engine/oracle pins; no inferred merged-profile expansion',
      },
      null,
      2,
    ),
  );
});

test('HWPX other same-size source table stays byte-exact outside the selected split', async (t) => {
  const bytes = await fixture('two.hwpx'),
    doc = await opened(t, bytes),
    observed = tables(await modelOf(doc));
  assert.equal(observed.length, 2);
  assert.equal(observed[0].rows, observed[1].rows);
  assert.equal(observed[0].columns, observed[1].columns);
  const result = await apply(bytes, [operation(observed[0].reference)]);
  await exactReopen(t, result.bytes);
  await oracle('service-two-first', bytes, result.bytes, 'hwpx', singleGolden);
  const second = await apply(bytes, [operation(observed[1].reference)]);
  await exactReopen(t, second.bytes);
  await oracle('service-two-second', bytes, second.bytes, 'hwpx', {
    ...singleGolden,
    tableOrdinal: 1,
  });
});

test('batch captures original references once: any preceding edit or first table split invalidates later target; late error never returns bytes', async (t) => {
  for (const name of ['two.hwpx', 'two.hwp']) {
    const bytes = await fixture(name),
      doc = await opened(t, bytes),
      items = tables(await modelOf(doc));
    assert.equal(items.length, 2);
    const ops = items.map((x) => operation(x.reference));
    await assert.rejects(
      apply(bytes, ops),
      /StaleSourceTableSplitReference|UnsupportedSourceTableGrid/,
    );
    const at = doc.sdk.tablePlacements(0)[0].paragraph;
    const preceding = {
      kind: 'paragraph-alignment',
      coordinates: 'current-transaction',
      section: 0,
      paragraph: at,
      alignment: 'RIGHT',
    };
    await assert.rejects(apply(bytes, [preceding, ops[0]]), /StaleSourceTableSplitReference/);
  }
  const bytes = await fixture('single.hwpx'),
    ref = await referenceOf(t, bytes);
  const late = {
    kind: 'paragraph-alignment',
    coordinates: 'current-transaction',
    section: 0,
    paragraph: 0xffffffff,
    alignment: 'LEFT',
  };
  await assert.rejects(apply(bytes, [operation(ref), late]));
});

test('opaque prepared targets reject foreign same-byte sessions, foreign SHA same-size documents, undo ABA, reopen and close', async (t) => {
  for (const name of ['two.hwpx', 'two.hwp']) {
    const bytes = await fixture(name),
      a = await opened(t, bytes),
      b = await opened(t, bytes);
    const items = tables(await modelOf(a));
    assert.equal(items.length, 2);
    const [op] = validateDocumentOperations([operation(items[0].reference)]);
    prepareOperationSession(a, [op]);
    prepareOperationSession(b, [op]);
    const target = await prepareSourceTableCellSplits(a, [op]);
    assert.throws(() => target.apply(b, op), /ForeignSourceTableSplitTarget/);
    // Same rows/columns/node addresses with different source bytes are not the same reference.
    const first = b.sdk.tableBindings(0)[0];
    if (b.format === 'hwp5')
      b.sdk.splice({
        section: 0,
        paragraph: first.paragraph,
        startUnit: 0,
        endUnit: 0,
        text: 'foreign',
      });
    else b.sdk.splice(0, first.paragraph, 0, 0, 'foreign');
    const saved = b.save({ allowStaleLayout: true }),
      foreign = b.format === 'hwp5' ? saved.bytes : saved;
    await assert.rejects(apply(foreign, [op]), /StaleObjectReference/);
    // The non-rewinding Native serial must reject revision ABA after edit+undo.
    const captured = await prepareSourceTableCellSplits(a, [op]);
    a.sdk.setParagraphAlignment({
      section: 0,
      paragraph: a.sdk.tablePlacements(0)[0].paragraph,
      alignment: 'RIGHT',
    });
    assert.equal(a.sdk.undo(), true);
    assert.throws(() => captured.apply(a, op), /StaleSourceTableSplitReference/);
    const reopening = await prepareSourceTableCellSplits(a, [op]);
    if (a.format === 'hwpx') {
      a.sdk.open(bytes);
      assert.throws(
        () => reopening.apply(a, op),
        /StaleSourceTableSplitReference|HistoryNotEnabled/,
      );
      a.sdk.enableHistoryV2();
    } else {
      const reopened = await opened(t, bytes);
      prepareOperationSession(reopened, [op]);
      assert.throws(() => reopening.apply(reopened, op), /ForeignSourceTableSplitTarget/);
    }
    const closing = await prepareSourceTableCellSplits(a, [op]);
    a.close();
    assert.throws(() => closing.apply(a, op), /Closed|closed|NotOpen/);
  }
});

function cli(inputPath, bytes, outputPath, operations, wasm = wasmPath) {
  return spawnSync(
    process.execPath,
    [
      `${source}packages/cli/src/bin.ts`,
      'apply',
      inputPath,
      '--expect-sha256',
      hash(bytes),
      '--operations',
      JSON.stringify(operations),
      '--output',
      outputPath,
      '--allow-stale-layout',
      '--wasm',
      wasm,
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
}
test('real CLI subprocess HWPX/HWP5 saves exactly and publishes no partial output on late/stale/old ABI/limit error or overwrite', async (t) => {
  for (const [format, name] of [
    ['hwpx', 'single.hwpx'],
    ['hwp5', 'positive.hwp'],
  ]) {
    const inputPath = `${fixtureDir}/${name}`,
      bytes = await fixture(name),
      ref = await referenceOf(t, bytes);
    const output = `${evidence}/cli-${name}`,
      good = cli(inputPath, bytes, output, [operation(ref)]);
    assert.equal(good.status, 0, good.stderr);
    const saved = await readFile(output);
    await exactReopen(t, saved);
    await oracle(`cli-${format}`, bytes, saved, format);
    assert.match(good.stdout, /layoutRequiresReflow: true/);
    const late = {
      kind: 'paragraph-alignment',
      coordinates: 'current-transaction',
      section: 0,
      paragraph: 0xffffffff,
      alignment: 'LEFT',
    };
    for (const [suffix, ops, wasm] of [
      ['late', [operation(ref), late], wasmPath],
      ['stale', [operation(ref.replace(hash(bytes), 'a'.repeat(64)))], wasmPath],
      ...(format === 'hwp5' ? [['old', [operation(ref)], oldPath]] : []),
    ]) {
      const rejectedPath = `${evidence}/cli-${format}-${suffix}-forbidden.${format === 'hwp5' ? 'hwp' : 'hwpx'}`;
      const bad = cli(inputPath, bytes, rejectedPath, ops, wasm);
      assert.notEqual(bad.status, 0);
      assert.equal(bad.stdout, '');
      await missing(rejectedPath);
    }
    const overwrite = cli(inputPath, bytes, output, [operation(ref)]);
    assert.notEqual(overwrite.status, 0);
    assert.equal(overwrite.stdout, '');
    assert.deepEqual(await readFile(output), saved);
    assert.deepEqual(await readFile(inputPath), bytes);
  }
  const bytes = await fixture('two.hwpx'),
    ref = await referenceOf(t, bytes);
  const forbidden = `${evidence}/cli-preceding-forbidden.hwpx`;
  const doc = await opened(t, bytes),
    at = doc.sdk.tablePlacements(0)[0].paragraph;
  const preceding = {
    kind: 'paragraph-alignment',
    coordinates: 'current-transaction',
    section: 0,
    paragraph: at,
    alignment: 'RIGHT',
  };
  const rejected = cli(`${fixtureDir}/two.hwpx`, bytes, forbidden, [preceding, operation(ref)]);
  assert.notEqual(rejected.status, 0);
  assert.equal(rejected.stdout, '');
  assert.match(rejected.stderr, /StaleSourceTableSplitReference/);
  await missing(forbidden);
});

test('real MCP stdio advertises strict shared schema; HWPX/HWP5 save/reopen/XML/CFB and late failure have the same host behavior', async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [`${source}packages/cli/src/mcp-bin.ts`, '--wasm', wasmPath],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const client = new Client({ name: 'source-cell-split-bridges', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tool = (await client.listTools()).tools.find((x) => x.name === 'apply_document_changes');
    assert(tool);
    assert.match(JSON.stringify(tool.inputSchema), /source-table-cell-split/);
    await writeFile(`${evidence}/mcp-schema.json`, JSON.stringify(tool, null, 2));
    const receipts = [];
    for (const [format, name] of [
      ['hwpx', 'single.hwpx'],
      ['hwp5', 'positive.hwp'],
    ]) {
      const bytes = await fixture(name),
        ref = await referenceOf(t, bytes),
        outputPath = `${evidence}/mcp-${name}`;
      const invoke = (operations, output) =>
        client.callTool({
          name: 'apply_document_changes',
          arguments: {
            inputPath: `${fixtureDir}/${name}`,
            outputPath: output,
            expectedSha256: hash(bytes),
            allowStaleLayout: true,
            operations,
          },
        });
      const good = await invoke([operation(ref)], outputPath);
      assert.notEqual(good.isError, true, JSON.stringify(good));
      const saved = await readFile(outputPath);
      await exactReopen(t, saved);
      await oracle(`mcp-${format}`, bytes, saved, format);
      const forbidden = `${evidence}/mcp-${format}-late-forbidden.${format === 'hwp5' ? 'hwp' : 'hwpx'}`;
      const bad = await invoke(
        [
          operation(ref),
          {
            kind: 'paragraph-alignment',
            coordinates: 'current-transaction',
            section: 0,
            paragraph: 0xffffffff,
            alignment: 'LEFT',
          },
        ],
        forbidden,
      );
      assert.equal(bad.isError, true);
      await missing(forbidden);
      const malformed = `${evidence}/mcp-${format}-malformed-forbidden.${format === 'hwp5' ? 'hwp' : 'hwpx'}`;
      const invalid = await invoke([operation(ref, { binding: {} })], malformed);
      assert.equal(invalid.isError, true);
      await missing(malformed);
      receipts.push({ format, good, bad, invalid });
    }
    await writeFile(`${evidence}/mcp-receipts.json`, JSON.stringify({ receipts, stderr }, null, 2));
  } finally {
    await client.close();
  }
});

test('controlled Native materialization makes an old serialized node number name a different same-size table; prepared target refuses it', async (t) => {
  const bytes = await fixture('two.hwpx'),
    doc = await opened(t, bytes),
    initial = tables(await modelOf(doc));
  assert.equal(initial.length, 2);
  const [op] = validateDocumentOperations([operation(initial[0].reference)]);
  prepareOperationSession(doc, [op]);
  const target = await prepareSourceTableCellSplits(doc, [op]);
  const node = initial[0].source.tableNode,
    first = doc.sdk.tableBindings(0).find((row) => row.tableNode === node);
  const originalText = doc.sdk.anchorText(0, first.paragraph);
  assert.notEqual(originalText, '');
  const resources = JSON.parse(await utf8(`${fixtureDir}/resources.json`)).hwpx;
  const host = doc.sdk.tablePlacements(0)[0].paragraph;
  doc.sdk.insertTable(0, host, 0, {
    rows: 2,
    columns: 2,
    width: 30000,
    rowHeight: 8000,
    resources,
  });
  const materialized = doc.sdk.save();
  doc.sdk.open(materialized);
  doc.sdk.enableHistoryV2();
  const current = doc.sdk.tableBindings(0),
    alias = current.find((row) => row.tableNode === node);
  assert(alias);
  assert.equal(alias.rows, 2);
  assert.equal(alias.columns, 2);
  assert.equal(doc.sdk.anchorText(0, alias.paragraph), '');
  assert.equal(new Set(current.map((row) => row.tableNode)).size, 3);
  const before = doc.sdk.save();
  assert.throws(() => target.apply(doc, op), /StaleSourceTableSplitReference/);
  assert.deepEqual(doc.sdk.save(), before);
  await writeFile(`${evidence}/node-alias-before.hwpx`, bytes);
  await writeFile(`${evidence}/node-alias-materialized.hwpx`, materialized);
  await writeFile(
    `${evidence}/NODE-ALIAS.json`,
    JSON.stringify(
      {
        serializedReference: op.reference,
        originalTableNode: node,
        originalCellText: originalText,
        currentCellText: '',
        currentTableCount: 3,
        expectedRows: 2,
        expectedColumns: 2,
        evidence:
          'controlled real SDK insert + save/reopen on the same SDK; new table reuses old source node; original bound target refused before writer call',
      },
      null,
      2,
    ),
  );
});

test('old Native keeps HWPX split support; foreign source references are all resolved before a preceding mutation', async (t) => {
  const bytes = await fixture('single.hwpx'),
    ref = await referenceOf(t, bytes),
    op = operation(ref);
  const old = await apply(bytes, [op], { wasm: oldBinary });
  const current = await apply(bytes, [op]);
  assert.deepEqual(old.bytes, current.bytes);
  const document = await opened(t, bytes);
  let mutated = 0,
    atClose;
  const sdk = {
    ...document.sdk,
    setParagraphAlignment() {
      mutated++;
      throw Error('MustNotMutate');
    },
  };
  const preceding = {
    kind: 'paragraph-alignment',
    coordinates: 'current-transaction',
    section: 0,
    paragraph: 1,
    alignment: 'RIGHT',
  };
  const foreign = operation(ref.replace(hash(bytes), 'b'.repeat(64)));
  await assert.rejects(
    apply(
      bytes,
      [preceding, foreign],
      {},
      {
        openDocument: async () => ({
          ...document,
          sdk,
          close() {
            atClose = document.sdk.save();
            document.close();
          },
        }),
      },
    ),
    /StaleObjectReference/,
  );
  assert.equal(mutated, 0);
  assert.deepEqual(Buffer.from(atClose), bytes);
});

test('real CLI and MCP execute both HWPX multi-cell modes through the existing entrypoints; CLI preserves the Native HWP5 limit', async (t) => {
  const bytes = await fixture('single.hwpx'),
    ref = await referenceOf(t, bytes);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [`${source}packages/cli/src/mcp-bin.ts`, '--wasm', wasmPath],
    stderr: 'pipe',
  });
  transport.stderr.on('data', () => {});
  const client = new Client({ name: 'split-modes', version: '1.0.0' });
  try {
    await client.connect(transport);
    for (const mode of ['each', 'merge-then-split']) {
      const op = operation(ref, { right: 2, rows: 1, columns: 2, mode });
      const golden = mode === 'each' ? eachGolden : mergeGolden;
      const cliOutput = `${evidence}/cli-${mode}.hwpx`;
      const result = cli(`${fixtureDir}/single.hwpx`, bytes, cliOutput, [op]);
      assert.equal(result.status, 0, result.stderr);
      const saved = await readFile(cliOutput);
      await exactReopen(t, saved);
      await oracle(`cli-mode-${mode}`, bytes, saved, 'hwpx', golden);
      const outputPath = `${evidence}/mcp-${mode}.hwpx`;
      const remote = await client.callTool({
        name: 'apply_document_changes',
        arguments: {
          inputPath: `${fixtureDir}/single.hwpx`,
          outputPath,
          expectedSha256: hash(bytes),
          allowStaleLayout: true,
          operations: [op],
        },
      });
      assert.notEqual(remote.isError, true, JSON.stringify(remote));
      const mcpSaved = await readFile(outputPath);
      assert.deepEqual(mcpSaved, saved);
      await exactReopen(t, mcpSaved);
      await oracle(`mcp-mode-${mode}`, bytes, mcpSaved, 'hwpx', golden);
    }
  } finally {
    await client.close();
  }
  const bad = await fixture('outline-mismatch.hwp'),
    badRef = await referenceOf(t, bad),
    output = `${evidence}/cli-known-limit-forbidden.hwp`;
  const rejected = cli(`${fixtureDir}/outline-mismatch.hwp`, bad, output, [operation(badRef)]);
  if (extentExpectation === 'reject') {
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.stdout, '');
    assert.match(rejected.stderr, /UnsupportedSourceTableGrid/);
    await missing(output);
  } else {
    assert.equal(rejected.status, 0, rejected.stderr);
    await verifyExtent('cli', bad, await readFile(output));
  }
});

test('real Native source inventory rejects mismatched dimensions, missing/foreign-format references and partial merged-cell rectangles before any write', async (t) => {
  const bytes = await fixture('single.hwpx'),
    ref = await referenceOf(t, bytes);
  for (const [op, error] of [
    [operation(ref, { expectedRows: 3 }), /SourceTableSplitDimensionsMismatch/],
    [operation(ref.replace(/table\/\d+$/, 'table/4294967295')), /TableReferenceNotFound/],
    [operation(ref.replace('/hwpx/', '/hwp5/')), /ObjectReferenceFormatMismatch/],
  ])
    await assert.rejects(apply(bytes, [op]), error);
  const merged = await fixture('merged.hwpx'),
    mergedRef = await referenceOf(t, merged);
  await assert.rejects(apply(merged, [operation(mergedRef)]), /SourceTableSplitPartialCell/);
  assert.deepEqual(await fixture('single.hwpx'), bytes);
  assert.deepEqual(await fixture('merged.hwpx'), merged);
});
