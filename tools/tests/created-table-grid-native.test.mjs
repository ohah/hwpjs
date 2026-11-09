import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { inspectCreatedGridArchive } from '../created-table-grid-oracle.mjs';
const required = (name) => {
  const value = process.env[name];
  assert(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), name);
  return value;
};
const source = realpathSync(required('HWPJS_TEST_SOURCE_ROOT'));
assert(source.includes('/zig-out/verification/'));
const binary = readFileSync(required('HWPJS_TEST_WASM'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
assert.equal(sha(binary), process.env.HWPJS_TEST_WASM_SHA256);
const evidence = required('HWPJS_TEST_EVIDENCE_DIR');
mkdirSync(evidence);
const load = (path) => import(pathToFileURL(resolve(source, path)));
const { createExperimentalHwp5Editor } = await load('js/hwp5-editor.mjs');
const { createHwpxEditor } = await load('js/hwpx-editor.mjs');
const { hwp5TableCreationRequest } = await load('web/preview/hwp5-table-creation-command.mjs');
const require = createRequire(resolve(source, 'packages/cli/package.json'));
const { Client } = await import(require.resolve('@modelcontextprotocol/client'));
const { StdioClientTransport } = await import(
  require.resolve('@modelcontextprotocol/client/stdio')
);
const initial = [
  ['A🙂<&', 'B'],
  ['C한글', 'D'],
];
const fixtures = [
  {
    format: 'hwp5',
    file: required('HWPJS_TEST_NOORI'),
    sha: 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
    paragraph: 2,
    ext: 'hwp',
  },
  {
    format: 'hwpx',
    file: required('HWPJS_TEST_NOORI_HWPX'),
    sha: '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
    paragraph: 3,
    ext: 'hwpx',
  },
];
for (const f of fixtures) {
  f.bytes = readFileSync(f.file);
  assert.equal(sha(f.bytes), f.sha);
}
async function open(f, bytes = f.bytes) {
  if (f.format === 'hwp5') return createExperimentalHwp5Editor(binary, bytes);
  const sdk = await createHwpxEditor(binary);
  sdk.open(bytes);
  return sdk;
}
const snapshot = (sdk, f) => sdk.createdTables(0).map((x) => (f.format === 'hwp5' ? x.table : x));
const save = (sdk, f) =>
  Buffer.from(f.format === 'hwp5' ? sdk.save({ allowStaleLayout: true }).bytes : sdk.save());
for (const f of fixtures) {
  const host = inspectCreatedGridArchive(f.bytes, f.format).hosts.find(
    (h) => h.text.length > 1 && [...h.text].every((c) => c.charCodeAt(0) >= 32 || c === '\r'),
  );
  assert(host, 'NoIndependentTopLevelHost');
  const sdk = await open(f);
  try {
    assert.equal(
      f.format === 'hwp5' ? sdk.text(0, host.paragraph) : sdk.anchorText(0, host.paragraph),
      host.text,
    );
  } finally {
    sdk.close();
  }
  f.paragraph = host.paragraph;
}
function resources(sdk) {
  return Object.fromEntries(
    Object.entries(sdk.tableCreationResources()).map(([key, values]) => {
      assert(values.length);
      return [key, values[0]];
    }),
  );
}
function insert(sdk, f, res) {
  const options = { rows: 2, columns: 2, width: 12000, rowHeight: 2000, resources: res };
  if (f.format === 'hwpx')
    return sdk.insertTable(0, f.paragraph, 0, { ...options, cellTexts: initial });
  return sdk.insertTable({
    ...hwp5TableCreationRequest({ section: 0, paragraph: f.paragraph, unit: 0, options }),
    cell_texts: initial,
  });
}
function matrixEdit(matrix, action, index) {
  const out = matrix.map((row) => row.slice());
  if (action === 'insert-row') out.splice(index, 0, Array(out[0].length).fill(''));
  if (action === 'delete-row') out.splice(index, 1);
  if (action === 'insert-column') for (const row of out) row.splice(index, 0, '');
  if (action === 'delete-column') for (const row of out) row.splice(index, 1);
  return out;
}
function verifyArchive(f, bytes, table, matrix, label) {
  const view = inspectCreatedGridArchive(bytes, f.format),
    base = inspectCreatedGridArchive(f.bytes, f.format);
  const matches = view.tables.filter((t) => t.instance === table.instance_id);
  assert.equal(matches.length, 1, label);
  const actual = matches[0];
  assert.equal(actual.rows, matrix.length);
  assert.equal(actual.columns, matrix[0].length);
  assert.equal(actual.cells.length, matrix.flat().length);
  for (const [i, cell] of actual.cells.entries()) {
    const row = Math.floor(i / actual.columns),
      column = i % actual.columns;
    assert.equal(cell.row, row);
    assert.equal(cell.column, column);
    assert.equal(cell.rowSpan, 1);
    assert.equal(cell.columnSpan, 1);
    assert.equal(cell.text, matrix[row][column]);
    assert.equal(cell.paragraphId, String(table.cells[i].paragraph_id));
    assert(cell.width > 0);
    assert.equal(cell.height, 2000);
  }
  assert.equal(new Set(actual.cells.map((c) => c.paragraphId)).size, actual.cells.length);
  const other = (t) => JSON.stringify(t);
  assert.deepEqual(
    view.tables.filter((t) => t.instance !== table.instance_id).map(other),
    base.tables.map(other),
  );
  const target = f.format === 'hwp5' ? 'BodyText/Section0' : 'Contents/section0.xml';
  for (const [name, hash] of Object.entries(base.streams))
    if (name !== target) assert.equal(view.streams[name], hash, label + ':' + name);
  writeFileSync(join(evidence, label + '.' + f.ext), bytes, { flag: 'wx' });
}
for (const f of fixtures)
  test(
    f.format +
      ' generated grid SDK edits preserve IDs, one-step history and independent saved fields',
    { timeout: 60000 },
    async () => {
      const sdk = await open(f);
      let matrix = initial.map((r) => r.slice());
      try {
        assert.equal(sdk.supportsCreatedTableGrid(), true);
        sdk.enableHistory({ maxEntries: 16, maxCheckpointBytes: 8 * 1024 * 1024 });
        const identity = insert(sdk, f, resources(sdk));
        let before = snapshot(sdk, f)[0];
        assert.equal(before.identity, identity);
        let previous = save(sdk, f);
        for (const [action, index] of [
          ['insert-row', 1],
          ['insert-column', 1],
          ['delete-row', 1],
          ['delete-column', 1],
        ]) {
          const old = structuredClone(before),
            oldBytes = previous,
            oldRevisions = sdk.historyRevisions().length;
          sdk.editCreatedTableGrid({ section: 0, identity, action, index });
          matrix = matrixEdit(matrix, action, index);
          const after = snapshot(sdk, f)[0];
          assert.equal(sdk.historyRevisions().length, oldRevisions + 1);
          assert.deepEqual(
            after.cells.map((c) => c.text),
            matrix.flat(),
          );
          assert.equal(after.identity, old.identity);
          assert.equal(after.instance_id, old.instance_id);
          assert.deepEqual(after.resources, old.resources);
          assert.equal(after.width, old.width);
          const oldIds = new Map(old.cells.map((c) => [c.paragraph_id, c.text]));
          for (const cell of after.cells)
            if (oldIds.has(cell.paragraph_id))
              assert.equal(cell.text, oldIds.get(cell.paragraph_id));
          const bytes = save(sdk, f);
          verifyArchive(f, bytes, after, matrix, f.format + '-' + action);
          assert.equal(sdk.undo(), true);
          assert.deepEqual(snapshot(sdk, f)[0], old);
          assert.deepEqual(save(sdk, f), oldBytes);
          const denied = sdk.historyRevisions();
          assert.throws(() =>
            sdk.editCreatedTableGrid({
              section: 0,
              identity,
              action: 'delete-row',
              index: 0xffffffff,
            }),
          );
          assert.deepEqual(sdk.historyRevisions(), denied);
          assert.deepEqual(save(sdk, f), oldBytes);
          assert.equal(sdk.redo(), true);
          assert.deepEqual(snapshot(sdk, f)[0], after);
          assert.deepEqual(save(sdk, f), bytes);
          before = after;
          previous = bytes;
        }
        const reopened = await open(f, previous);
        try {
          assert.deepEqual(snapshot(reopened, f), []);
          assert.throws(() =>
            reopened.editCreatedTableGrid({ section: 0, identity, action: 'insert-row', index: 0 }),
          );
          assert.deepEqual(save(reopened, f), previous);
        } finally {
          reopened.close();
        }
      } finally {
        sdk.close();
        assert.equal(sha(readFileSync(f.file)), f.sha);
      }
    },
  );
const content = (result) =>
  result.content
    .map((item) => {
      assert.equal(item.type, 'text');
      return item.text;
    })
    .join('');
for (const f of fixtures)
  test(
    f.format + ' CLI and MCP apply share generated-grid transaction and refuse partial output',
    { timeout: 60000 },
    async () => {
      const sourceSdk = await open(f);
      let res;
      try {
        res = resources(sourceSdk);
      } finally {
        sourceSdk.close();
      }
      const operations = [
        {
          kind: 'table-insert',
          coordinates: 'current-transaction',
          section: 0,
          paragraph: f.paragraph,
          unit: 0,
          rows: 2,
          columns: 2,
          width: 12000,
          rowHeight: 2000,
          resources: res,
          cellTexts: initial,
        },
        {
          kind: 'created-table-grid',
          coordinates: 'current-transaction',
          section: 0,
          identity: '1',
          action: 'insert-row',
          index: 1,
        },
      ];
      const output = join(evidence, 'cli-' + f.ext + '.' + f.ext);
      const installed = process.env.HWPJS_TEST_INSTALLED_PACKAGE;
      if (installed) assert(isAbsolute(installed));
      const cli = installed
        ? resolve(installed, 'dist/hwpjs.mjs')
        : resolve(source, 'packages/cli/src/bin.ts');
      const args = [
        'apply',
        f.file,
        '--wasm=' + required('HWPJS_TEST_WASM'),
        '--expect-sha256=' + f.sha,
        '--operations=' + JSON.stringify(operations),
        '--output=' + output,
        '--allow-stale-layout',
      ];
      const result = spawnSync(process.execPath, [cli, ...args], {
        cwd: evidence,
        encoding: 'utf8',
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      });
      assert.equal(result.status, 0, result.stderr);
      const view = inspectCreatedGridArchive(readFileSync(output), f.format);
      assert(
        view.tables.some(
          (t) =>
            t.rows === 3 &&
            t.columns === 2 &&
            JSON.stringify(t.cells.map((c) => c.text)) ===
              JSON.stringify(matrixEdit(initial, 'insert-row', 1).flat()),
        ),
      );
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          installed
            ? resolve(installed, 'dist/mcp.mjs')
            : resolve(source, 'packages/cli/src/mcp-bin.ts'),
          '--wasm',
          required('HWPJS_TEST_WASM'),
        ],
        cwd: evidence,
        stderr: 'pipe',
      });
      const client = new Client({ name: 'grid-native-verifier', version: '1' });
      try {
        await client.connect(transport);
        const mcpOutput = join(evidence, 'mcp-' + f.ext + '.' + f.ext);
        const reply = await client.callTool({
          name: 'apply_document_changes',
          arguments: {
            inputPath: f.file,
            outputPath: mcpOutput,
            expectedSha256: f.sha,
            operations,
            allowStaleLayout: true,
          },
        });
        assert.notEqual(reply.isError, true, content(reply));
        assert.deepEqual(readFileSync(mcpOutput), readFileSync(output));
      } finally {
        await client.close();
      }
      const bad = join(evidence, 'refused-' + f.ext + '.' + f.ext);
      const invalid = spawnSync(
        process.execPath,
        [
          cli,
          ...args.filter((x) => !x.startsWith('--operations=') && !x.startsWith('--output=')),
          '--operations=' +
            JSON.stringify([...operations, { ...operations[1], index: 0xffffffff }]),
          '--output=' + bad,
        ],
        { cwd: evidence, encoding: 'utf8', timeout: 20000 },
      );
      assert.equal(invalid.status, 1);
      assert.throws(() => readFileSync(bad), /ENOENT/);
      assert.equal(sha(readFileSync(f.file)), f.sha);
    },
  );
