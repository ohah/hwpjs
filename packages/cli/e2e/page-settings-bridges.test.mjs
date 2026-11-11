import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, isAbsolute } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createNewDocumentBytes } from '../../../js/new-document.mjs';
import { createHwpxEditor } from '../../../js/hwpx-editor.mjs';
import { applyDocumentOperations } from '../src/document-operations.ts';
import { openDocument } from '../src/engine.ts';
const source = fileURLToPath(new URL('../../../', import.meta.url));
const {
  HWPJS_TEST_WASM: wasm,
  HWPJS_TEST_WASM_SHA256: pin,
  HWPJS_PAGE_TEST_OLD_WASM: old,
  HWPJS_PAGE_TEST_OLD_WASM_SHA256: oldPin,
  HWPJS_PAGE_TEST_EVIDENCE: evidence,
} = process.env;
for (const p of [wasm, old, evidence]) assert(p && isAbsolute(p), 'ExplicitAbsolutePathsRequired');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const binary = readFileSync(wasm),
  oldBinary = readFileSync(old);
assert.match(pin, /^[a-f0-9]{64}$/);
assert.match(oldPin, /^[a-f0-9]{64}$/);
assert.equal(hash(binary), pin);
assert.equal(hash(oldBinary), oldPin);
mkdirSync(evidence);
const module = await WebAssembly.compile(binary);
const blank = await createNewDocumentBytes(module, 'hwpx');
writeFileSync(join(evidence, 'blank.hwpx'), blank);
const run = (command, args) => {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
run('python3', [
  '-B',
  join(source, 'tests/helpers/page-settings-edit-fixture.py'),
  '--input',
  join(evidence, 'blank.hwpx'),
  '--output',
  join(evidence, 'fixtures'),
]);
const seed = (name) => readFileSync(join(evidence, 'fixtures', name + '.hwpx'));
const values = {
  orientation: 'narrowly',
  width: 64800,
  height: 86400,
  gutter_type: 'top_bottom',
  margin: {
    header: 1800,
    footer: 1800,
    gutter: 720,
    left: 7200,
    right: 3600,
    top: 3600,
    bottom: 5400,
  },
};
const op = (extra = {}) => ({
  kind: 'page-settings',
  coordinates: 'current-transaction',
  scope: 'section',
  section: 0,
  values,
  ...extra,
});
const all = () => ({
  kind: 'page-settings',
  coordinates: 'current-transaction',
  scope: 'document',
  values,
});
const late = {
  kind: 'paragraph-alignment',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0xffffffff,
  alignment: 'LEFT',
};
const apply = (bytes, operations, extra = {}, deps) =>
  applyDocumentOperations(
    {
      bytes,
      wasm: binary,
      expectedSha256: hash(bytes),
      allowStaleLayout: true,
      operations,
      ...extra,
    },
    deps,
  );
async function reopen(bytes, expected = values, sections = [0]) {
  const sdk = await createHwpxEditor(module);
  try {
    sdk.open(bytes);
    for (const section of sections) {
      const observed = sdk.pageSettings().find((x) => x.section_ordinal === section);
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(observed[key], value);
    }
    assert.deepEqual(Buffer.from(sdk.save()), Buffer.from(bytes));
  } finally {
    sdk.close();
  }
}
function oracle(name, before, after, parts) {
  const b = join(evidence, name + '-before.hwpx'),
    a = join(evidence, name + '-after.hwpx'),
    p = join(evidence, name + '-plan.json');
  writeFileSync(b, before);
  writeFileSync(a, after);
  const plan = { before: b, after: a, parts, values };
  writeFileSync(p, JSON.stringify(plan));
  const bad = join(evidence, name + '-wrong.json');
  writeFileSync(bad, JSON.stringify({ ...plan, values: { ...values, width: values.width + 1 } }));
  for (const flags of [[], ['-O']]) {
    const script = join(source, 'tools/hwpx-page-settings-edit-oracle.py');
    const r = JSON.parse(run('python3', ['-B', ...flags, script, p]));
    assert(r.verified);
    const negative = spawnSync('python3', ['-B', ...flags, script, bad], { encoding: 'utf8' });
    assert.equal(negative.status, 1);
  }
}
function cli(input, bytes, output, operations, engine = wasm) {
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
      engine,
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
}
async function mcp(engine, callback) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(source, 'packages/cli/src/mcp-bin.ts'), '--wasm', engine],
    stderr: 'pipe',
  });
  transport.stderr.on('data', () => {});
  const client = new Client({ name: 'page-settings-bridges', version: '1.0.0' });
  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    await client.close();
    await transport.close();
  }
}
const rpc = (client, input, output, operations) =>
  client.callTool({
    name: 'apply_document_changes',
    arguments: {
      inputPath: input,
      outputPath: output,
      expectedSha256: hash(readFileSync(input)),
      allowStaleLayout: true,
      operations,
    },
  });
