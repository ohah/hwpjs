import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { openDocument } from '../src/engine.ts';
import { readDocumentModel } from '../src/document-model.ts';
import { applyDocumentOperations, validateDocumentOperations } from '../src/document-operations.ts';
import { prepareOperationSession } from '../src/mutations/dispatch.ts';
import { prepareSourceTableCellSplits } from '../src/mutations/source-table-cell-split.ts';
const source = fileURLToPath(new URL('../../../', import.meta.url));
const {
  HWPJS_TEST_WASM: wasmPath,
  HWPJS_TEST_WASM_SHA256: pin,
  HWPJS_MERGED_CLI_OLD_WASM: oldPath,
  HWPJS_MERGED_CLI_OLD_WASM_SHA256: oldPin,
  HWPJS_MERGED_CLI_EVIDENCE: evidence,
} = process.env;
for (const p of [wasmPath, oldPath, evidence])
  assert(p && isAbsolute(p), 'ExplicitAbsoluteInputsRequired');
const wasm = await readFile(wasmPath),
  old = await readFile(oldPath),
  hash = (b) => createHash('sha256').update(b).digest('hex');
assert.equal(hash(wasm), pin);
assert.equal(hash(old), oldPin);
await mkdir(evidence);
const fixtureRoot = join(source, 'tests/fixtures/hwp5-merged-cell-split');
const fixturePins = JSON.parse(await readFile(join(fixtureRoot, 'sha256.json'), 'utf8'));
const cases = [
    ['full', 2, 2, 0],
    ['vertical', 3, 2, 0],
    ['horizontal', 2, 3, 0],
    ['unselected-span', 2, 2, 1],
    ['offset', 3, 2, 4],
  ],
  inputs = {},
  operations = {};
async function open(bytes, binary = wasm) {
  return openDocument({ bytes, wasm: binary });
}
for (const [name, rows, columns, index] of cases) {
  const bytes = await readFile(join(fixtureRoot, name + '.hwp'));
  assert.equal(hash(bytes), fixturePins[name]);
  inputs[name] = bytes;
  const d = await open(bytes);
  try {
    const model = await readDocumentModel({ ...d }),
      table = model.sections[0].body.find((x) => x.type === 'table');
    const cells = [...new Map(d.sdk.tableBindings(0).map((x) => [x.listNode, x])).values()],
      cell = cells[index];
    operations[name] = {
      kind: 'source-table-cell-split',
      coordinates: 'current-transaction',
      reference: table.reference,
      expectedRows: cell.rows,
      expectedColumns: cell.columns,
      top: cell.row,
      left: cell.column,
      bottom: cell.row + cell.rowSpan,
      right: cell.column + cell.columnSpan,
      rows,
      columns,
      mode: 'each',
      equalizeRows: true,
    };
  } finally {
    d.close();
  }
}
const apply = (name, ops = [operations[name]], more = {}, deps) =>
  applyDocumentOperations(
    {
      bytes: inputs[name],
      wasm,
      expectedSha256: hash(inputs[name]),
      allowStaleLayout: true,
      operations: ops,
      ...more,
    },
    deps,
  );
