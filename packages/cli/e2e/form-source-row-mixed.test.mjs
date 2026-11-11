import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { openDocument } from '../src/engine.ts';
import { readFormInventory } from '../src/document-forms.ts';
import { readDocumentModel } from '../src/document-model.ts';

// Opt-in E2E: required explicit inputs, no skip, implicit engine, or fixture fallback.
const env = process.env;
const required = (name) => {
  const value = env[name];
  assert(value && isAbsolute(value), `${name}: explicit absolute path required`);
  return value;
};
const wasmPath = required('HWPJS_TEST_WASM');
const output = required('HWPJS_FORM_ROW_EVIDENCE');
const packagePath = required('HWPJS_FORM_ROW_PACKAGE');
const pin = env.HWPJS_TEST_WASM_SHA256;
assert.match(pin ?? '', /^[a-f0-9]{64}$/);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wasm = await readFile(wasmPath);
assert.equal(hash(wasm), pin, 'Native pin mismatch');
const cli = join(packagePath, 'dist/cli.mjs');
const mcp = join(packagePath, 'dist/mcp.mjs');
const packageWasm = await readFile(join(packagePath, 'dist/hwpjs.wasm'));
assert.equal(hash(packageWasm), pin, 'Package and SDK must use the same Native');
await access(cli);
await access(mcp);
await mkdir(output); // Existing evidence is never overwritten.
const fixtureRoot = fileURLToPath(new URL('./fixtures/form-source-row/', import.meta.url));
const manifest = JSON.parse(await readFile(join(fixtureRoot, 'manifest.json'), 'utf8'));
const fixtures = manifest.files;
assert.equal(fixtures.length, 12);
for (const f of fixtures) {
  assert.equal(f.file, f.file.split('/').at(-1));
  f.path = join(fixtureRoot, f.file);
  const bytes = await readFile(f.path);
  assert.equal(bytes.length, f.bytes);
  assert.equal(hash(bytes), f.sha256);
}
const originals = fixtures.filter((f) => f.variant === 'original');
assert.equal(originals.length, 4);
const events = [];
const rpcInputs = [];
const save = (d) => {
  const result = d.save({ allowStaleLayout: true });
  return result instanceof Uint8Array ? result : result.bytes;
};
function targets(d) {
  const forms = readFormInventory(d).forms;
  assert.equal(forms.length, 6);
  assert(forms.every((f) => f.ownership === 'located'));
  const map = new Map(forms.map((f) => [f.current.name.value, f]));
  assert.equal(map.size, 6);
  return map;
}
function state(d) {
  const forms = Object.fromEntries(
    [...targets(d)].map(([name, f]) => [
      name,
      {
        kind: f.kind,
        current: f.current,
        permissions: f.permissions,
      },
    ]),
  );
  const cells = d.sdk.tableBindings(0);
  assert.equal(new Set(cells.map((c) => c.tableNode)).size, 1);
  const { rows, columns } = cells[0];
  assert.equal(columns, 2);
  assert.equal(cells.length, rows * columns);
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(null));
  for (const cell of cells) {
    assert.equal(cell.rowSpan, 1);
    assert.equal(cell.columnSpan, 1);
    assert.equal(matrix[cell.row][cell.column], null);
    const text =
      d.format === 'hwp5' ? d.sdk.text(0, cell.paragraph) : d.sdk.anchorText(0, cell.paragraph);
    matrix[cell.row][cell.column] = text.replace(/\r$/, '');
  }
  return { forms, matrix };
}
const history = (s) => ({
  revision: s.historyRevision(),
  revisions: s.historyRevisions(),
  stats: s.historyStats(),
});
function expected(previous, kind, action) {
  const next = structuredClone(previous);
  if (kind === 'row')
    next.matrix =
      action === 'insert-row' ? [next.matrix[0], ['', ''], next.matrix[1]] : [next.matrix[1]];
  if (kind === 'text' || kind === 'combo') {
    const value = kind === 'combo' ? next.forms.F5.current.text : next.forms.F4.current.text;
    value.value = kind === 'combo' ? 'combo pending 😀' : 'pending 😀';
    if (value.raw !== undefined) value.raw = value.value;
  }
  for (const name of kind === 'checkbox' ? ['F0'] : kind === 'radio' ? ['F2', 'F3'] : []) {
    const value = next.forms[name].current.state;
    value.value = name === 'F2' ? 'UNCHECKED' : 'CHECKED';
    if (value.raw !== undefined) value.raw = name === 'F2' ? '0' : '1';
  }
  return next;
}
function writeForm(d, knownTargets, kind) {
  const f = knownTargets.get(
    kind === 'text' ? 'F4' : kind === 'combo' ? 'F5' : kind === 'checkbox' ? 'F0' : 'F3',
  );
  // These are current bindings from this open session, never serialized targets.
  if (kind === 'checkbox') d.sdk.setCheckBoxState(f.source.section, f.source.node, 'CHECKED');
  else if (kind === 'radio') d.sdk.selectRadioButton(f.source.section, f.source.node);
  else
    d.sdk.setFormText({
      section: f.source.section,
      formNode: f.source.node,
      text: kind === 'combo' ? 'combo pending 😀' : 'pending 😀',
    });
}
function row(d, table, action, stale = false) {
  d.sdk.editSourceTableGrid({
    section: 0,
    tableNode: table.tableNode,
    expectedRows: table.rows + (stale ? 1 : 0),
    expectedColumns: table.columns,
    action,
    index: action === 'insert-row' ? 1 : 0,
    layout: d.format === 'hwp5' ? 'observed8' : 'spec6',
  });
}
async function oracle(fixture, path, value, counter = false, unchangedTable = false) {
  const plan = {
    format: fixture.format,
    before: fixture.path,
    after: path,
    rows: value.matrix.length,
    matrix: value.matrix,
    states: Object.fromEntries(
      ['F0', 'F1', 'F2', 'F3'].map((n) => [n, value.forms[n].current.state.value]),
    ),
    texts: Object.fromEntries(['F4', 'F5'].map((n) => [n, value.forms[n].current.text.value])),
  };
  const script = fileURLToPath(
    new URL(
      `./helpers/${unchangedTable ? 'form-state-oracle.py' : 'form-source-row-oracle.py'}`,
      import.meta.url,
    ),
  );
  const runs = [];
  for (const fault of counter ? ['', 'form', 'cell'] : ['']) {
    const p = structuredClone(plan);
    if (fault === 'form') p.texts.F4 = 'WRONG';
    if (fault === 'cell') p.matrix[0][0] = 'WRONG';
    const planPath = path + '.' + (fault || 'correct') + '.json';
    await writeFile(planPath, JSON.stringify(p));
    for (const flags of [[], ['-O']]) {
      const result = spawnSync('python3', ['-B', ...flags, script, planPath], {
        encoding: 'utf8',
        timeout: 20000,
      });
      if (fault) assert.equal(result.status, 1, result.stderr);
      else assert.equal(result.status, 0, result.stderr);
      runs.push({ fault, flags, exit: result.status });
    }
  }
  await writeFile(path + '.oracle-result.json', JSON.stringify(runs));
}
async function checkSaved(d, f, name, value, counter = false, unchangedTable = false) {
  const bytes = save(d),
    path = join(output, name + (f.format === 'hwp5' ? '.hwp' : '.hwpx'));
  await writeFile(path, bytes);
  await oracle(f, path, value, counter, unchangedTable);
  const reopened = await openDocument({ bytes, wasm });
  try {
    assert.deepEqual(state(reopened), value);
    assert.equal(reopened.sdk.createdTables(0).length, 0);
  } finally {
    reopened.close();
  }
  return { bytes, path };
}
for (const f of originals)
  for (const action of ['insert-row', 'delete-row']) {
    for (const order of ['form-first', 'row-first'])
      test(`${f.format}/${f.position}/${action}/${order}`, async () => {
        const d = await openDocument({ bytes: await readFile(f.path), wasm });
        const name = `${f.format}-${f.position}-${action}-${order}`;
        try {
          d.sdk.enableHistoryV2();
          assert.equal(d.sdk.createdTables(0).length, 0);
          const initial = state(d),
            states = [initial];
          let table = d.sdk.tableBindings(0)[0];
          if (order === 'row-first') {
            row(d, table, action);
            states.push(expected(states.at(-1), 'row', action));
          }
          // Query fresh owner bindings after a structural edit. Value writes keep these bindings.
          const current = targets(d);
          for (const kind of ['text', 'checkbox', 'radio']) {
            writeForm(d, current, kind);
            states.push(expected(states.at(-1), kind, action));
          }
          if (order === 'form-first') {
            // No getter or explicit save after the final pending form write.
            row(d, table, action);
            states.push(expected(states.at(-1), 'row', action));
          }
          assert.deepEqual(state(d), states[4]);
          assert.equal(d.sdk.historyStats().undoCount, 4);
          const final = await checkSaved(d, f, name + '-final', states[4], true);
          for (let i = 3; i >= 0; i--) {
            assert(d.sdk.undo());
            assert.deepEqual(state(d), states[i]);
            assert.equal(d.sdk.historyStats().undoCount, i);
            assert.equal(d.sdk.historyStats().redoCount, 4 - i);
            const saved = await checkSaved(d, f, name + '-undo' + i, states[i]);
            if (i === 0) assert.equal(hash(saved.bytes), f.sha256);
          }
          for (let i = 1; i <= 4; i++) {
            assert(d.sdk.redo());
            assert.deepEqual(state(d), states[i]);
            const saved = await checkSaved(d, f, name + '-redo' + i, states[i]);
            if (i === 4) assert.deepEqual(saved.bytes, final.bytes);
          }
          events.push({ name, passed: true, unreadPendingBoundary: true });
        } finally {
          d.close();
          globalThis.gc?.();
        }
        assert.equal(hash(await readFile(f.path)), f.sha256);
      });
  }