test('Native service section/document scope, raw source axes, absent attributes, exact save/reopen, independent XML normal/-O', async () => {
  for (const [name, operation, parts] of [
    ['plain', op(), ['Contents/section0.xml']],
    ['two-sections', op({ section: 1 }), ['Contents/section1.xml']],
    ['two-sections', all(), ['Contents/section0.xml', 'Contents/section1.xml']],
    ['missing-attributes', op(), ['Contents/section0.xml']],
  ]) {
    const before = seed(name),
      r = await apply(before, [operation]);
    await reopen(r.bytes, values, operation.scope === 'document' ? [0, 1] : [operation.section]);
    const noop = await apply(r.bytes, [operation]);
    assert.equal(noop.changed, false);
    assert.deepEqual(Buffer.from(noop.bytes), Buffer.from(r.bytes));
    oracle(name + '-' + parts.length + '-' + (operation.section ?? 'all'), before, r.bytes, parts);
  }
});
test('old Native full-batch rejection has zero mutation/history/save calls; input remains exact', async () => {
  const bytes = seed('plain'),
    document = await openDocument({ bytes, wasm: oldBinary });
  const calls = [];
  const sdk = { ...document.sdk };
  for (const method of ['enableHistoryV2', 'setParagraphAlignment', 'writePageSettings']) {
    if (typeof sdk[method] === 'function') {
      const fn = sdk[method];
      sdk[method] = (...args) => {
        calls.push(method);
        return fn(...args);
      };
    }
  }
  await assert.rejects(
    apply(
      bytes,
      [{ ...late, paragraph: 2 }, op()],
      { wasm: oldBinary },
      {
        openDocument: async () => ({
          ...document,
          sdk,
          save() {
            calls.push('save');
            return document.save();
          },
          close: document.close,
        }),
      },
    ),
    /PageSettingsWriteUnavailable/,
  );
  assert.deepEqual(calls, []);
});
test('old HWP5 page ABI preserves CFB bytes normal/-O; later owner, target and geometry errors yield no result', async () => {
  const h5 = await createNewDocumentBytes(module, 'hwp5');
  writeFileSync(join(evidence, 'unsupported-before.hwp'), h5);
  await assert.rejects(apply(h5, [op()], { wasm: oldBinary }), /PageSettingsWriteUnavailable/);
  writeFileSync(join(evidence, 'unsupported-after.hwp'), h5);
  for (const flags of [[], ['-O']])
    run('python3', [
      '-B',
      ...flags,
      '-c',
      "import pathlib,sys; a=pathlib.Path(sys.argv[1]).read_bytes(); b=pathlib.Path(sys.argv[2]).read_bytes();\nif a[:8]!=bytes.fromhex('d0cf11e0a1b11ae1') or a!=b: raise ValueError('CFB changed')",
      join(evidence, 'unsupported-before.hwp'),
      join(evidence, 'unsupported-after.hwp'),
    ]);
  for (const name of ['duplicate', 'conditional', 'missing-page', 'opaque-cache'])
    await assert.rejects(apply(seed(name), [op()]));
  await assert.rejects(apply(seed('plain'), [op(), late]));
  await assert.rejects(apply(seed('plain'), [op({ values: { ...values, width: 1 } })]));
});
test('actual CLI writes exact XML, reopens and refuses late/old errors without output', async () => {
  const bytes = seed('plain'),
    input = join(evidence, 'cli-input.hwpx'),
    output = join(evidence, 'cli-out.hwpx');
  writeFileSync(input, bytes);
  const r = cli(input, bytes, output, [op()]);
  assert.equal(r.status, 0, r.stderr);
  const after = readFileSync(output);
  await reopen(after);
  oracle('cli', bytes, after, ['Contents/section0.xml']);
  for (const [name, engine, ops] of [
    ['old', old, [op()]],
    ['late', wasm, [op(), late]],
    ['strict', wasm, [op({ extra: true })]],
  ]) {
    const target = join(evidence, 'cli-' + name + '-forbidden.hwpx'),
      failed = cli(input, bytes, target, ops, engine);
    assert.notEqual(failed.status, 0);
    assert(!existsSync(target));
    assert.deepEqual(readFileSync(input), bytes);
  }
});
test('actual MCP strict schema/common service and document scope XML; late/old errors no output, children finally closed', async () => {
  const bytes = seed('two-sections'),
    input = join(evidence, 'mcp-input.hwpx');
  writeFileSync(input, bytes);
  await mcp(wasm, async (client) => {
    const output = join(evidence, 'mcp-out.hwpx'),
      r = await rpc(client, input, output, [all()]);
    assert.notEqual(r.isError, true, JSON.stringify(r));
    const after = readFileSync(output);
    await reopen(after, values, [0, 1]);
    oracle('mcp', bytes, after, ['Contents/section0.xml', 'Contents/section1.xml']);
    for (const [name, ops] of [
      ['late', [op(), late]],
      ['strict', [op({ binding: {} })]],
      ['missing-section', [op({ section: undefined })]],
    ]) {
      const target = join(evidence, 'mcp-' + name + '-forbidden.hwpx'),
        failed = await rpc(client, input, target, ops);
      assert.equal(failed.isError, true);
      assert(!existsSync(target));
    }
  });
  await mcp(old, async (client) => {
    const output = join(evidence, 'mcp-old-forbidden.hwpx'),
      r = await rpc(client, input, output, [op()]);
    assert.equal(r.isError, true);
    assert.match(JSON.stringify(r), /PageSettingsWriteUnavailable/);
    assert(!existsSync(output));
  });
  assert.deepEqual(readFileSync(input), bytes);
});

