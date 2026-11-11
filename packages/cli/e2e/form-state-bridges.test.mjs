import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, isAbsolute } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { generateFormStateFixtures } from './helpers/form-state-fixtures.mjs';
import { withoutFormWriterExports } from './helpers/form-old-abi.mjs';
import { openDocument } from '../src/engine.ts';
import { readFormInventory } from '../src/document-forms.ts';
import { applyDocumentOperations } from '../src/document-operations.ts';
import { prepareOperationSession } from '../src/mutations/dispatch.ts';
import { prepareFormOperations } from '../src/mutations/form-state.ts';
import { inspectDocumentObject } from '../src/document-objects.ts';
const {
  HWPJS_TEST_WASM: wasmPath,
  HWPJS_TEST_WASM_SHA256: pin,
  HWPJS_FORM_EVIDENCE: out,
} = process.env;
for (const v of [wasmPath, out]) assert(v && isAbsolute(v), 'ExplicitAbsoluteInputsRequired');
assert.match(pin, /^[a-f0-9]{64}$/);
const wasm = await readFile(wasmPath),
  hash = (b) => createHash('sha256').update(b).digest('hex');
assert.equal(hash(wasm), pin);
await mkdir(out);
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url)),
  cliEntry = process.env.HWPJS_FORM_CLI_ENTRY ?? join(sourceRoot, 'packages/cli/src/bin.ts'),
  mcpEntry = process.env.HWPJS_FORM_MCP_ENTRY ?? join(sourceRoot, 'packages/cli/src/mcp-bin.ts');
const module = await WebAssembly.compile(wasm),
  inputs = await generateFormStateFixtures({
    wasmModule: module,
    directory: join(out, 'fixtures'),
  }),
  old = withoutFormWriterExports(wasm),
  oldPath = join(out, 'old-form-writer-abi.wasm');
await writeFile(oldPath, old);
await writeFile(
  join(out, 'OLD-ABI.json'),
  JSON.stringify({ inputSha256: pin, derivedSha256: hash(old), testOnlyExportMask: true }),
);
const inventories = {},
  events = [],
  oracles = [],
  sessions = [];
for (const format of ['hwp5', 'hwpx']) {
  const d = await openDocument({ bytes: inputs[format], wasm });
  try {
    inventories[format] = readFormInventory(d);
  } finally {
    d.close();
  }
}
const ops = (format) => {
  const f = inventories[format].forms,
    b = { coordinates: 'current-transaction' };
  return [
    {
      ...b,
      kind: 'form-checkbox-state',
      reference: f[0].reference,
      expectedState: 'UNCHECKED',
      state: 'CHECKED',
    },
    {
      ...b,
      kind: 'form-checkbox-state',
      reference: f[1].reference,
      expectedState: 'UNCHECKED',
      state: 'INDETERMINATE',
    },
    {
      ...b,
      kind: 'form-radio-select',
      reference: f[3].reference,
      expectedState: 'UNCHECKED',
      expectedGroupName: 'Group A',
    },
    {
      ...b,
      kind: 'form-text',
      reference: f[4].reference,
      expectedText: 'old',
      text: 'new😀',
    },
    {
      ...b,
      kind: 'form-text',
      reference: f[5].reference,
      expectedText: 'combo',
      text: 'combo new',
    },
  ];
};
const gaps = () => [];
const late = {
  kind: 'paragraph-alignment',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 0xffffffff,
  alignment: 'LEFT',
};
const apply = (format, operations, extra = {}, deps = {}) =>
  applyDocumentOperations(
    {
      bytes: inputs[format],
      wasm,
      expectedSha256: hash(inputs[format]),
      operations,
      allowStaleLayout: true,
      ...extra,
    },
    deps,
  );