for (const original of originals)
  for (const mode of ['stale', 'protected', 'readonly']) {
    const f =
      mode === 'stale'
        ? original
        : fixtures.find(
            (f) =>
              f.format === original.format &&
              f.position === original.position &&
              f.variant === mode,
          );
    test(`${f.format}/${f.position}/${mode}: exact pending/history/redo on refusal`, async () => {
      const d = await openDocument({ bytes: await readFile(f.path), wasm });
      const name = `${f.format}-${f.position}-${mode}`;
      try {
        d.sdk.enableHistoryV2();
        let pending = state(d);
        const table = d.sdk.tableBindings(0)[0];
        if (mode === 'readonly') {
          row(d, table, 'insert-row');
          pending = expected(pending, 'row', 'insert-row');
          writeForm(d, targets(d), 'combo');
          pending = expected(pending, 'combo');
        } else {
          const current = targets(d);
          for (const kind of ['text', 'checkbox', 'radio']) {
            writeForm(d, current, kind);
            pending = expected(pending, kind);
          }
        }
        const before = history(d.sdk);
        const error =
          mode === 'readonly'
            ? /FormTextNotEditable|FormValueProtected/
            : mode === 'stale'
              ? /SourceBindingMismatch|StaleSourceTableGrid/
              : f.format === 'hwp5'
                ? /UnsupportedSourceTableGrid/
                : /ProtectedSourceTable/;
        const reject = () => {
          if (mode === 'readonly') writeForm(d, targets(d), 'text');
          else row(d, d.sdk.tableBindings(0)[0], 'insert-row', mode === 'stale');
        };
        if (mode === 'readonly') assert.throws(reject, error);
        else assert.throws(() => row(d, table, 'insert-row', mode === 'stale'), error);
        // History is checked before the first post-error form getter.
        assert.deepEqual(history(d.sdk), before);
        assert.deepEqual(state(d), pending);
        const saved = await checkSaved(
          d,
          f,
          name + '-pending',
          pending,
          false,
          mode !== 'readonly',
        );
        if (f.format === 'hwpx' && mode === 'protected') rpcInputs.push({ f, path: saved.path });
        assert(d.sdk.undo());
        const redo = history(d.sdk),
          afterUndo = state(d);
        assert.throws(reject, error);
        assert.deepEqual(history(d.sdk), redo);
        assert.deepEqual(state(d), afterUndo);
        assert(d.sdk.redo());
        assert.deepEqual(history(d.sdk), before);
        assert.deepEqual(state(d), pending);
        events.push({ name, passed: true, historyExact: true, redoExact: true });
      } finally {
        d.close();
        globalThis.gc?.();
      }
      assert.equal(hash(await readFile(f.path)), f.sha256);
    });
  }
