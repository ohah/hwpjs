import { nativeWasmExpectedSHA256 } from '../../../tools/tests/helpers/native-wasm-pin.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createHwpxEditor } from '../../../js/hwpx-editor.mjs';
import { openDocument } from '../src/engine.ts';
import { applyDocumentOperations, validateDocumentOperations } from '../src/document-operations.ts';

const source = fileURLToPath(new URL('../../../', import.meta.url));
const wasmPath = process.env.HWPJS_TEST_WASM;
const oldPath = process.env.HWPJS_TEST_OLD_WASM;
const inputPath = process.env.HWPJS_TEST_HWPX;
const hwp5Path = process.env.HWPJS_TEST_HWP5;
const evidence = process.env.HWPJS_TEST_EVIDENCE;
for (const value of [wasmPath, oldPath, inputPath, hwp5Path, evidence])
  assert(value, 'ExplicitEvidenceInputsRequired');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert(process.env.HWPJS_TEST_WASM_EXPECTED_SHA256, 'ExplicitNativeSHARequired');
const binary = await readFile(wasmPath);
assert.equal(hash(binary), nativeWasmExpectedSHA256());
const input = await readFile(inputPath);
const definition = {
  marker: 0x2605,
  alignment: 'RIGHT',
  useInstanceWidth: false,
  autoIndent: true,
  widthAdjust: -50,
  textOffsetType: 'HWPUNIT',
  textOffset: 750,
  charShapeId: 0xffffffff,
};
const op = (edit = { mode: 'create', apply: true, definition }) => ({
  kind: 'paragraph-bullet-definition',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 2,
  edit,
});
const late = {
  kind: 'paragraph-alignment',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0xffffffff,
  alignment: 'LEFT',
};
await mkdir(evidence, { recursive: true });
const missing = async (path) => assert.rejects(access(path), { code: 'ENOENT' });
async function oracle(name, before, after, mode, id, expected, apply) {
  const beforePath = `${evidence}/${name}-before.hwpx`,
    afterPath = `${evidence}/${name}-after.hwpx`;
  const planPath = `${evidence}/${name}-plan.json`,
    invalidPath = `${evidence}/${name}-invalid.json`;
  await writeFile(beforePath, before);
  await writeFile(afterPath, after);
  const plan = {
    before: beforePath,
    after: afterPath,
    mode,
    id,
    definition: expected,
    apply,
    paragraph: 1,
  };
  await writeFile(planPath, JSON.stringify(plan));
  await writeFile(
    invalidPath,
    JSON.stringify({ ...plan, definition: { ...expected, marker: expected.marker + 1 } }),
  );
  const script = `${source}tests/hwpx/paragraph-bullet-definition-oracle.py`;
  for (const flags of [[], ['-O']]) {
    const valid = spawnSync('python3', ['-B', ...flags, script, planPath], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).verified, true);
    const invalid = spawnSync('python3', ['-B', ...flags, script, invalidPath], {
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Wrong marker/);
  }
}
async function reopened(bytes, expected) {
  const sdk = await createHwpxEditor(binary);
  try {
    sdk.open(bytes);
    assert.deepEqual(sdk.paragraphBulletDefinitions().declarations[0].definition, expected);
    assert.deepEqual(Buffer.from(sdk.save()), Buffer.from(bytes));
  } finally {
    sdk.close();
  }
}
const cli = (before, output, operations, wasm = wasmPath) =>
  spawnSync(
    process.execPath,
    [
      `${source}packages/cli/src/bin.ts`,
      'apply',
      before,
      '--operations',
      JSON.stringify(operations),
      '--expect-sha256',
      hash(before === inputPath ? input : readCache.get(before)),
      '--output',
      output,
      '--wasm',
      wasm,
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
const readCache = new Map();

test('shared validation captures edit; rejects malformed and hidden values before opening', async () => {
  const request = op();
  const captured = validateDocumentOperations([request]);
  request.edit.definition = { ...definition, marker: 0x2606 };
  assert.equal(captured[0].edit.definition.marker, 0x2605);
  assert(Object.isFrozen(captured[0].edit.definition));
  for (const edit of [
    { mode: 'create', apply: true, definition: { ...definition, marker: 0xd800 } },
    { mode: 'update', apply: false, definition },
    { mode: 'create', apply: 'true', definition },
    { mode: 'create', apply: false, definition: { ...definition, textOffset: 1000001 } },
    { mode: 'create', apply: false, definition: { ...definition, surprise: true } },
  ]) {
    assert.throws(() => validateDocumentOperations([op(edit)]));
  }
  let opened = false;
  await assert.rejects(
    applyDocumentOperations(
      {
        bytes: input,
        wasm: binary,
        expectedSha256: hash(input),
        operations: [op(), op({ mode: 'bad', apply: true, definition })],
      },
      {
        openDocument() {
          opened = true;
          throw Error('MustNotOpen');
        },
      },
    ),
  );
  assert.equal(opened, false);
});

test('real CLI create/update, exact SDK save/reopen and independent XML oracle; late error/old ABI/HWP5/no-overwrite publish nothing', async () => {
  const createdPath = `${evidence}/cli-created.hwpx`;
  const result = cli(inputPath, createdPath, [op()]);
  assert.equal(result.status, 0, result.stderr);
  const created = await readFile(createdPath);
  readCache.set(createdPath, created);
  await reopened(created, definition);
  await oracle('cli-create', input, created, 'create', 1, definition, true);
  const changed = {
    ...definition,
    marker: 0x2606,
    alignment: 'CENTER',
    textOffsetType: 'PERCENT',
    textOffset: 65,
  };
  const updatedPath = `${evidence}/cli-updated.hwpx`;
  const update = cli(createdPath, updatedPath, [
    op({ mode: 'update', id: 1, definition: changed, apply: false }),
  ]);
  assert.equal(update.status, 0, update.stderr);
  const updated = await readFile(updatedPath);
  await reopened(updated, changed);
  await oracle('cli-update', created, updated, 'update', 1, changed, false);
  for (const [name, operations, wasm, error] of [
    ['late', [op(), late], wasmPath, /error:/],
    ['old', [op()], oldPath, /BulletDefinitionWriteAbiUnavailable/],
    [
      'old-batch',
      [
        {
          kind: 'paragraph-alignment',
          coordinates: 'current-transaction',
          section: 0,
          paragraph: 2,
          alignment: 'LEFT',
        },
        op(),
      ],
      oldPath,
      /BulletDefinitionWriteAbiUnavailable/,
    ],
    [
      'invalid-id',
      [op({ mode: 'update', id: 99999, definition, apply: false })],
      wasmPath,
      /error:/,
    ],
  ]) {
    const output = `${evidence}/cli-${name}-forbidden.hwpx`;
    const rejected = cli(inputPath, output, operations, wasm);
    assert.notEqual(rejected.status, 0, rejected.stderr);
    assert.equal(rejected.stdout, '');
    assert.match(rejected.stderr, error);
    await missing(output);
  }
  const overwrite = cli(inputPath, createdPath, [op()]);
  assert.notEqual(overwrite.status, 0);
  assert.equal(overwrite.stdout, '');
  assert.deepEqual(await readFile(createdPath), created);
  const original = await readFile(hwp5Path),
    hwp5Output = `${evidence}/hwp5-forbidden.hwp`;
  readCache.set(hwp5Path, original);
  const hwp5 = cli(hwp5Path, hwp5Output, [op()]);
  assert.notEqual(hwp5.status, 0);
  assert.match(hwp5.stderr, /Hwp5BulletDefinitionWriteUnavailable/);
  await missing(hwp5Output);
  assert.deepEqual(await readFile(inputPath), input);
  assert.deepEqual(await readFile(hwp5Path), original);
  await writeFile(
    `${evidence}/cli-results.json`,
    JSON.stringify(
      {
        createdSha256: hash(created),
        updatedSha256: hash(updated),
        inputSha256: hash(input),
        hwp5Sha256: hash(original),
        cli: 'create/update/reopen/late/old/old-batch/HWP5/no-overwrite passed',
      },
      null,
      2,
    ),
  );
});

test('real MCP stdio exposes structured edit schema and reuses CLI transaction for create/update and late failure', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [`${source}packages/cli/src/mcp-bin.ts`, '--wasm', wasmPath],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const client = new Client({ name: 'bullet-definition-bridges', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const schema = listed.tools.find((tool) => tool.name === 'apply_document_changes');
    assert(schema);
    assert.match(JSON.stringify(schema.inputSchema), /paragraph-bullet-definition/);
    assert.match(JSON.stringify(schema.inputSchema), /textOffsetType/);
    await writeFile(`${evidence}/mcp-apply-schema.json`, JSON.stringify(schema, null, 2));
    const invoke = (before, outputPath, operations, bytes = input) =>
      client.callTool({
        name: 'apply_document_changes',
        arguments: { inputPath: before, outputPath, expectedSha256: hash(bytes), operations },
      });
    const createdPath = `${evidence}/mcp-created.hwpx`;
    const result = await invoke(inputPath, createdPath, [op()]);
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const created = await readFile(createdPath);
    await reopened(created, definition);
    await oracle('mcp-create', input, created, 'create', 1, definition, true);
    const changed = { ...definition, marker: 0x26, textOffset: -75 };
    const updatedPath = `${evidence}/mcp-updated.hwpx`;
    const update = await invoke(
      createdPath,
      updatedPath,
      [op({ mode: 'update', id: 1, definition: changed, apply: false })],
      created,
    );
    assert.notEqual(update.isError, true, JSON.stringify(update));
    const updated = await readFile(updatedPath);
    await reopened(updated, changed);
    await oracle('mcp-update', created, updated, 'update', 1, changed, false);
    const failedPath = `${evidence}/mcp-late-forbidden.hwpx`;
    const rejected = await invoke(inputPath, failedPath, [op(), late]);
    assert.equal(rejected.isError, true);
    await missing(failedPath);
    const badPath = `${evidence}/mcp-malformed-forbidden.hwpx`;
    const malformed = await invoke(inputPath, badPath, [
      op({ mode: 'update', definition, apply: true }),
    ]);
    assert.equal(malformed.isError, true);
    await missing(badPath);
    await writeFile(
      `${evidence}/mcp-results.json`,
      JSON.stringify({ result, update, rejected, malformed, stderr }, null, 2),
    );
  } finally {
    await client.close();
  }
});

test('older ABI rejects the whole real session before preceding mutations or history setup', async () => {
  const oldWasm = await readFile(oldPath);
  const document = await openDocument({ bytes: input, wasm: oldWasm, expectedSha256: hash(input) });
  const inventory = document.sdk.paragraphBulletDefinitions();
  assert.equal(inventory.state, 'available');
  assert.equal(inventory.definitionWriter, undefined);
  let observed;
  let mutations = 0;
  const sdk = {
    ...document.sdk,
    setParagraphAlignment() {
      mutations++;
      throw Error('MustNotMutate');
    },
    enableHistoryV2() {
      mutations++;
      throw Error('MustNotEnableHistory');
    },
  };
  const close = () => {
    observed = document.sdk.save();
    document.close();
  };
  await assert.rejects(
    applyDocumentOperations(
      {
        bytes: input,
        wasm: oldWasm,
        expectedSha256: hash(input),
        operations: [
          {
            kind: 'paragraph-alignment',
            coordinates: 'current-transaction',
            section: 0,
            paragraph: 2,
            alignment: 'CENTER',
          },
          op(),
        ],
      },
      { openDocument: async () => ({ ...document, sdk, close }) },
    ),
    /BulletDefinitionWriteAbiUnavailable/,
  );
  assert.equal(mutations, 0);
  assert.deepEqual(Buffer.from(observed), input);
});

test('mixed pending paragraph formatting survives the Native definition document swap', async () => {
  const alignment = {
    kind: 'paragraph-alignment',
    coordinates: 'current-transaction',
    section: 0,
    paragraph: 2,
    alignment: 'RIGHT',
  };
  const apply = (operations) =>
    applyDocumentOperations({
      bytes: input,
      wasm: binary,
      expectedSha256: hash(input),
      operations,
    });
  const aligned = await apply([alignment]);
  const combined = await apply([alignment, op()]);
  await reopened(combined.bytes, definition);
  await oracle(
    'cli-service-pending-format',
    aligned.bytes,
    combined.bytes,
    'create',
    1,
    definition,
    true,
  );
});

test('real MCP old writer and HWP5 rejections publish no file', async () => {
  for (const [name, engine, before] of [
    ['old', oldPath, inputPath],
    ['hwp5', wasmPath, hwp5Path],
  ]) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [`${source}packages/cli/src/mcp-bin.ts`, '--wasm', engine],
      stderr: 'pipe',
    });
    transport.stderr.on('data', () => {});
    const client = new Client({ name: `bullet-rejection-${name}`, version: '1.0.0' });
    try {
      await client.connect(transport);
      const outputPath = `${evidence}/mcp-${name}-forbidden.hwpx`;
      const result = await client.callTool({
        name: 'apply_document_changes',
        arguments: {
          inputPath: before,
          outputPath,
          expectedSha256: hash(await readFile(before)),
          operations: [op()],
        },
      });
      assert.equal(result.isError, true);
      await missing(outputPath);
      assert.match(
        JSON.stringify(result),
        name === 'old'
          ? /BulletDefinitionWriteAbiUnavailable/
          : /Hwp5BulletDefinitionWriteUnavailable/,
      );
      await writeFile(`${evidence}/mcp-${name}-rejected.json`, JSON.stringify(result, null, 2));
    } finally {
      await client.close();
    }
  }
});
