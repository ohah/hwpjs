import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, isAbsolute } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createExperimentalHwp5Editor } from '../../../js/hwp5-editor.mjs';
import { createNewDocumentBytes } from '../../../js/new-document.mjs';
import { openDocument } from '../src/engine.ts';
import { applyDocumentOperations } from '../src/document-operations.ts';
const source = fileURLToPath(new URL('../../../', import.meta.url));
const env = process.env,
  wasm = env.HWPJS_TEST_WASM,
  old = env.HWPJS_PAGE_TEST_OLD_WASM,
  evidence = env.HWPJS_PAGE_H5_EVIDENCE,
  inputs = env.HWPJS_PAGE_H5_INPUTS,
  archive = env.HWPJS_PAGE_ARCHIVE_ROOT;
const safe = (p) => {
  assert(
    typeof p === 'string' &&
      isAbsolute(p) &&
      !p.split('/').includes('..') &&
      !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/i.test(p),
    'SafeAbsoluteInputRequired',
  );
  return p;
};
for (const p of [wasm, old, evidence, inputs]) safe(p);
if (archive) safe(archive);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const binary = readFileSync(wasm),
  oldBinary = readFileSync(old);
assert.equal(hash(binary), env.HWPJS_TEST_WASM_SHA256);
assert.equal(hash(oldBinary), env.HWPJS_PAGE_TEST_OLD_WASM_SHA256);
const fixtureManifest = JSON.parse(readFileSync(inputs));
const fixtures = {};
for (const [path, pin] of Object.entries(fixtureManifest)) {
  safe(path);
  const b = readFileSync(path);
  assert.equal(hash(b), pin);
  fixtures[path.split('/').at(-1)] = b;
}
for (const name of ['page.hwp', 'two-sections.hwp', 'two-reserved.hwp']) assert(fixtures[name]);
mkdirSync(evidence);
const module = await WebAssembly.compile(binary);
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
const op = (section = 0) => ({
  kind: 'page-settings',
  coordinates: 'current-transaction',
  scope: 'section',
  section,
  values,
});
const all = () => ({
  kind: 'page-settings',
  coordinates: 'current-transaction',
  scope: 'document',
  values,
});
const alignment = {
  kind: 'paragraph-alignment',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0,
  alignment: 'CENTER',
};
const late = { ...alignment, paragraph: 0xffffffff };
const apply = (bytes, operations, extra = {}, dependencies) =>
  applyDocumentOperations(
    {
      bytes,
      wasm: binary,
      expectedSha256: hash(bytes),
      allowStaleLayout: true,
      operations,
      ...extra,
    },
    dependencies,
  );