test('SDK instance, document lifetime, serial/undo ABA reject old authority for two identical section layouts', async () => {
  const bytes = seed('two-sections'),
    a = await createHwpxEditor(module),
    b = await createHwpxEditor(module);
  try {
    a.open(bytes);
    b.open(bytes);
    a.enableHistoryV2();
    b.enableHistoryV2();
    const cap = a.pageSettingsCapabilities(),
      request = {
        binding: cap.binding,
        scope: 'document',
        targets: cap.sections.map((x) => x.target),
        values,
      };
    assert.equal(b.writePageSettings(request).error, 'StalePageSettingsBinding');
    assert.deepEqual(Buffer.from(b.save()), Buffer.from(bytes));
    assert.equal(a.writePageSettings(request).nativeCode, 1);
    assert.equal(a.undo(), true);
    assert.equal(a.writePageSettings(request).error, 'StalePageSettingsBinding');
    assert.deepEqual(Buffer.from(a.save()), Buffer.from(bytes));
    a.open(bytes);
    a.enableHistoryV2();
    assert.equal(a.writePageSettings(request).error, 'StalePageSettingsBinding');
    assert.deepEqual(Buffer.from(a.save()), Buffer.from(bytes));
  } finally {
    a.close();
    b.close();
  }
});
test('actual old HWP5 page ABI CLI/MCP refusal publishes no CFB output and preserves complete original bytes', async () => {
  const bytes = await createNewDocumentBytes(module, 'hwp5'),
    input = join(evidence, 'cli-h5-input.hwp');
  writeFileSync(input, bytes);
  const output = join(evidence, 'cli-h5-forbidden.hwp'),
    r = cli(input, bytes, output, [op()], old);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PageSettingsWriteUnavailable/);
  assert(!existsSync(output));
  await mcp(old, async (client) => {
    const output = join(evidence, 'mcp-h5-forbidden.hwp'),
      r = await rpc(client, input, output, [op()]);
    assert.equal(r.isError, true);
    assert.match(JSON.stringify(r), /PageSettingsWriteUnavailable/);
    assert(!existsSync(output));
  });
  assert.deepEqual(readFileSync(input), Buffer.from(bytes));
});

test('actual preceding source split changes Native binding; page operation re-queries current session and preserves split text', async () => {
  const before = seed('plain');
  const sdk = await createHwpxEditor(module);
  let text;
  try {
    sdk.open(before);
    text = sdk.anchorText(0, 2);
  } finally {
    sdk.close();
  }
  const split = {
    kind: 'split-paragraph',
    coordinates: 'current-transaction',
    section: 0,
    paragraph: 2,
    atUnit: 3,
    expectedText: text,
  };
  const prior = await apply(before, [split]);
  const result = await apply(before, [split, op()]);
  await reopen(result.bytes);
  oracle('after-source-split', prior.bytes, result.bytes, ['Contents/section0.xml']);
});