async function missing(p) {
  await assert.rejects(access(p), (e) => e.code === 'ENOENT');
}
async function exact(format, bytes) {
  const d = await openDocument({ bytes, wasm });
  try {
    const saved = await d.save({ allowStaleLayout: true });
    assert.deepEqual(Buffer.from(format === 'hwp5' ? saved.bytes : saved), Buffer.from(bytes));
    const i = readFormInventory(d);
    assert.equal(i.forms[0].current.state.value, 'CHECKED');
    assert.equal(i.forms[1].current.state.value, 'INDETERMINATE');
    {
      assert.equal(i.forms[2].current.state.value, 'UNCHECKED');
      assert.equal(i.forms[3].current.state.value, 'CHECKED');
      assert.equal(i.forms[4].current.text.value, 'new😀');
      assert.equal(i.forms[5].current.text.value, 'combo new');
    }
  } finally {
    d.close();
  }
}
async function oracle(format, name, after) {
  const input = join(out, 'fixtures', 'forms.' + (format === 'hwp5' ? 'hwp' : 'hwpx')),
    plan = {
      format,
      before: input,
      after,
      states: {
        F0: 'CHECKED',
        F1: 'INDETERMINATE',
        F2: 'UNCHECKED',
        F3: 'CHECKED',
      },
      texts: { F4: 'new😀', F5: 'combo new' },
    };
  const path = join(out, name + '-oracle-plan.json'),
    bad = join(out, name + '-oracle-wrong.json');
  await writeFile(path, JSON.stringify(plan));
  await writeFile(bad, JSON.stringify({ ...plan, states: { ...plan.states, F0: 'UNCHECKED' } }));
  for (const flags of [[], ['-O']]) {
    const script = fileURLToPath(new URL('./helpers/form-state-oracle.py', import.meta.url)),
      good = spawnSync('python3', ['-B', ...flags, script, path], { encoding: 'utf8' }),
      wrong = spawnSync('python3', ['-B', ...flags, script, bad], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.equal(wrong.status, 1, wrong.stdout + wrong.stderr);
    oracles.push({ name, flags, result: JSON.parse(good.stdout), wrongValueRejected: true });
  }
}
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} shared service state writers and exact Native save/reopen + independent oracle`, async () => {
    const before = hash(inputs[format]),
      r = await apply(format, ops(format));
    assert.equal(r.operationResults.length, ops(format).length);
    assert(r.operationResults.every((x) => x.changed));
    assert.equal(r.operationResults[2].affected.length, 2);
    const p = join(out, `service-${format}.` + (format === 'hwp5' ? 'hwp' : 'hwpx'));
    await writeFile(p, r.bytes);
    await exact(format, r.bytes);
    await oracle(format, `service-${format}`, p);
    assert.equal(hash(inputs[format]), before);
  });
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} late Native error returns no bytes, save0 and finally close1`, async () => {
    const d = await openDocument({ bytes: inputs[format], wasm }),
      c = { saves: 0, closes: 0, writes: 0 };
    const sdk = new Proxy(d.sdk, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (typeof v !== 'function') return v;
        return (...args) => {
          if (['setCheckBoxState', 'selectRadioButton', 'setFormText'].includes(k)) c.writes++;
          return Reflect.apply(v, t, args);
        };
      },
    });
    await assert.rejects(
      apply(
        format,
        [...ops(format), late],
        {},
        {
          openDocument: async () => ({
            ...d,
            sdk,
            save(...a) {
              c.saves++;
              return d.save(...a);
            },
            close() {
              c.closes++;
              d.close();
            },
          }),
        },
      ),
    );
    assert.equal(c.saves, 0);
    assert.equal(c.closes, 1);
    assert.equal(c.writes, ops(format).length);
    events.push({ kind: 'late', format, ...c });
  });
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} old optional writer ABI rejects whole batch with history/setter/write/save0`, async () => {
    const d = await openDocument({ bytes: inputs[format], wasm: old }),
      calls = [];
    const sdk = new Proxy(d.sdk, {
      get(t, k) {
        const v = Reflect.get(t, k);
        if (typeof v !== 'function') return v;
        return (...args) => {
          if (
            [
              'enableHistoryV2',
              'setCheckBoxState',
              'selectRadioButton',
              'setFormText',
              'setParagraphAlignment',
            ].includes(k)
          )
            calls.push(k);
          return Reflect.apply(v, t, args);
        };
      },
    });
    let closed = 0;
    await assert.rejects(
      apply(
        format,
        [{ ...late, paragraph: format === 'hwp5' ? 0 : 1 }, ops(format)[0]],
        { wasm: old },
        {
          openDocument: async () => ({
            ...d,
            sdk,
            save() {
              calls.push('save');
              return d.save({ allowStaleLayout: true });
            },
            close() {
              closed++;
              d.close();
            },
          }),
        },
      ),
      /FormWriterAbiUnavailable/,
    );
    assert.deepEqual(calls, []);
    assert.equal(closed, 1);
    events.push({ kind: 'old', format, calls, closed });
  });
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} issued plan rejects foreign doc, undo ABA, identical sibling provenance and source fingerprint`, async () => {
    for (const fault of ['foreign', 'aba', 'fingerprint', 'sibling', 'ref']) {
      const a = await openDocument({ bytes: inputs[format], wasm }),
        b = await openDocument({ bytes: inputs[format], wasm });
      try {
        const operations = ops(format).slice(0, 1);
        prepareOperationSession(a, operations);
        const plan = prepareFormOperations(a, operations);
        if (fault === 'foreign') assert.throws(() => plan.apply(b, operations[0], 0), /Foreign/);
        if (fault === 'aba') {
          a.sdk.setCheckBoxState(0, inventories[format].forms[0].source.node, 'CHECKED');
          a.sdk.undo();
          assert.throws(() => plan.apply(a, operations[0], 0), /Stale/);
        }
        if (fault === 'fingerprint') {
          a.sourceSha256 = 'b'.repeat(64);
          assert.throws(() => plan.apply(a, operations[0], 0), /Foreign/);
        }
        if (fault === 'ref')
          assert.throws(
            () =>
              plan.apply(
                a,
                { ...operations[0], reference: inventories[format].forms[1].reference },
                0,
              ),
            /Stale/,
          );
        if (fault === 'sibling') {
          const original = a.sdk.paragraphFlow;
          a.sdk.paragraphFlow = (s) =>
            original(s).map((row) => ({ ...row, source_node: row.source_node + 1000 }));
          assert.throws(() => plan.apply(a, operations[0], 0), /Stale|Owner/);
        }
      } finally {
        a.close();
        b.close();
      }
    }
  });
