import { withoutAtomicFormattingExports } from './helpers/character-old-abi.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { generateCharacterExtensionFixtures } from './helpers/character-extensions-fixtures.mjs';
import { applyDocumentOperations, validateDocumentOperations } from '../src/document-operations.ts';
import { openDocument } from '../src/engine.ts';
import { prepareOperationSession } from '../src/mutations/dispatch.ts';
import { prepareCharacterExtensions } from '../src/mutations/character-extensions.ts';
const source = fileURLToPath(new URL('../../../', import.meta.url));
const {
  HWPJS_TEST_WASM: wasmPath,
  HWPJS_TEST_WASM_SHA256: pin,
  HWPJS_CHARACTER_TEST_OLD_WASM: oldInput,
  HWPJS_CHARACTER_TEST_OLD_WASM_SHA256: oldPin,
  HWPJS_CHARACTER_TEST_EVIDENCE: evidence,
} = process.env;
for (const p of [wasmPath, oldInput, evidence])
  assert(p && isAbsolute(p), 'ExplicitAbsoluteInputsRequired');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const wasm = await readFile(wasmPath),
  originalOld = await readFile(oldInput);
assert.equal(hash(wasm), pin);
assert.equal(hash(originalOld), oldPin);
await mkdir(evidence);
const oldWasm = withoutAtomicFormattingExports(originalOld),
  oldPath = join(evidence, 'old-atomic-abi.wasm');
await writeFile(oldPath, oldWasm);
await writeFile(
  join(evidence, 'OLD-ABI.json'),
  JSON.stringify({
    input: oldInput,
    inputSha256: oldPin,
    derivedSha256: hash(oldWasm),
    testOnlyExportMask: true,
  }),
);
const inputs = await generateCharacterExtensionFixtures({
  wasmModule: await WebAssembly.compile(wasm),
  directory: join(evidence, 'fixtures'),
});
const properties = {
  size: 1900,
  bold: true,
  italic: true,
  underline: 'bottom',
  textColor: '#123456',
  fontName: { language: 'latin', name: 'Bridge Native Font' },
};
const op = (format, props = properties, extra = {}) => ({
  kind: 'character-properties',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: format === 'hwp5' ? 1 : 2,
  startUnit: 0,
  endUnit: 3,
  expectedRangeText: 'SAM',
  properties: props,
  ...extra,
});
const apply = (format, operations, more = {}, deps) =>
  applyDocumentOperations(
    {
      bytes: inputs[format],
      wasm,
      expectedSha256: hash(inputs[format]),
      allowStaleLayout: true,
      operations,
      ...more,
    },
    deps,
  );