async function reference(bytes) {
  const d = await openDocument({ bytes, wasm });
  try {
    const model = await readDocumentModel(d),
      stack = model.sections.flatMap((s) => s.body),
      tables = [];
    while (stack.length) {
      const b = stack.pop();
      if (b.type === 'table') {
        tables.push(b);
        for (const c of b.cells) stack.push(...c.blocks);
      }
    }
    assert.equal(tables.length, 1);
    assert.equal(typeof tables[0].reference, 'string');
    return tables[0].reference;
  } finally {
    d.close();
  }
}
test('actual package CLI/MCP numeric protection: raw and saved-pending; no input mutation/output', async () => {
  assert.equal(rpcInputs.length, 2);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcp, '--wasm', wasmPath],
    stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'form-source-row-ci', version: '1.0.0' });
  const cases = [];
  try {
    await client.connect(transport);
    for (const { f, path } of rpcInputs)
      for (const action of ['insert-row', 'delete-row']) {
        for (const [phase, input] of [
          ['raw', f.path],
          ['pending', path],
        ]) {
          const bytes = await readFile(input),
            original = hash(bytes),
            ref = await reference(bytes);
          const name = `${f.position}-${action}-${phase}`;
          const args = {
            inputPath: input,
            outputPath: join(output, name + '-mcp-absent.hwpx'),
            reference: ref,
            action,
            index: action === 'insert-row' ? 1 : 0,
            expectedRows: 2,
            expectedColumns: 2,
            layout: 'spec6',
            allowStaleLayout: true,
          };
          const cliOutput = join(output, name + '-cli-absent.hwpx');
          const result = spawnSync(
            process.execPath,
            [
              cli,
              'edit-table-grid',
              input,
              '--ref',
              ref,
              '--action',
              action,
              '--index',
              String(args.index),
              '--rows',
              '2',
              '--columns',
              '2',
              '--layout',
              'spec6',
              '--allow-stale-layout',
              '--output',
              cliOutput,
              '--wasm',
              wasmPath,
            ],
            { encoding: 'utf8', timeout: 20000 },
          );
          assert.equal(result.status, 1, result.stderr);
          assert.equal(result.stdout, '');
          assert.match(result.stderr, /ProtectedSourceTable/);
          const rpc = await client.callTool({ name: 'edit_document_table_grid', arguments: args });
          assert.equal(rpc.isError, true);
          assert.match(JSON.stringify(rpc), /ProtectedSourceTable/);
          for (const p of [cliOutput, args.outputPath])
            await assert.rejects(access(p), { code: 'ENOENT' });
          assert.equal(hash(await readFile(input)), original);
          cases.push({
            name,
            cliExit: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            rpc,
            inputUnchanged: true,
            outputAbsent: true,
          });
        }
      }
  } finally {
    try {
      await client.close();
    } finally {
      await transport.close();
    }
  }
  assert.equal(cases.length, 8);
  events.push({ name: 'actual-package', cases, finallyClosed: true });
});
test('exact mixed gate receipt', async () => {
  assert.equal(events.length, 29);
  await writeFile(
    join(output, 'RESULT.json'),
    JSON.stringify(
      {
        nativeSha256: pin,
        fixtureOriginSha256: manifest.nativeOriginSha256,
        packageCliSha256: hash(await readFile(cli)),
        packageMcpSha256: hash(await readFile(mcp)),
        events,
      },
      null,
      2,
    ),
  );
});