test('actual Native permission/unknown observations admit all targets before writing; both formats current radio/text capabilities are admitted', async () => {
  for (const options of [{ disabledIndex: 1 }, { unknownStateIndex: 0 }, { readOnly: true }]) {
    const name = Object.keys(options)[0],
      fixtures = await generateFormStateFixtures({
        wasmModule: module,
        directory: join(out, 'variant-' + name),
        options,
      });
    for (const format of ['hwp5', 'hwpx']) {
      const bytes = fixtures[format],
        d = await openDocument({ bytes, wasm });
      let inventory;
      try {
        inventory = readFormInventory(d);
      } finally {
        d.close();
      }
      if (options.unknownStateIndex === 0) {
        assert.notEqual(inventory.forms[0].current.state.state, 'known');
        assert.equal(inventory.forms[0].current.state.raw, format === 'hwp5' ? '9' : 'MYSTERY');
      }
      const operations = ops(format).map((op) => ({
        ...op,
        reference:
          inventory.forms[
            inventories[format].forms.findIndex((row) => row.reference === op.reference)
          ].reference,
      }));
      let writes = 0,
        saves = 0;
      await assert.rejects(
        applyDocumentOperations(
          { bytes, wasm, expectedSha256: hash(bytes), operations, allowStaleLayout: true },
          {
            openDocument: async (input) => {
              const current = await openDocument(input);
              return {
                ...current,
                sdk: new Proxy(current.sdk, {
                  get(t, k) {
                    const v = Reflect.get(t, k);
                    return typeof v === 'function'
                      ? (...args) => {
                          if (['setCheckBoxState', 'selectRadioButton', 'setFormText'].includes(k))
                            writes++;
                          return Reflect.apply(v, t, args);
                        }
                      : v;
                  },
                }),
                save() {
                  saves++;
                  return current.save({ allowStaleLayout: true });
                },
              };
            },
          },
        ),
      );
      assert.equal(writes, 0);
      assert.equal(saves, 0);
    }
  }
});
function cli(format, output, operations, engine = wasmPath, command = 'apply', extra = []) {
  const input = join(out, 'fixtures', 'forms.' + (format === 'hwp5' ? 'hwp' : 'hwpx'));
  const args = [
    cliEntry,
    command,
    input,
    ...(command === 'apply'
      ? [
          '--expect-sha256',
          hash(inputs[format]),
          '--operations',
          JSON.stringify(operations),
          '--output',
          output,
          '--allow-stale-layout',
        ]
      : extra),
    '--wasm',
    engine,
  ];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  events.push({
    kind: 'cli',
    format,
    command,
    engine: hash(engine === oldPath ? old : wasm),
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  });
  return r;
}
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} CLI discovery/object/read and shared edits, strict/late/old no output`, async () => {
    const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
      p = join(out, `cli-${format}.${ext}`),
      r = cli(format, p, ops(format));
    assert.equal(r.status, 0, r.stderr);
    await exact(format, await readFile(p));
    await oracle(format, `cli-${format}`, p);
    const read = cli(format, null, [], wasmPath, 'read', ['--view', 'structure']);
    assert.equal(read.status, 0, read.stderr);
    assert(read.stdout.includes(inventories[format].forms[0].reference));
    const detail = cli(format, null, [], wasmPath, 'object', [
      '--ref',
      inventories[format].forms[0].reference,
    ]);
    assert.equal(detail.status, 0, detail.stderr);
    assert.match(detail.stdout, /UNCHECKED/);
    const info = cli(format, null, [], wasmPath, 'info');
    assert.equal(info.status, 0, info.stderr);
    assert(info.stdout.includes(inventories[format].forms[0].reference));
    for (const [name, operations, engine] of [
      ['late', [...ops(format), late], wasmPath],
      ['old', ops(format), oldPath],
      ['strict', [{ ...ops(format)[0], formNode: 1 }], wasmPath],
      [
        'foreign',
        [
          {
            ...ops(format)[0],
            reference: ops(format)[0].reference.replace(hash(inputs[format]), 'a'.repeat(64)),
          },
        ],
        wasmPath,
      ],
      ...gaps(format).map((op, i) => ['gap' + i, [op], wasmPath]),
    ]) {
      const target = join(out, `cli-${format}-${name}-absent.${ext}`),
        bad = cli(format, target, operations, engine);
      assert.notEqual(bad.status, 0);
      assert.equal(bad.stdout, '');
      await missing(target);
    }
  });
async function mcp(engine, callback) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry, '--wasm', engine],
    stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'forms-bridges', version: '1.0.0' });
  try {
    await client.connect(transport);
    await callback(client);
  } finally {
    try {
      await client.close();
    } finally {
      await transport.close();
      sessions.push({ engine, closed: true });
    }
  }
}
const rpc = async (client, format, path, operations) => {
  const result = await client.callTool({
    name: 'apply_document_changes',
    arguments: {
      inputPath: join(out, 'fixtures', 'forms.' + (format === 'hwp5' ? 'hwp' : 'hwpx')),
      outputPath: path,
      expectedSha256: hash(inputs[format]),
      allowStaleLayout: true,
      operations,
    },
  });
  events.push({ kind: 'mcp', format, operations: operations.map((op) => op.kind), result });
  return result;
};
for (const format of ['hwp5', 'hwpx'])
  test(`actual ${format} MCP stdio discovery, common writer, late/strict/old refusal and finally closed`, async () => {
    await mcp(wasmPath, async (client) => {
      const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
        p = join(out, `mcp-${format}.${ext}`),
        r = await rpc(client, format, p, ops(format));
      assert(!r.isError, JSON.stringify(r));
      await exact(format, await readFile(p));
      await oracle(format, `mcp-${format}`, p);
      const view = await client.callTool({
        name: 'read_document',
        arguments: { inputPath: join(out, 'fixtures', 'forms.' + ext), view: 'structure' },
      });
      assert(!view.isError, JSON.stringify(view));
      assert(JSON.stringify(view).includes(inventories[format].forms[0].reference));
      const info = await client.callTool({
        name: 'get_document_info',
        arguments: { inputPath: join(out, 'fixtures', 'forms.' + ext) },
      });
      assert(!info.isError, JSON.stringify(info));
      assert(JSON.stringify(info).includes(inventories[format].forms[0].reference));
      for (const [name, operations] of [
        ['late', [...ops(format), late]],
        ['strict', [{ ...ops(format)[0], formNode: 10 }]],
        ...gaps(format).map((op, i) => ['gap' + i, [op]]),
      ]) {
        const target = join(out, `mcp-${format}-${name}-absent.${ext}`);
        try {
          const bad = await rpc(client, format, target, operations);
          assert(bad.isError);
        } catch (e) {
          assert.match(e.message, /Invalid|argument|schema/i);
        }
        await missing(target);
      }
    });
    await mcp(oldPath, async (client) => {
      const p = join(out, `mcp-${format}-old-absent`),
        r = await rpc(client, format, p, ops(format));
      assert(r.isError);
      await missing(p);
    });
  });
test('actual HWP5 unnamed radio uses only declared singleton capability; missing flag performs zero writes', async () => {
  const dir = join(out, 'unnamed-fixture'),
    fixture = await generateFormStateFixtures({
      wasmModule: module,
      directory: dir,
      options: { unnamedIndex: 3 },
    }),
    bytes = fixture.hwp5,
    d = await openDocument({ bytes, wasm });
  let inventory;
  try {
    assert.equal(d.sdk.supportsUnnamedRadioSelect(), true);
    inventory = readFormInventory(d);
  } finally {
    d.close();
  }
  const operation = {
    coordinates: 'current-transaction',
    kind: 'form-radio-select',
    reference: inventory.forms[3].reference,
    expectedState: 'UNCHECKED',
    expectedGroupName: '',
  };
  const result = await applyDocumentOperations({
    bytes,
    wasm,
    expectedSha256: hash(bytes),
    operations: [operation],
    allowStaleLayout: true,
  });
  const after = join(out, 'unnamed-after.hwp');
  await writeFile(after, result.bytes);
  const opened = await openDocument({ bytes: result.bytes, wasm });
  try {
    const rows = readFormInventory(opened).forms;
    assert.equal(rows[2].current.state.value, 'CHECKED');
    assert.equal(rows[3].current.state.value, 'CHECKED');
  } finally {
    opened.close();
  }
  const path = join(out, 'unnamed-oracle.json');
  await writeFile(
    path,
    JSON.stringify({
      format: 'hwp5',
      before: join(dir, 'forms.hwp'),
      after,
      states: { F3: 'CHECKED' },
    }),
  );
  for (const flags of [[], ['-O']]) {
    const r = spawnSync(
      'python3',
      [
        '-B',
        ...flags,
        fileURLToPath(new URL('./helpers/form-state-oracle.py', import.meta.url)),
        path,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  const flagOld = withoutFormWriterExports(wasm, true),
    a = await openDocument({ bytes, wasm: flagOld });
  let writes = 0;
  assert.equal(a.sdk.supportsUnnamedRadioSelect(), false);
  await assert.rejects(
    applyDocumentOperations(
      {
        bytes,
        wasm: flagOld,
        expectedSha256: hash(bytes),
        operations: [operation],
        allowStaleLayout: true,
      },
      {
        openDocument: async () => ({
          ...a,
          sdk: {
            ...a.sdk,
            selectRadioButton(...args) {
              writes++;
              return a.sdk.selectRadioButton(...args);
            },
          },
        }),
      },
    ),
    /UnnamedRadioSelectAbiUnavailable/,
  );
  assert.equal(writes, 0);
});
test('actual Native multiple unnamed radios remain ambiguous and publish no service bytes', async () => {
  const fixture = await generateFormStateFixtures({
      wasmModule: module,
      directory: join(out, 'ambiguous-unnamed'),
      options: { groupName: '' },
    }),
    bytes = fixture.hwp5,
    d = await openDocument({ bytes, wasm });
  let rows;
  try {
    rows = readFormInventory(d).forms;
  } finally {
    d.close();
  }
  const operation = {
    coordinates: 'current-transaction',
    kind: 'form-radio-select',
    reference: rows[3].reference,
    expectedState: 'UNCHECKED',
    expectedGroupName: '',
  };
  let saves = 0;
  await assert.rejects(
    applyDocumentOperations(
      { bytes, wasm, expectedSha256: hash(bytes), operations: [operation], allowStaleLayout: true },
      {
        openDocument: async (input) => {
          const a = await openDocument(input);
          return {
            ...a,
            save() {
              saves++;
              return a.save({ allowStaleLayout: true });
            },
          };
        },
      },
    ),
    /AmbiguousUnnamedRadioGroup/,
  );
  assert.equal(saves, 0);
});
test('actual Native rejects unsupported HWP5 form source version without JS version widening or output', async () => {
  const fixture = await generateFormStateFixtures({
      wasmModule: module,
      directory: join(out, 'unsupported-version'),
      options: { version: 0x05000107 },
    }),
    bytes = fixture.hwp5,
    d = await openDocument({ bytes, wasm });
  let inventory;
  try {
    inventory = readFormInventory(d);
  } finally {
    d.close();
  }
  const operation = { ...ops('hwp5')[0], reference: inventory.forms[0].reference };
  let writes = 0,
    saves = 0;
  await assert.rejects(
    applyDocumentOperations(
      { bytes, wasm, expectedSha256: hash(bytes), operations: [operation], allowStaleLayout: true },
      {
        openDocument: async (input) => {
          const a = await openDocument(input);
          return {
            ...a,
            sdk: {
              ...a.sdk,
              setCheckBoxState(...args) {
                writes++;
                return a.sdk.setCheckBoxState(...args);
              },
            },
            save() {
              saves++;
              return a.save({ allowStaleLayout: true });
            },
          };
        },
      },
    ),
    /UnsupportedFormSourceVersion/,
  );
  assert.equal(writes, 1);
  assert.equal(saves, 0);
});
test('Native serial changes across asynchronous admission invalidate captured form provenance before any bridge write', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const d = await openDocument({ bytes: inputs[format], wasm });
    let scheduled = false,
      writes = 0,
      saves = 0,
      closed = 0;
    const observe = format === 'hwp5' ? 'formSources' : 'formSites';
    const sdk = new Proxy(d.sdk, {
      get(target, key) {
        const fn = Reflect.get(target, key);
        if (typeof fn !== 'function') return fn;
        return (...args) => {
          const value = Reflect.apply(fn, target, args);
          if (key === 'setCheckBoxState') writes++;
          if (key === observe && !scheduled) {
            scheduled = true;
            queueMicrotask(() =>
              d.sdk.setCheckBoxState(0, inventories[format].forms[0].source.node, 'CHECKED'),
            );
          }
          return value;
        };
      },
    });
    await assert.rejects(
      apply(
        format,
        [ops(format)[0]],
        {},
        {
          openDocument: async () => ({
            ...d,
            sdk,
            save() {
              saves++;
              return d.save({ allowStaleLayout: true });
            },
            close() {
              closed++;
              d.close();
            },
          }),
        },
      ),
      /StaleFormStateReference/,
    );
    assert.equal(writes, 0);
    assert.equal(saves, 0);
    assert.equal(closed, 1);
  }
});
test(
  process.env.HWPJS_FORM_PRIOR_WASM
    ? 'R3 actual pinned prior Native rejects HWPX radio/text before history/setter/save; real CLI/MCP no output'
    : 'R3 export-mask Native rejects HWPX radio/text before history/setter/save; real CLI/MCP no output',
  async () => {
    assert.equal(
      Boolean(process.env.HWPJS_FORM_PRIOR_WASM),
      Boolean(process.env.HWPJS_FORM_PRIOR_WASM_SHA256),
      'PriorWasmAndPinMustBePaired',
    );
    const priorPath = process.env.HWPJS_FORM_PRIOR_WASM ?? oldPath,
      oldPin = process.env.HWPJS_FORM_PRIOR_WASM_SHA256 ?? hash(old);
    assert(isAbsolute(priorPath));
    assert.match(oldPin, /^[a-f0-9]{64}$/);
    const oldBytes = await readFile(priorPath);
    assert.equal(hash(oldBytes), oldPin);
    events.push({
      kind: 'prior-engine-verification',
      mode: process.env.HWPJS_FORM_PRIOR_WASM ? 'actual-pinned-prior' : 'export-mask-only',
      sha256: oldPin,
    });
    for (const operation of ops('hwpx').filter((op) =>
      ['form-radio-select', 'form-text'].includes(op.kind),
    )) {
      const d = await openDocument({ bytes: inputs.hwpx, wasm: oldBytes }),
        calls = [];
      const sdk = new Proxy(d.sdk, {
        get(target, key) {
          const fn = Reflect.get(target, key);
          return typeof fn === 'function'
            ? (...args) => {
                if (
                  [
                    'enableHistoryV2',
                    'selectRadioButton',
                    'setFormText',
                    'setParagraphAlignment',
                  ].includes(key)
                )
                  calls.push(key);
                return Reflect.apply(fn, target, args);
              }
            : fn;
        },
      });
      await assert.rejects(
        apply(
          'hwpx',
          [operation],
          { wasm: oldBytes },
          {
            openDocument: async () => ({
              ...d,
              sdk,
              save() {
                calls.push('save');
                return d.save();
              },
            }),
          },
        ),
        /FormWriterAbiUnavailable/,
      );
      assert.deepEqual(calls, []);
      const target = join(
        out,
        `actual-prior-cli-${operation.kind}-${operation.reference.split('/').at(-1)}.hwpx`,
      );
      const child = cli('hwpx', target, [operation], priorPath);
      assert.notEqual(child.status, 0);
      assert.equal(child.stdout, '');
      assert.match(child.stderr, /FormWriterAbiUnavailable/);
      await missing(target);
    }
    await mcp(priorPath, async (client) => {
      for (const [index, operation] of ops('hwpx')
        .filter((op) => ['form-radio-select', 'form-text'].includes(op.kind))
        .entries()) {
        const target = join(out, `actual-prior-mcp-${index}-absent.hwpx`);
        const answer = await rpc(client, 'hwpx', target, [operation]);
        assert.equal(answer.isError, true);
        assert.match(JSON.stringify(answer), /FormWriterAbiUnavailable/);
        await missing(target);
      }
    });
  },
);
test('R3 immutable issued logical reference cannot alias an identical owner after operation object mutation', async () => {
  const d = await openDocument({ bytes: inputs.hwpx, wasm });
  try {
    const operations = ops('hwpx').slice(0, 1);
    prepareOperationSession(d, operations);
    const plan = prepareFormOperations(d, operations);
    operations[0].reference = inventories.hwpx.forms[1].reference;
    assert.throws(() => plan.apply(d, operations[0], 0), /Stale/);
  } finally {
    d.close();
  }
});
test('object form branch closes exactly once even when close fails', async () => {
  const d = await openDocument({ bytes: inputs.hwp5, wasm });
  let closes = 0;
  await assert.rejects(
    inspectDocumentObject(
      { bytes: inputs.hwp5, wasm, reference: inventories.hwp5.forms[0].reference },
      {
        openDocument: async () => ({
          ...d,
          close() {
            closes++;
            d.close();
            throw Error('CloseFailure');
          },
        }),
      },
    ),
    /InspectionCloseFailed/,
  );
  assert.equal(closes, 1);
});
test('R3 actual HWPX unnamed radio uses only declared singleton capability; missing flag performs zero writes', async () => {
  const dir = join(out, 'hx-unnamed-fixture'),
    fixture = await generateFormStateFixtures({
      wasmModule: module,
      directory: dir,
      options: { unnamedIndex: 3 },
    }),
    bytes = fixture.hwpx,
    d = await openDocument({ bytes, wasm });
  let inventory;
  try {
    assert.equal(d.sdk.supportsUnnamedRadioSelect(), true);
    inventory = readFormInventory(d);
  } finally {
    d.close();
  }
  const operation = {
    coordinates: 'current-transaction',
    kind: 'form-radio-select',
    reference: inventory.forms[3].reference,
    expectedState: 'UNCHECKED',
    expectedGroupName: '',
  };
  const result = await applyDocumentOperations({
    bytes,
    wasm,
    expectedSha256: hash(bytes),
    operations: [operation],
    allowStaleLayout: true,
  });
  const after = join(out, 'hx-unnamed-after.hwpx');
  await writeFile(after, result.bytes);
  const opened = await openDocument({ bytes: result.bytes, wasm });
  try {
    const rows = readFormInventory(opened).forms;
    assert.equal(rows[2].current.state.value, 'CHECKED');
    assert.equal(rows[3].current.state.value, 'CHECKED');
  } finally {
    opened.close();
  }
  const path = join(out, 'hx-unnamed-oracle.json');
  await writeFile(
    path,
    JSON.stringify({
      format: 'hwpx',
      before: join(dir, 'forms.hwpx'),
      after,
      states: { F3: 'CHECKED' },
    }),
  );
  for (const flags of [[], ['-O']]) {
    const r = spawnSync(
      'python3',
      [
        '-B',
        ...flags,
        fileURLToPath(new URL('./helpers/form-state-oracle.py', import.meta.url)),
        path,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  const flagOld = withoutFormWriterExports(wasm, true),
    a = await openDocument({ bytes, wasm: flagOld });
  let writes = 0;
  assert.equal(a.sdk.supportsUnnamedRadioSelect(), false);
  await assert.rejects(
    applyDocumentOperations(
      {
        bytes,
        wasm: flagOld,
        expectedSha256: hash(bytes),
        operations: [operation],
        allowStaleLayout: true,
      },
      {
        openDocument: async () => ({
          ...a,
          sdk: {
            ...a.sdk,
            selectRadioButton(...args) {
              writes++;
              return a.sdk.selectRadioButton(...args);
            },
          },
        }),
      },
    ),
    /UnnamedRadioSelectAbiUnavailable/,
  );
  assert.equal(writes, 0);
});
test('R3 actual HWPX multiple unnamed radios remain ambiguous and publish no service bytes', async () => {
  const fixture = await generateFormStateFixtures({
      wasmModule: module,
      directory: join(out, 'hx-ambiguous-unnamed'),
      options: { groupName: '' },
    }),
    bytes = fixture.hwpx,
    d = await openDocument({ bytes, wasm });
  let rows;
  try {
    rows = readFormInventory(d).forms;
  } finally {
    d.close();
  }
  const operation = {
    coordinates: 'current-transaction',
    kind: 'form-radio-select',
    reference: rows[3].reference,
    expectedState: 'UNCHECKED',
    expectedGroupName: '',
  };
  let saves = 0;
  await assert.rejects(
    applyDocumentOperations(
      { bytes, wasm, expectedSha256: hash(bytes), operations: [operation], allowStaleLayout: true },
      {
        openDocument: async (input) => {
          const a = await openDocument(input);
          return {
            ...a,
            save() {
              saves++;
              return a.save({ allowStaleLayout: true });
            },
          };
        },
      },
    ),
    /AmbiguousUnnamedRadioGroup/,
  );
  assert.equal(saves, 0);
});
test('record exact Native capability/current-read evidence and completed owned sessions', async () => {
  await writeFile(
    join(out, 'RESULT.json'),
    JSON.stringify(
      {
        wasmSha256: pin,
        cliEntry,
        mcpEntry,
        inventories,
        events,
        oracles,
        sessions,
        noNpm: true,
        nativeBuild: false,
      },
      null,
      2,
    ) + '\n',
  );
  assert(sessions.every((x) => x.closed));
});