async function open(format, bytes = inputs[format], binary = wasm) {
  return openDocument({ bytes, wasm: binary });
}
async function exact(format, bytes) {
  const d = await open(format, bytes);
  try {
    const saved = d.save({ allowStaleLayout: true });
    assert.deepEqual(Buffer.from(format === 'hwp5' ? saved.bytes : saved), Buffer.from(bytes));
  } finally {
    d.close();
  }
}
async function oracle(name, format, before, after, props = properties) {
  const a = join(evidence, name + '-before.' + (format === 'hwp5' ? 'hwp' : 'hwpx')),
    b = join(evidence, name + '-after.' + (format === 'hwp5' ? 'hwp' : 'hwpx')),
    p = join(evidence, name + '-plan.json');
  await writeFile(a, before);
  await writeFile(b, after);
  const plan = {
    before: a,
    after: b,
    format,
    paragraph: format === 'hwp5' ? 1 : 1,
    startUnit: 0,
    endUnit: 3,
    properties: props,
  };
  await writeFile(p, JSON.stringify(plan));
  const bad = join(evidence, name + '-wrong.json');
  await writeFile(bad, JSON.stringify({ ...plan, properties: { ...props, textColor: '#654321' } }));
  const logs = [];
  for (const flags of [[], ['-O']]) {
    const script = join(source, 'packages/cli/e2e/helpers/character-extensions-oracle.py');
    const good = spawnSync('python3', ['-B', ...flags, script, p], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    const invalid = spawnSync('python3', ['-B', ...flags, script, bad], { encoding: 'utf8' });
    assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr);
    logs.push({ flags, good: JSON.parse(good.stdout), counterexampleRejected: true });
  }
  await writeFile(join(evidence, name + '-oracle.json'), JSON.stringify(logs, null, 2));
}
function cli(format, input, output, operations, engine = wasmPath) {
  return spawnSync(
    process.execPath,
    [
      join(source, 'packages/cli/src/bin.ts'),
      'apply',
      input,
      '--expect-sha256',
      hash(inputs[format]),
      '--operations',
      JSON.stringify(operations),
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
  const client = new Client({ name: 'character-extensions', version: '1.0.0' });
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
const rpc = async (client, format, output, operations) =>
  client.callTool({
    name: 'apply_document_changes',
    arguments: {
      inputPath: join(evidence, 'fixtures', format === 'hwp5' ? 'same.hwp' : 'same.hwpx'),
      expectedSha256: hash(inputs[format]),
      outputPath: output,
      allowStaleLayout: true,
      operations,
    },
  });
const missing = (path) => assert.rejects(access(path), { code: 'ENOENT' });
test('strict extended DTO preserves legacy nullable fields and rejects full batch before open', () => {
  for (const props of [
    { underline: 'bad' },
    { textColor: 'red' },
    { textColor: '#12345678' },
    { fontName: { language: 'latin', name: '' } },
    { fontName: { language: 'auto', name: 'X' } },
    { fontName: { language: 'latin', name: 'X', id: 0 } },
    { unknown: 1 },
  ])
    assert.throws(() => validateDocumentOperations([op('hwpx', properties), op('hwpx', props)]));
  assert.equal(
    validateDocumentOperations([
      op('hwp5', {
        size: null,
        bold: false,
        italic: null,
        underline: null,
        textColor: null,
        fontName: null,
      }),
    ]).length,
    1,
  );
});
for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' Native atomic combined properties preserve source, resources, other language fonts and sibling; oracle normal/-O',
    async () => {
      const result = await apply(format, [op(format)]);
      assert.equal(result.operationResults.length, 1);
      const row = result.operationResults[0];
      assert.equal(row.after.aggregate['character.textColor'].value, 0x123456);
      assert.equal(
        row.after.aggregate['character.fonts.latin.name'].value,
        properties.fontName.name,
      );
      await exact(format, result.bytes);
      await oracle('native-' + format, format, inputs[format], result.bytes);
      const noop = await apply(format, [op(format)], {
        bytes: result.bytes,
        expectedSha256: hash(result.bytes),
      });
      assert.equal(noop.operationResults[0].changed, false);
      assert.deepEqual(Buffer.from(noop.bytes), Buffer.from(result.bytes));
    },
  );
test('Native per-format underline enum and UTF16 scalar/owner/late error failures return no bytes', async () => {
  await assert.rejects(apply('hwp5', [op('hwp5', { underline: 'center' })]), /Underline/);
  const hx = await apply('hwpx', [op('hwpx', { underline: 'center' })]);
  await oracle('center-hwpx', 'hwpx', inputs.hwpx, hx.bytes, { underline: 'center' });
  for (const format of ['hwp5', 'hwpx']) {
    await assert.rejects(
      apply(format, [
        op(format),
        {
          kind: 'paragraph-alignment',
          coordinates: 'current-transaction',
          section: 0,
          paragraph: 0xffffffff,
          alignment: 'LEFT',
        },
      ]),
    );
    await assert.rejects(
      apply(format, [op(format, properties, { startUnit: 1, endUnit: 1, expectedRangeText: '' })]),
    );
  }
});
test('old Native refuses whole batch with zero history/setter/atomic writes and save calls', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const d = await open(format, inputs[format], oldWasm),
      calls = [];
    const sdk = { ...d.sdk };
    for (const name of ['enableHistoryV2', 'setCharacterProperties', 'applyFormattingPatch']) {
      const fn = sdk[name];
      sdk[name] = (...args) => {
        calls.push(name);
        return fn(...args);
      };
    }
    await assert.rejects(
      apply(
        format,
        [op(format, { bold: true }), op(format)],
        { wasm: oldWasm },
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
      /AbiUnavailable/,
    );
    assert.deepEqual(calls, []);
  }
});
test('prepared Native read lease rejects foreign document, undo ABA and identical-text paragraph alias after structural edits', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const d = await open(format),
      other = await open(format);
    try {
      const [operation] = validateDocumentOperations([op(format)]);
      prepareOperationSession(d, [operation]);
      const prepared = prepareCharacterExtensions(d, [operation]);
      assert.throws(() => prepared.apply(other, operation, 0), /Stale/);
      d.sdk.setParagraphAlignment({
        section: 0,
        paragraph: format === 'hwp5' ? 1 : 2,
        alignment: 'CENTER',
      });
      assert.equal(d.sdk.undo(), true);
      assert.throws(() => prepared.apply(d, operation, 0), /Stale/);
      assert.deepEqual(
        Buffer.from(format === 'hwp5' ? d.save({ allowStaleLayout: true }).bytes : d.save()),
        Buffer.from(inputs[format]),
      );
    } finally {
      d.close();
      other.close();
    }
    const split = {
      kind: 'split-paragraph',
      coordinates: 'current-transaction',
      section: 0,
      paragraph: format === 'hwp5' ? 1 : 2,
      atUnit: 0,
      expectedText: format === 'hwp5' ? 'SAME\r' : 'SAME',
    };
    await assert.rejects(apply(format, [split, op(format)]), /StaleCharacterExtensionTarget/);
  }
});
test('formatting-only predecessor and multiple extended writes retain lineage and Native current binding', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const result = await apply(format, [
      op(format, { bold: true }),
      op(format, { textColor: '#123456' }),
      op(format, { underline: 'top' }),
    ]);
    assert.equal(result.operationResults.length, 2);
    await exact(format, result.bytes);
    await oracle('multiple-' + format, format, inputs[format], result.bytes, {
      bold: true,
      textColor: '#123456',
      underline: 'top',
    });
  }
});
test('actual CLI both formats combined write and Native observations; old/late errors no output or stdout', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const input = join(evidence, 'fixtures', format === 'hwp5' ? 'same.hwp' : 'same.hwpx'),
      output = join(evidence, 'cli-' + format + (format === 'hwp5' ? '.hwp' : '.hwpx'));
    const result = cli(format, input, output, [op(format)]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /character.textColor/);
    const bytes = await readFile(output);
    await exact(format, bytes);
    await oracle('cli-' + format, format, inputs[format], bytes);
    for (const [name, ops, engine] of [
      ['old', [op(format)], oldPath],
      [
        'late',
        [
          op(format),
          {
            kind: 'paragraph-alignment',
            coordinates: 'current-transaction',
            section: 0,
            paragraph: 0xffffffff,
            alignment: 'LEFT',
          },
        ],
        wasmPath,
      ],
    ]) {
      const output = join(
        evidence,
        'cli-' + name + '-' + format + (format === 'hwp5' ? '.hwp' : '.hwpx'),
      );
      const r = cli(format, input, output, ops, engine);
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout, '');
      assert.doesNotMatch(r.stderr, /InvalidOutputExtension/);
      await missing(output);
    }
    assert.deepEqual(await readFile(input), Buffer.from(inputs[format]));
  }
});
test('actual MCP same writer both formats plus strict/old/late errors; finally closes stdio', async () => {
  await mcp(wasmPath, async (client) => {
    for (const format of ['hwp5', 'hwpx']) {
      const output = join(evidence, 'mcp-' + format + (format === 'hwp5' ? '.hwp' : '.hwpx')),
        r = await rpc(client, format, output, [op(format)]);
      assert.notEqual(r.isError, true, JSON.stringify(r));
      assert.match(JSON.stringify(r), /character.textColor/);
      await oracle('mcp-' + format, format, inputs[format], await readFile(output));
      await exact(format, await readFile(output));
      for (const [name, ops] of [
        ['strict', [op(format, { textColor: 'auto' })]],
        [
          'late',
          [
            op(format),
            {
              kind: 'paragraph-alignment',
              coordinates: 'current-transaction',
              section: 0,
              paragraph: 0xffffffff,
              alignment: 'LEFT',
            },
          ],
        ],
      ]) {
        const output = join(
            evidence,
            'mcp-' + name + '-' + format + (format === 'hwp5' ? '.hwp' : '.hwpx'),
          ),
          r = await rpc(client, format, output, ops);
        assert.equal(r.isError, true);
        assert.doesNotMatch(JSON.stringify(r), /InvalidOutputExtension/);
        await missing(output);
      }
    }
  });
  await mcp(oldPath, async (client) => {
    for (const format of ['hwp5', 'hwpx']) {
      const output = join(evidence, 'mcp-old-' + format + (format === 'hwp5' ? '.hwp' : '.hwpx')),
        r = await rpc(client, format, output, [op(format)]);
      assert.equal(r.isError, true);
      assert.match(JSON.stringify(r), /AbiUnavailable/);
      await missing(output);
    }
  });
});