function oracle(name, before, after, sections, format = 'hwp5') {
  const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
    b = join(evidence, name + '-before.' + ext),
    a = join(evidence, name + '-after.' + ext),
    p = join(evidence, name + '-plan.json');
  writeFileSync(b, before);
  writeFileSync(a, after);
  const plan = {
    before: b,
    after: a,
    values,
    ...(format === 'hwp5'
      ? { sections }
      : { parts: sections.map((i) => 'Contents/section' + i + '.xml') }),
  };
  writeFileSync(p, JSON.stringify(plan));
  const bad = join(evidence, name + '-wrong.json');
  writeFileSync(bad, JSON.stringify({ ...plan, values: { ...values, width: values.width + 1 } }));
  const script = join(
    source,
    'tools/' + (format === 'hwp5' ? 'hwp5' : 'hwpx') + '-page-settings-edit-oracle.py',
  );
  const negatives = [bad];
  if (format === 'hwp5') {
    const bytes = Buffer.from(after);
    const ss = 1 << bytes.readUInt16LE(30),
      dir = bytes.readUInt32LE(48);
    bytes[(dir + 1) * ss + 80] ^= 1;
    const forged = join(evidence, name + '-root.hwp'),
      rootPlan = join(evidence, name + '-root.json');
    writeFileSync(forged, bytes);
    writeFileSync(rootPlan, JSON.stringify({ ...plan, after: forged }));
    negatives.push(rootPlan);
  }
  for (const flags of [[], ['-O']]) {
    const run = (plan) =>
      spawnSync('python3', ['-B', ...flags, script, plan], { encoding: 'utf8', timeout: 30000 });
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).verified, true);
    for (const negative of negatives) {
      const rejected = run(negative);
      assert.equal(rejected.status, 1, 'Wrong CFB/XML expectation accepted');
    }
  }
}
async function reopen(bytes, sections) {
  const e = await createExperimentalHwp5Editor(module, bytes);
  try {
    for (const section of sections) {
      const p = e.pageSettings(section);
      assert.equal(p.width, values.width);
      assert.equal(p.height, values.height);
      assert.equal(p.flags & 7, 5);
      assert.equal(p.orientation, 'widely');
      assert.equal(p.binding, 'top');
    }
    assert.deepEqual(Buffer.from(e.save({ allowStaleLayout: true }).bytes), Buffer.from(bytes));
  } finally {
    e.close();
  }
}
const entry = archive ? join(archive, 'dist/hwpjs.mjs') : join(source, 'packages/cli/src/bin.ts');
if (archive) assert.equal(hash(readFileSync(join(archive, 'dist/hwpjs.wasm'))), hash(binary));
function cli(input, bytes, output, operations, engine = archive ? null : wasm) {
  return spawnSync(
    process.execPath,
    [
      entry,
      'apply',
      input,
      '--expect-sha256',
      hash(bytes),
      '--operations',
      JSON.stringify(operations),
      '--output',
      output,
      '--allow-stale-layout',
      ...(engine ? ['--wasm', engine] : []),
    ],
    { cwd: archive ?? source, encoding: 'utf8', timeout: 30000 },
  );
}
const childReceipts = [];
async function mcp(engine, callback) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      archive ? join(archive, 'dist/mcp.mjs') : join(source, 'packages/cli/src/mcp-bin.ts'),
      ...(engine ? ['--wasm', engine] : []),
    ],
    stderr: 'pipe',
    cwd: archive ?? source,
  });
  transport.stderr.on('data', () => {});
  const client = new Client({ name: 'hwp5-page-settings-bridges', version: '1.0.0' });
  let pid;
  try {
    await client.connect(transport);
    pid = transport.pid;
    assert(Number.isInteger(pid));
    await callback(client);
  } finally {
    await client.close();
    await transport.close();
    if (pid) {
      assert.equal(transport.pid, null);
      assert.throws(
        () => process.kill(pid, 0),
        (e) => e.code === 'ESRCH',
      );
      childReceipts.push({ pid, closed: true });
      writeFileSync(
        join(evidence, 'MCP-CLEANUP.json'),
        JSON.stringify(childReceipts, null, 2) + '\n',
      );
    }
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
test('HWP5 Native service section/document scope, no-op, exact reopen and independent CFB normal/-O', async () => {
  for (const [name, bytes, operation, sections] of [
    ['section', fixtures['page.hwp'], op(), [0]],
    ['selected', fixtures['two-sections.hwp'], op(1), [1]],
    ['document', fixtures['two-sections.hwp'], all(), [0, 1]],
  ]) {
    const result = await apply(bytes, [operation]);
    assert.equal(result.format, 'hwp5');
    assert(result.changed);
    assert.equal(typeof result.layoutRequiresReflow, 'boolean');
    oracle('service-' + name, bytes, result.bytes, sections);
    await reopen(result.bytes, sections);
    const noop = await apply(result.bytes, [operation]);
    assert.equal(noop.changed, false);
    assert.deepEqual(Buffer.from(noop.bytes), Buffer.from(result.bytes));
  }
});
test('HWP5 all-section admission rejects unsupported owner before preceding writes but selected valid section stays admitted', async () => {
  const bytes = fixtures['two-reserved.hwp'],
    doc = await openDocument({ bytes, wasm: binary });
  const calls = [];
  const sdk = { ...doc.sdk };
  for (const name of ['enableHistoryV2', 'setParagraphAlignment', 'writePageSettings']) {
    const fn = sdk[name];
    sdk[name] = (...args) => {
      calls.push(name);
      return fn(...args);
    };
  }
  await assert.rejects(
    apply(
      bytes,
      [alignment, all()],
      {},
      {
        openDocument: async () => ({
          ...doc,
          sdk,
          save() {
            calls.push('save');
            return doc.save({ allowStaleLayout: true });
          },
          close: doc.close,
        }),
      },
    ),
    /UnsupportedPageBinding/,
  );
  assert.deepEqual(calls, ['enableHistoryV2']);
  const result = await apply(bytes, [op(0)]);
  oracle('supported-only', bytes, result.bytes, [0]);
});
test('HWP5 exact capability and current binding are re-queried after preceding Native change; old ABI has zero history/write/save', async () => {
  const bytes = fixtures['page.hwp'];
  for (const engine of [binary, oldBinary]) {
    const doc = await openDocument({ bytes, wasm: engine });
    const calls = [],
      caps = [];
    const sdk = { ...doc.sdk };
    for (const name of [
      'enableHistoryV2',
      'setParagraphAlignment',
      'writePageSettings',
      'pageSettingsCapabilities',
    ]) {
      const fn = sdk[name];
      sdk[name] = (...args) => {
        calls.push(name);
        if (name === 'writePageSettings') assert.deepEqual(args[0].binding, caps.at(-1).binding);
        const value = fn(...args);
        if (name === 'pageSettingsCapabilities') {
          assert.equal(value.format, 'hwp5');
          assert.equal(value.sections[0].reason, null);
          assert.deepEqual(Object.keys(value.sections[0].target.expected).sort(), [
            'binding',
            'bottom',
            'extra_bytes',
            'flags',
            'footer',
            'gutter',
            'header',
            'height',
            'left',
            'orientation',
            'right',
            'source_node',
            'top',
            'width',
          ]);
          caps.push(value);
        }
        return value;
      };
    }
    const deps = {
      openDocument: async () => ({
        ...doc,
        sdk,
        save() {
          calls.push('save');
          return doc.save({ allowStaleLayout: true });
        },
        close: doc.close,
      }),
    };
    if (engine === oldBinary) {
      await assert.rejects(
        apply(bytes, [alignment, op()], { wasm: oldBinary }, deps),
        /PageSettingsWriteUnavailable/,
      );
      assert.deepEqual(calls, []);
    } else {
      const result = await apply(bytes, [alignment, op()], {}, deps);
      assert(result.changed);
      assert.notEqual(caps[0].binding.serial, caps.at(-1).binding.serial);
      await reopen(result.bytes, [0]);
    }
  }
});
test('actual CLI source/archive HWP5 and HWPX use the same page-settings schema and integer axes', async () => {
  const hx = await createNewDocumentBytes(module, 'hwpx');
  for (const [name, bytes, operation, sections, format] of [
    ['h5-single', fixtures['page.hwp'], op(), [0], 'hwp5'],
    ['h5-all', fixtures['two-sections.hwp'], all(), [0, 1], 'hwp5'],
    ['hx', hx, op(), [0], 'hwpx'],
  ]) {
    const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
      input = join(evidence, 'cli-' + name + '-in.' + ext),
      output = join(evidence, 'cli-' + name + '-out.' + ext);
    writeFileSync(input, bytes);
    const r = cli(input, bytes, output, [operation]);
    assert.equal(r.status, 0, r.stderr);
    const after = readFileSync(output);
    oracle('cli-' + name, bytes, after, sections, format);
    assert.deepEqual(readFileSync(input), Buffer.from(bytes));
    if (format === 'hwp5') await reopen(after, sections);
  }
});
test('actual MCP source/archive HWP5/HWPX schemas and document write; strict malformed authority never publishes', async () => {
  const engine = archive ? null : wasm;
  const hx = await createNewDocumentBytes(module, 'hwpx');
  await mcp(engine, async (client) => {
    const tools = await client.listTools();
    const apply = tools.tools.find((t) => t.name === 'apply_document_changes');
    assert(apply);
    assert(JSON.stringify(apply.inputSchema).includes('page-settings'));
    for (const [name, bytes, operation, sections, format] of [
      ['h5', fixtures['two-sections.hwp'], all(), [0, 1], 'hwp5'],
      ['hx', hx, op(), [0], 'hwpx'],
    ]) {
      const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
        input = join(evidence, 'mcp-' + name + '-in.' + ext),
        output = join(evidence, 'mcp-' + name + '-out.' + ext);
      writeFileSync(input, bytes);
      const result = await rpc(client, input, output, [operation]);
      assert.notEqual(result.isError, true, JSON.stringify(result));
      oracle('mcp-' + name, bytes, readFileSync(output), sections, format);
      const bad = join(evidence, 'mcp-' + name + '-authority-forbidden.' + ext);
      const refused = await rpc(client, input, bad, [
        { ...operation, binding: { session: 'forged' } },
      ]);
      assert.equal(refused.isError, true);
      assert(!existsSync(bad));
      assert.deepEqual(readFileSync(input), Buffer.from(bytes));
    }
  });
});
test('actual CLI/MCP late failure, old ABI, unsupported all-section and existing output never publish partial CFB', async () => {
  const bytes = fixtures['page.hwp'],
    input = join(evidence, 'failure-input.hwp');
  writeFileSync(input, bytes);
  const reserved = join(evidence, 'failure-reserved.hwp');
  writeFileSync(reserved, fixtures['two-reserved.hwp']);
  const cases = [
    ['late', input, bytes, [op(), late], archive ? null : wasm],
    ['old', input, bytes, [alignment, op()], old],
    ['all', reserved, fixtures['two-reserved.hwp'], [alignment, all()], archive ? null : wasm],
  ];
  for (const [name, path, data, operations, engine] of cases) {
    const output = join(evidence, 'cli-' + name + '-forbidden.hwp');
    const r = cli(path, data, output, operations, engine);
    assert.notEqual(r.status, 0);
    assert(!existsSync(output));
    assert.deepEqual(readFileSync(path), Buffer.from(data));
  }
  const existing = join(evidence, 'already-exists.hwp');
  writeFileSync(existing, 'sentinel');
  assert.notEqual(cli(input, bytes, existing, [op()]).status, 0);
  assert.equal(readFileSync(existing, 'utf8'), 'sentinel');
  for (const engine of [archive ? null : wasm, old])
    await mcp(engine, async (client) => {
      for (const [name, path, data, operations] of cases) {
        if (engine === old && name !== 'old') continue;
        if (engine !== old && name === 'old') continue;
        const output = join(evidence, 'mcp-' + name + '-forbidden.hwp');
        const r = await rpc(client, path, output, operations);
        assert.equal(r.isError, true);
        assert(!existsSync(output));
        assert.deepEqual(readFileSync(path), Buffer.from(data));
      }
    });
});