async function exact(bytes) {
  const d = await open(bytes);
  try {
    assert.deepEqual(Buffer.from(d.save({ allowStaleLayout: true }).bytes), Buffer.from(bytes));
  } finally {
    d.close();
  }
}
async function oracle(name, kind, after) {
  const path = join(evidence, name + '-after.hwp');
  await writeFile(path, after);
  const before = join(fixtureRoot, kind + '.hwp'),
    script = join(source, 'tests/hwp5/source-table-merged-cell-oracle.py');
  const altered = Buffer.from(after),
    ss = 2 ** altered.readUInt16LE(30),
    at = (altered.readUInt32LE(48) + 1) * ss + 80;
  altered[at] ^= 1;
  const bad = join(evidence, name + '-metadata.hwp');
  await writeFile(bad, altered);
  const reports = [];
  for (const flags of [[], ['-O']]) {
    const r = spawnSync('python3', ['-B', ...flags, script, kind, before, path], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    for (const wrong of [before, bad]) {
      const result = spawnSync('python3', ['-B', ...flags, script, kind, before, wrong], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
    }
    reports.push({ flags, positive: JSON.parse(r.stdout), unchangedAndMetadataRejected: true });
  }
  await writeFile(join(evidence, name + '-oracle.json'), JSON.stringify(reports, null, 2));
}
const alignment = {
  kind: 'paragraph-alignment',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0,
  alignment: 'CENTER',
};
const late = { ...alignment, paragraph: 0xffffffff };
const missing = (path) => assert.rejects(access(path), { code: 'ENOENT' });
function cli(name, output, ops, engine = wasmPath) {
  return spawnSync(
    process.execPath,
    [
      join(source, 'packages/cli/src/bin.ts'),
      'apply',
      join(fixtureRoot, name + '.hwp'),
      '--expect-sha256',
      hash(inputs[name]),
      '--operations',
      JSON.stringify(ops),
      '--output',
      output,
      '--allow-stale-layout',
      '--wasm',
      engine,
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
}
async function mcp(engine, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(source, 'packages/cli/src/mcp-bin.ts'), '--wasm', engine],
    stderr: 'pipe',
  });
  transport.stderr.on('data', () => {});
  const client = new Client({ name: 'merged-source-cell-split', version: '1.0.0' });
  try {
    await client.connect(transport);
    await fn(client);
  } finally {
    try {
      await client.close();
    } finally {
      await transport.close();
    }
  }
}
const rpc = (client, name, output, ops) =>
  client.callTool({
    name: 'apply_document_changes',
    arguments: {
      inputPath: join(fixtureRoot, name + '.hwp'),
      outputPath: output,
      expectedSha256: hash(inputs[name]),
      operations: ops,
      allowStaleLayout: true,
    },
  });
test('exact controlled fixtures and capability distinguish merged profile from explicit old false', async () => {
  for (const binary of [wasm, old]) {
    const d = await open(inputs.full, binary);
    try {
      d.sdk.enableHistoryV2();
      const cap = d.sdk.sourceTableCellSplitCapabilities();
      assert.equal(cap.supportsMergedInput, binary === wasm);
      assert.equal(cap.maxSelectedCells, 1);
      assert.equal(cap.supportsMergeThenSplit, false);
      assert.equal(cap.supportsPreserveRowHeights, false);
    } finally {
      d.close();
    }
  }
});
test('source service five full-span single physical cells, including unselected spans/offset, exact reopen and independent CFB normal/-O', async () => {
  for (const [name] of cases) {
    const r = await apply(name);
    await exact(r.bytes);
    await oracle('service-' + name, name, r.bytes);
  }
});
test('old false keeps whole-table unmerged guard and refuses before preceding mutation; zero writers/save', async () => {
  for (const [name] of cases) {
    const d = await open(inputs[name], old),
      calls = [];
    const sdk = { ...d.sdk };
    for (const method of ['setParagraphAlignment', 'splitSourceTableCells']) {
      const fn = sdk[method];
      sdk[method] = (...args) => {
        calls.push(method);
        return fn(...args);
      };
    }
    await assert.rejects(
      apply(
        name,
        [alignment, operations[name]],
        { wasm: old },
        {
          openDocument: async () => ({
            ...d,
            sdk,
            save() {
              calls.push('save');
              return d.save({ allowStaleLayout: true });
            },
          }),
        },
      ),
      /UnsupportedSourceTableSplitSelection/,
    );
    assert.deepEqual(calls, []);
  }
});
test('partial/multiple/mode/height/grid errors keep strict full batch admission before any write', async () => {
  const base = operations.full;
  const invalid = [
    { ...base, bottom: base.top + 1, right: base.left + 1 },
    { ...base, mode: 'merge-then-split' },
    { ...base, equalizeRows: false },
    { ...base, expectedRows: base.expectedRows + 1 },
  ];
  const multi = { ...operations.vertical, bottom: 2, right: 2 };
  for (const [name, operation] of [...invalid.map((x) => ['full', x]), ['vertical', multi]]) {
    const d = await open(inputs[name]),
      calls = [];
    const sdk = { ...d.sdk };
    for (const method of ['setParagraphAlignment', 'splitSourceTableCells']) {
      const fn = sdk[method];
      sdk[method] = (...args) => {
        calls.push(method);
        return fn(...args);
      };
    }
    await assert.rejects(
      apply(name, [alignment, operation], {}, { openDocument: async () => ({ ...d, sdk }) }),
    );
    assert.deepEqual(calls, []);
  }
});
test('existing binding/session/source fingerprint and owner fingerprint reject foreign, undoABA and stale ticket reuse', async () => {
  const d = await open(inputs.full),
    other = await open(inputs.full);
  let mutate = false;
  const real = d.sdk;
  const document = {
    ...d,
    sdk: {
      ...real,
      tableBindings(section) {
        const rows = real.tableBindings(section);
        return mutate ? rows.map((x) => ({ ...x, width: x.width + 1 })) : rows;
      },
    },
  };
  try {
    const [operation] = validateDocumentOperations([operations.full]);
    prepareOperationSession(document, [operation]);
    const prepared = await prepareSourceTableCellSplits(document, [operation]);
    assert.throws(() => prepared.apply(other, operation), /Foreign/);
    document.sourceSha256 = 'b'.repeat(64);
    assert.throws(() => prepared.apply(document, operation), /Foreign/);
    document.sourceSha256 = d.sourceSha256;
    mutate = true;
    assert.throws(() => prepared.apply(document, operation), /Stale/);
    mutate = false;
    real.setParagraphAlignment(alignment);
    assert.equal(real.undo(), true);
    assert.throws(() => prepared.apply(document, operation), /Stale/);
    assert.deepEqual(
      Buffer.from(d.save({ allowStaleLayout: true }).bytes),
      Buffer.from(inputs.full),
    );
  } finally {
    d.close();
    other.close();
  }
  await assert.rejects(
    apply('full', [operations.full, operations.full]),
    /StaleSourceTableSplitReference/,
  );
});
test('actual CLI five controlled profiles, late error and old false never publish partial files', async () => {
  for (const [name] of cases) {
    const output = join(evidence, 'cli-' + name + '.hwp'),
      r = cli(name, output, [operations[name]]);
    assert.equal(r.status, 0, r.stderr);
    const bytes = await readFile(output);
    await exact(bytes);
    await oracle('cli-' + name, name, bytes);
  }
  for (const [name, engine, ops] of [
    ['old', oldPath, [alignment, operations.full]],
    ['late', wasmPath, [operations.full, late]],
    ['second-stale', wasmPath, [operations.full, operations.full]],
  ]) {
    const path = join(evidence, 'cli-' + name + '-forbidden.hwp'),
      r = cli('full', path, ops, engine);
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    await missing(path);
  }
  assert.deepEqual(await readFile(join(fixtureRoot, 'full.hwp')), inputs.full);
});
test('actual MCP same five full-span writer profiles and strict/late/old errors with finally stdio closure', async () => {
  await mcp(wasmPath, async (client) => {
    for (const [name] of cases) {
      const output = join(evidence, 'mcp-' + name + '.hwp'),
        r = await rpc(client, name, output, [operations[name]]);
      assert.notEqual(r.isError, true, JSON.stringify(r));
      await oracle('mcp-' + name, name, await readFile(output));
      await exact(await readFile(output));
    }
    for (const [name, ops] of [
      ['partial', [{ ...operations.full, bottom: 1, right: 1 }]],
      ['late', [operations.full, late]],
      ['stale', [operations.full, operations.full]],
    ]) {
      const output = join(evidence, 'mcp-' + name + '-forbidden.hwp'),
        r = await rpc(client, 'full', output, ops);
      assert.equal(r.isError, true);
      await missing(output);
    }
  });
  await mcp(oldPath, async (client) => {
    const output = join(evidence, 'mcp-old-forbidden.hwp'),
      r = await rpc(client, 'full', output, [alignment, operations.full]);
    assert.equal(r.isError, true);
    assert.match(JSON.stringify(r), /UnsupportedSourceTableSplitSelection/);
    await missing(output);
  });
});
