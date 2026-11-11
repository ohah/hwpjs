import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createNewDocumentBytes } from '../../../js/new-document.mjs';
import { createExperimentalHwp5Editor } from '../../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../../js/hwpx-editor.mjs';
import { openDocument } from '../src/engine.ts';
import { applyDocumentOperations } from '../src/document-operations.ts';
import { readDocumentModel } from '../src/document-model.ts';
const source = fileURLToPath(new URL('../../../', import.meta.url));
const {
  HWPJS_TEST_WASM: wasmPath,
  HWPJS_TEST_WASM_SHA256: wasmSha,
  HWPJS_H5_BULLET_TEST_OLD_WASM: oldPath,
  HWPJS_H5_BULLET_TEST_OLD_WASM_SHA256: oldSha,
  HWPJS_H5_BULLET_TEST_EVIDENCE: evidence,
} = process.env;
for (const input of [wasmPath, wasmSha, oldPath, oldSha, evidence])
  assert(input, 'ExplicitInputsRequired');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const binary = await readFile(wasmPath),
  oldBinary = await readFile(oldPath);
assert.match(wasmSha, /^[a-f0-9]{64}$/);
assert.match(oldSha, /^[a-f0-9]{64}$/);
assert.equal(hash(binary), wasmSha);
assert.equal(hash(oldBinary), oldSha);
const module = await WebAssembly.compile(binary);
await mkdir(evidence);
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
const edit = (extra = {}) => ({ mode: 'create', definition, apply: true, ...extra });
const op = (paragraph = 0, value = edit()) => ({
  kind: 'paragraph-bullet-definition',
  coordinates: 'current-transaction',
  section: 0,
  paragraph,
  edit: value,
});
const inputs = {};
for (const format of ['hwp5', 'hwpx']) {
  const bytes = await createNewDocumentBytes(module, format);
  const sdk =
    format === 'hwp5'
      ? await createExperimentalHwp5Editor(module, bytes)
      : await createHwpxEditor(module);
  try {
    if (format === 'hwpx') {
      sdk.open(bytes);
      sdk.splice(0, 1, 0, 0, 'FIRSTSECOND');
      sdk.splitParagraph({ section: 0, paragraph: 1, atUnit: 5 });
    } else {
      const raw = sdk.text(0, 0);
      assert.equal(raw.length, 17);
      sdk.splice({
        section: 0,
        paragraph: 0,
        startUnit: raw.length - 1,
        endUnit: raw.length - 1,
        text: 'FIRSTSECOND',
      });
      sdk.splitParagraph({ section: 0, paragraph: 0, atUnit: raw.length - 1 + 5 });
    }
    inputs[format] = format === 'hwp5' ? sdk.save({ allowStaleLayout: true }).bytes : sdk.save();
    await writeFile(
      join(evidence, 'original.' + (format === 'hwp5' ? 'hwp' : 'hwpx')),
      inputs[format],
    );
  } finally {
    sdk.close();
  }
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
const missing = (path) => assert.rejects(access(path), { code: 'ENOENT' });
async function opened(t, bytes, wasm = binary) {
  const value = await openDocument({ bytes, wasm });
  t.after(() => value.close());
  return value;
}
async function reopen(t, bytes) {
  const document = await opened(t, bytes),
    saved = document.save({ allowStaleLayout: true });
  assert.deepEqual(
    Buffer.from(document.format === 'hwp5' ? saved.bytes : saved),
    Buffer.from(bytes),
  );
  return document;
}
async function oracle(name, before, after, plan) {
  const a = join(evidence, name + '-before.hwp'),
    b = join(evidence, name + '-after.hwp'),
    p = join(evidence, name + '-plan.json');
  await writeFile(a, before);
  await writeFile(b, after);
  const data = { before: a, after: b, ...plan };
  await writeFile(p, JSON.stringify(data));
  const wrong = join(evidence, name + '-wrong-definition.json');
  await writeFile(
    wrong,
    JSON.stringify({
      ...data,
      definition: { ...data.definition, marker: data.definition.marker + 1 },
    }),
  );
  const variants = [wrong];
  if (plan.mode === 'resource-add') {
    const count = join(evidence, name + '-wrong-count.json');
    await writeFile(count, JSON.stringify({ ...data, bulletAdd: data.bulletAdd + 1 }));
    variants.push(count);
  }
  const bytes = Uint8Array.from(after),
    view = new DataView(bytes.buffer);
  bytes[(view.getUint32(48, true) + 1) * 2 ** view.getUint16(30, true) + 80] ^= 1;
  const bad = join(evidence, name + '-wrong-metadata.hwp'),
    metadata = join(evidence, name + '-wrong-metadata.json');
  await writeFile(bad, bytes);
  await writeFile(metadata, JSON.stringify({ ...data, after: bad }));
  variants.push(metadata);
  const script = join(source, 'tests/hwp5/paragraph-bullet-definition-oracle.py'),
    record = [];
  for (const flags of [[], ['-O']]) {
    const good = spawnSync('python3', ['-B', ...flags, script, p], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    for (const badPlan of variants) {
      const negative = spawnSync('python3', ['-B', ...flags, script, badPlan], {
        encoding: 'utf8',
      });
      assert.equal(negative.status, 1, negative.stdout + negative.stderr);
    }
    record.push({ flags, positive: JSON.parse(good.stdout), negativeRejected: variants.length });
  }
  await writeFile(join(evidence, name + '-oracle.json'), JSON.stringify(record, null, 2));
}
const createPlan = (paragraph) => ({
  mode: 'resource-add',
  bulletAdd: 1,
  shapeAdd: 1,
  paragraph,
  id: 1,
  definition,
});
const updateDefinition = {
  ...definition,
  marker: 0x25c6,
  alignment: 'CENTER',
  textOffsetType: 'PERCENT',
  textOffset: 65,
};

test('HWP5 Native original addresses are 0-based while HWPX Native addresses are 1-based; readmodel and independent CFB confirm selected root', async (t) => {
  const before = await opened(t, inputs.hwp5);
  assert.equal(before.sdk.paragraphCount(0), 2);
  const model = await readDocumentModel({ ...before });
  assert.deepEqual(
    model.sections[0].body
      .filter((x) => x.type === 'paragraph')
      .map((x) => [x.source.paragraph, x.displayText]),
    [
      [0, 'FIRST'],
      [1, 'SECOND'],
    ],
  );
  for (const paragraph of [0, 1]) {
    const result = await apply(inputs.hwp5, [op(paragraph)]);
    const document = await reopen(t, result.bytes);
    assert.equal(
      document.sdk.paragraphBulletDefinitions().definitionWriter,
      'character-definitions-v1',
    );
    assert.deepEqual(
      document.sdk.paragraphBulletDefinitions().declarations[0].definition,
      definition,
    );
    assert.deepEqual(
      (await readDocumentModel({ ...document })).sections[0].body.map((x) => x.displayText),
      model.sections[0].body.map((x) => x.displayText),
    );
    await oracle('address-' + paragraph, inputs.hwp5, result.bytes, createPlan(paragraph));
  }
  const hx = await opened(t, inputs.hwpx);
  assert.equal(hx.sdk.anchorText(0, 1), 'FIRST');
  await assert.rejects(apply(inputs.hwpx, [op(0)]), /InvalidOperationTarget/);
  await assert.rejects(apply(inputs.hwpx, [op(1)]), /UnsupportedBulletOwner/);
  const done = await apply(inputs.hwpx, [op(2)]);
  const current = await reopen(t, done.bytes);
  assert.deepEqual(current.sdk.paragraphBulletDefinitions().declarations[0].definition, definition);
  await writeFile(
    join(evidence, 'ADDRESS-CONTRACT.json'),
    JSON.stringify(
      {
        hwp5OriginalBase: 0,
        hwpxNativeBase: 1,
        hwp5Paragraphs: [0, 1],
        hwp5Display: ['FIRST', 'SECOND'],
        hwpxFirstParagraph: 1,
        hwpxWritableParagraph: 2,
        hwpxSectionDefinitionOwnerRejected: true,
      },
      null,
      2,
    ),
  );
});
test('HWP5 writer gate queries before lazy managed history admission; actual Native create/apply/update and save/reopen retain semantics', async (t) => {
  const document = await opened(t, inputs.hwp5),
    calls = [];
  assert.throws(() => document.sdk.historyStats(), /HistoryNotEnabled/);
  const sdk = {
    ...document.sdk,
    paragraphBulletDefinitions() {
      calls.push('query');
      return document.sdk.paragraphBulletDefinitions();
    },
    enableHistoryV2() {
      calls.push('history');
      return document.sdk.enableHistoryV2();
    },
    writeParagraphBulletDefinition(...args) {
      calls.push('write');
      return document.sdk.writeParagraphBulletDefinition(...args);
    },
  };
  const created = await apply(
    inputs.hwp5,
    [op(0)],
    {},
    { openDocument: async () => ({ ...document, sdk }) },
  );
  assert.deepEqual(calls, ['query', 'history', 'write']);
  const a = await reopen(t, created.bytes);
  const noop = await apply(created.bytes, [
    op(0, edit({ mode: 'update', id: 1, definition, apply: false })),
  ]);
  assert.equal(noop.changed, false);
  assert.deepEqual(noop.bytes, created.bytes);
  const updated = await apply(created.bytes, [
    op(0, edit({ mode: 'update', id: 1, definition: updateDefinition, apply: false })),
  ]);
  const b = await reopen(t, updated.bytes);
  assert.deepEqual(b.sdk.paragraphBulletDefinitions().declarations[0].definition, updateDefinition);
  assert.equal(a.sdk.paragraphShapeId(0, 0), b.sdk.paragraphShapeId(0, 0));
  await oracle('service-create', inputs.hwp5, created.bytes, createPlan(0));
  await oracle('service-update', created.bytes, updated.bytes, {
    mode: 'definition-update',
    id: 1,
    definition: updateDefinition,
  });
});
test('old HWP5 Native performs zero writer/history/preceding mutations; definitions gate refuses absent ABI with unchanged input', async (t) => {
  const document = await opened(t, inputs.hwp5, oldBinary),
    calls = [];
  let final;
  assert.deepEqual(document.sdk.paragraphBulletDefinitions(), {
    state: 'unavailable',
    reason: 'ParagraphBulletDefinitionsAbiUnavailable',
  });
  const sdk = {
    ...document.sdk,
    enableHistoryV2() {
      calls.push('history');
      return document.sdk.enableHistoryV2();
    },
    setParagraphAlignment(...args) {
      calls.push('alignment');
      return document.sdk.setParagraphAlignment(...args);
    },
    writeParagraphBulletDefinition(...args) {
      calls.push('write');
      return document.sdk.writeParagraphBulletDefinition(...args);
    },
  };
  await assert.rejects(
    apply(
      inputs.hwp5,
      [
        {
          kind: 'paragraph-alignment',
          coordinates: 'current-transaction',
          section: 0,
          paragraph: 0,
          alignment: 'CENTER',
        },
        op(0),
      ],
      { wasm: oldBinary },
      {
        openDocument: async () => ({
          ...document,
          sdk,
          close() {
            final = document.save({ allowStaleLayout: true }).bytes;
            document.close();
          },
        }),
      },
    ),
    /BulletDefinitionWriteAbiUnavailable/,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(Buffer.from(final), Buffer.from(inputs.hwp5));
});
test('HWP5 invalid native geometry/ID/late operation and missing stale-layout consent return no service bytes', async () => {
  for (const definitionExtra of [
    { marker: 0x1f600 },
    { textOffset: 32768 },
    { widthAdjust: 32768 },
    { charShapeId: 0xfffffffe },
  ])
    await assert.rejects(
      apply(inputs.hwp5, [op(0, edit({ definition: { ...definition, ...definitionExtra } }))]),
    );
  await assert.rejects(apply(inputs.hwp5, [op(0)], { allowStaleLayout: false }), /Layout|Stale/);
  await assert.rejects(
    apply(inputs.hwp5, [op(0), op(0, edit({ mode: 'update', id: 999, apply: false }))]),
  );
  await assert.rejects(
    apply(inputs.hwp5, [
      op(0),
      {
        kind: 'paragraph-alignment',
        coordinates: 'current-transaction',
        section: 0,
        paragraph: 0xffffffff,
        alignment: 'LEFT',
      },
    ]),
  );
});
function cli(input, bytes, output, operations, wasm = wasmPath) {
  return spawnSync(
    process.execPath,
    [
      join(source, 'packages/cli/src/bin.ts'),
      'apply',
      input,
      '--expect-sha256',
      hash(bytes),
      '--operations',
      JSON.stringify(operations),
      '--output',
      output,
      '--allow-stale-layout',
      '--wasm',
      wasm,
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
}
test('actual CLI HWP5 create/update CFB normal-O; readmodel Native paragraph target and late/old/native errors publish nothing', async (t) => {
  const input = join(evidence, 'original.hwp'),
    output = join(evidence, 'cli-created.hwp');
  const result = cli(input, inputs.hwp5, output, [op(1)]);
  assert.equal(result.status, 0, result.stderr);
  const created = await readFile(output);
  await reopen(t, created);
  await oracle('cli-create', inputs.hwp5, created, createPlan(1));
  const read = spawnSync(
    process.execPath,
    [
      join(source, 'packages/cli/src/bin.ts'),
      'read',
      output,
      '--view',
      'structure',
      '--wasm',
      wasmPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(read.status, 0, read.stderr);
  assert.match(read.stdout, /s0:p0/);
  assert.match(read.stdout, /s0:p1/);
  assert.match(read.stdout, /FIRST/);
  assert.match(read.stdout, /SECOND/);
  const updatedPath = join(evidence, 'cli-updated.hwp'),
    updated = cli(output, created, updatedPath, [
      op(1, edit({ mode: 'update', id: 1, definition: updateDefinition, apply: false })),
    ]);
  assert.equal(updated.status, 0, updated.stderr);
  const bytes = await readFile(updatedPath);
  await reopen(t, bytes);
  await oracle('cli-update', created, bytes, {
    mode: 'definition-update',
    id: 1,
    definition: updateDefinition,
  });
  for (const [name, ops, wasm] of [
    ['old', [op(0)], oldPath],
    ['late', [op(0), op(0, edit({ mode: 'update', id: 999, apply: false }))], wasmPath],
    ['unicode', [op(0, edit({ definition: { ...definition, marker: 0x1f600 } }))], wasmPath],
  ]) {
    const target = join(evidence, 'cli-' + name + '-forbidden.hwp'),
      bad = cli(input, inputs.hwp5, target, ops, wasm);
    assert.notEqual(bad.status, 0);
    assert.equal(bad.stdout, '');
    await missing(target);
  }
  assert.deepEqual(await readFile(input), Buffer.from(inputs.hwp5));
  await writeFile(join(evidence, 'cli-read-model.txt'), read.stdout);
});
async function mcpClient(wasm, callback) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(source, 'packages/cli/src/mcp-bin.ts'), '--wasm', wasm],
    stderr: 'pipe',
  });
  transport.stderr.on('data', () => {});
  const client = new Client({ name: 'hwp5-bullet-bridges', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
    await transport.close();
  }
}
const rpc = async (client, input, output, operations) =>
  client.callTool({
    name: 'apply_document_changes',
    arguments: {
      inputPath: input,
      outputPath: output,
      expectedSha256: hash(await readFile(input)),
      allowStaleLayout: true,
      operations,
    },
  });
test('actual MCP uses the common HWP5 writer/readmodel and old/late failures publish no file', async (t) => {
  const input = join(evidence, 'original.hwp');
  await mcpClient(wasmPath, async (client) => {
    const output = join(evidence, 'mcp-created.hwp'),
      result = await rpc(client, input, output, [op(0)]);
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const created = await readFile(output);
    await reopen(t, created);
    await oracle('mcp-create', inputs.hwp5, created, createPlan(0));
    const updated = join(evidence, 'mcp-updated.hwp'),
      update = await rpc(client, output, updated, [
        op(0, edit({ mode: 'update', id: 1, definition: updateDefinition, apply: false })),
      ]);
    assert.notEqual(update.isError, true, JSON.stringify(update));
    const after = await readFile(updated);
    await reopen(t, after);
    await oracle('mcp-update', created, after, {
      mode: 'definition-update',
      id: 1,
      definition: updateDefinition,
    });
    const view = await client.callTool({
      name: 'read_document',
      arguments: { inputPath: updated, view: 'structure' },
    });
    assert.notEqual(view.isError, true);
    assert.match(JSON.stringify(view), /FIRST/);
    assert.match(JSON.stringify(view), /s0:p0/);
    const target = join(evidence, 'mcp-late-forbidden.hwp'),
      bad = await rpc(client, input, target, [
        op(0),
        op(0, edit({ mode: 'update', id: 999, apply: false })),
      ]);
    assert.equal(bad.isError, true);
    await missing(target);
    await writeFile(
      join(evidence, 'mcp-receipts.json'),
      JSON.stringify({ result, update, view, bad }, null, 2),
    );
  });
  await mcpClient(oldPath, async (client) => {
    const output = join(evidence, 'mcp-old-forbidden.hwp'),
      result = await rpc(client, input, output, [op(0)]);
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /BulletDefinitionWriteAbiUnavailable/);
    await missing(output);
  });
});