test('actual Native unknown color/font states survive refusal; no default value or preceding mutation is applied', async () => {
  const bytes = inputs.unknownHwpx,
    d = await open('hwpx', bytes);
  let observed;
  try {
    d.sdk.enableHistoryV2();
    const c = d.sdk.atomicFormattingCapabilities();
    observed = d.sdk.queryFormatting({
      schemaVersion: 1,
      binding: c.binding,
      selectors: [
        {
          kind: 'original-paragraph',
          section: 0,
          paragraph: 2,
          ranges: [{ startUnit: 0, endUnit: 3 }],
        },
      ],
      fields: ['character.textColor', 'character.fonts.latin.name'],
    }).observations;
    assert.equal(observed.aggregate['character.textColor'].state, 'unknown');
    assert.equal(observed.aggregate['character.fonts.latin.name'].state, 'unavailable');
    assert(!Object.hasOwn(observed.aggregate['character.textColor'], 'value'));
    await writeFile(join(evidence, 'UNKNOWN-NATIVE.json'), JSON.stringify(observed, null, 2));
  } finally {
    d.close();
  }
  await assert.rejects(
    apply(
      'hwpx',
      [
        op('hwpx', { bold: true }),
        op('hwpx', { textColor: '#123456', fontName: { language: 'latin', name: 'Known Font' } }),
      ],
      { bytes, expectedSha256: hash(bytes) },
    ),
    (error) => {
      assert.equal(error.message, 'AutoColorIntentUnavailable');
      assert.deepEqual(error.observations, observed);
      return true;
    },
  );
});
