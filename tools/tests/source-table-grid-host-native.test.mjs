import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, realpathSync, lstatSync } from 'node:fs';
import { isAbsolute, resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Validate every external path lexically before any fixture/module/oracle IO.
const candidateSuffix = '/zig-out/verification/document-transforms-connect-r1/source';
const location = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const root = location.endsWith(candidateSuffix)
  ? location.slice(0, -candidateSuffix.length)
  : location;
const control = root + '/zig-out/verification/document-transforms-connect-r1/source';
const verification = root + '/zig-out/verification/source-table-grid-api-r1';
const forbidden = /hwpers|title-column-roundtrip|rhwp|decompil/i;
function lexical(value, name) {
  assert.equal(typeof value, 'string', name);
  assert(isAbsolute(value) && value === resolve(value) && !forbidden.test(value), name);
  assert(!value.includes('\0') && !value.includes('\\'), name);
  return value;
}
const required = (name) => lexical(process.env[name], name);
const source = required('HWPJS_TEST_SOURCE_ROOT');
assert([root, control].includes(source), 'UnexpectedSourceRoot');
const wasmPath = required('HWPJS_TEST_WASM');
assert.equal(wasmPath, verification + '/install/bin/hwpjs.wasm');
const oracleRoot = required('HWPJS_TEST_ORACLE_ROOT');
assert(
  oracleRoot === root || oracleRoot.startsWith(root + '/zig-out/verification/'),
  'UnexpectedOracleRoot',
);
const evidence = required('HWPJS_TEST_EVIDENCE_DIR');
assert.equal(dirname(evidence), verification);
assert.match(evidence.slice(verification.length + 1), /^host-[a-z0-9-]+$/u);
const fixtures = [
  ['hwp5', 'hwp', 'HWPJS_TEST_SOURCE_GRID_HWP5'],
  ['hwpx', 'hwpx', 'HWPJS_TEST_SOURCE_GRID_HWPX'],
].map(([format, extension, key]) => {
  const file = required(key);
  assert.equal(
    file,
    `${root}/zig-out/verification/created-table-ui-r1/browser-public-r1/vanilla-${format}.${extension}`,
    key,
  );
  return { format, extension, file };
});
for (const name of ['HWPJS_TEST_WASM_SHA256', 'HWPJS_TEST_CFB_SHA256'])
  assert.match(process.env[name] ?? '', /^[a-f0-9]{64}$/u, name);
assert.equal(
  process.env.HWPJS_TEST_CFB_SHA256,
  'd3162bbd248745eb17fd3ff9b3239e8a0f4480f466b55e4db79daecd8bf23479',
);
assert.equal(process.versions.node, '24.20.0', 'Use the actual Node 24.20.0 executable');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const file of [source, oracleRoot, wasmPath, ...fixtures.map((f) => f.file)])
  assert.equal(realpathSync(file), file, 'SymlinkOrNonCanonicalInput:' + file);
const entry = (relative) => {
  const file = join(source, relative);
  assert.equal(realpathSync(file), file, 'CandidateEntryEscaped');
  return file;
};
const cli = entry('packages/cli/src/bin.ts');
const server = entry('packages/cli/src/mcp-bin.ts');
const wasmSha256 = sha(readFileSync(wasmPath));
assert.equal(wasmSha256, process.env.HWPJS_TEST_WASM_SHA256);
const oracleFile = join(oracleRoot, 'legacy/cfb.js');
assert.equal(realpathSync(oracleFile), oracleFile);
assert.equal(sha(readFileSync(oracleFile)), process.env.HWPJS_TEST_CFB_SHA256);
assert.equal(realpathSync(dirname(evidence)), dirname(evidence));
mkdirSync(evidence); // exclusive, parent must already exist
const put = (name, value) => writeFileSync(join(evidence, name), value, { flag: 'wx' });
const json = (name, value) => put(name, JSON.stringify(value, null, 2) + '\n');
const { inspectCreatedGridArchive } = await import('../created-table-grid-oracle.mjs');
const require = createRequire(join(source, 'packages/cli/package.json'));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const { StdioClientTransport } = await import(
  pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio'))
);
const ledger = [];
for (const fixture of fixtures) {
  fixture.sha256 = sha(readFileSync(fixture.file));
  fixture.before = inspectCreatedGridArchive(readFileSync(fixture.file), fixture.format);
  assert.equal(fixture.before.tables.length, 1);
  assert.equal(fixture.before.tables[0].rows, 2);
  assert.equal(fixture.before.tables[0].columns, 2);
  if (fixture.format === 'hwp5') {
    const lists = fixture.before.tables[0].raw.filter(([tag]) => tag === 72);
    assert.equal(lists.length, 4);
    assert(
      lists.every(([, , hex]) => hex.length === 68),
      'FixtureRequiresObserved8',
    );
  }
}
json('inputs.json', {
  node: process.version,
  executable: process.execPath,
  source,
  cli,
  server,
  wasmPath,
  wasmSha256,
  oracleFile,
  oracleSha256: sha(readFileSync(oracleFile)),
  fixtures: fixtures.map(({ file, format, sha256 }) => ({ file, format, sha256 })),
});

function run(label, args) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=512', cli, ...args], {
    cwd: evidence,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, TMPDIR: evidence },
  });
  json(label + '.json', {
    args,
    status: result.status,
    signal: result.signal,
    error: result.error?.message,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
const referencePattern = /hwpjs-object:[a-f0-9]{64}\/(?:hwp5|hwpx)\/s\d+\/table\/\d+/gu;
function observe(f, input, label, rows = 2, columns = 2) {
  const result = run(label, ['read', input, '--format', 'markdown', '--wasm', wasmPath]);
  assert.equal(result.status, 0, result.stderr);
  const references = [...new Set(result.stdout.match(referencePattern))];
  assert.equal(references.length, 1, result.stdout);
  assert(references[0].startsWith(`hwpjs-object:${sha(readFileSync(input))}/${f.format}/`));
  // Markdown structure escapes punctuation; content links expose the real reference target.
  const structure = run(label + '-structure', [
    'read',
    input,
    '--format',
    'text',
    '--view',
    'structure',
    '--wasm',
    wasmPath,
  ]);
  assert.equal(structure.status, 0, structure.stderr);
  assert.match(structure.stdout, new RegExp(`rows=${rows} columns=${columns}(?:\\D|$)`, 'u'));
  return references[0];
}
function reference(f) {
  return (f.reference ??= observe(f, f.file, f.format + '-source-read'));
}
const operations = [
  { action: 'insert-row', index: 1, rows: 3, columns: 2 },
  { action: 'delete-row', index: 0, rows: 1, columns: 2 },
  { action: 'insert-column', index: 1, rows: 2, columns: 3 },
  { action: 'delete-column', index: 0, rows: 2, columns: 1 },
];
const outputPath = (f, label) => join(evidence, `${label}.${f.extension}`);
function cliArgs(f, output, operation, patch = {}) {
  const options = {
    ref: reference(f),
    action: operation.action,
    index: operation.index,
    rows: 2,
    columns: 2,
    output,
    ...(f.format === 'hwp5' ? { layout: 'observed8' } : {}),
    ...patch,
  };
  return [
    'edit-table-grid',
    ...Object.entries(options).map(([k, v]) => `--${k}=${v}`),
    '--allow-stale-layout',
    '--wasm',
    wasmPath,
    '--',
    f.file,
  ];
}
function verify(f, output, operation, label) {
  const bytes = readFileSync(output);
  const after = inspectCreatedGridArchive(bytes, f.format);
  assert.equal(after.tables.length, 1);
  const table = after.tables[0];
  assert.equal(table.rows, operation.rows);
  assert.equal(table.columns, operation.columns);
  assert.equal(table.instance, f.before.tables[0].instance);
  assert.equal(table.cells.length, operation.rows * operation.columns);
  assert.equal(new Set(table.cells.map((c) => c.paragraphId)).size, table.cells.length);
  const oldIds = new Set(f.before.tables[0].cells.map((c) => c.paragraphId));
  const insert = operation.action.startsWith('insert-');
  const rowEdit = operation.action.endsWith('row');
  for (const [i, cell] of table.cells.entries()) {
    assert.equal(cell.row, Math.floor(i / operation.columns));
    assert.equal(cell.column, i % operation.columns);
    assert.equal(cell.rowSpan, 1);
    assert.equal(cell.columnSpan, 1);
    assert(cell.width > 0 && cell.height > 0);
    const coordinate = rowEdit ? cell.row : cell.column;
    if (insert && coordinate === operation.index) {
      assert(!oldIds.has(cell.paragraphId));
      assert.equal(cell.text, '');
    } else {
      const previous = insert
        ? coordinate - Number(coordinate > operation.index)
        : coordinate + Number(coordinate >= operation.index);
      const oldRow = rowEdit ? previous : cell.row;
      const oldColumn = rowEdit ? cell.column : previous;
      const prior = f.before.tables[0].cells[oldRow * 2 + oldColumn];
      for (const key of ['paragraphId', 'text', 'width', 'height', 'rowSpan', 'columnSpan'])
        assert.deepEqual(cell[key], prior[key], key);
    }
  }
  assert.deepEqual(Object.keys(after.streams).sort(), Object.keys(f.before.streams).sort());
  const edited = f.format === 'hwp5' ? 'BodyText/Section0' : 'Contents/section0.xml';
  for (const [name, hash] of Object.entries(f.before.streams))
    if (name !== edited) assert.equal(after.streams[name], hash, name);
  const fresh = observe(f, output, label + '-reopen', operation.rows, operation.columns);
  assert.notEqual(fresh, reference(f));
  json(label + '-oracle.json', after);
  ledger.push({ label, output, sha256: sha(bytes), reference: fresh, operation });
  assert.equal(sha(readFileSync(f.file)), f.sha256);
}
const absent = (file) => assert.throws(() => lstatSync(file), { code: 'ENOENT' });
function rejectedCli(label, args, output, pattern) {
  const result = run(label, args);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, pattern);
  absent(output);
}

test('input path gate rejects protected, relative and noncanonical paths without IO', () => {
  for (const value of [
    undefined,
    'relative.hwp',
    root + '/../x',
    root + '//x',
    root + '/./x',
    root + '/hwpers/input.hwp',
    root + '/title-column-roundtrip.test.mjs',
  ])
    assert.throws(() => lexical(value, 'probe'));
});
for (const f of fixtures) {
  for (const op of operations)
    test(`${f.format} actual CLI ${op.action}, persisted oracle and reopen`, () => {
      const label = `cli-${f.format}-${op.action}`;
      const output = outputPath(f, label);
      const result = run(label, cliArgs(f, output, op));
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /layoutRequiresReflow: true/u);
      assert.match(result.stdout, /previewStale: true/u);
      assert(result.stdout.includes('sourceSHA256: ' + f.sha256));
      verify(f, output, op, label);
    });
  test(`${f.format} actual CLI refuses stale reference, missing consent and unknown action without output`, () => {
    const op = operations[0];
    const cases = [
      [
        'stale-sha',
        { ref: reference(f).replace(f.sha256, '0'.repeat(64)) },
        /StaleObjectReference/u,
      ],
      ['unknown-action', { action: 'rotate-table' }, /InvalidTableGridAction/u],
      ['missing-consent', {}, /LayoutRequiresReflow/u],
    ];
    for (const [kind, patch, pattern] of cases) {
      const label = `cli-${f.format}-${kind}`;
      const output = outputPath(f, label);
      let args = cliArgs(f, output, op, patch);
      if (kind === 'missing-consent') args = args.filter((s) => s !== '--allow-stale-layout');
      rejectedCli(label, args, output, pattern);
    }
    const existing = outputPath(f, `cli-${f.format}-insert-row`);
    const originalHash = sha(readFileSync(existing));
    const denied = run(`cli-${f.format}-old-reference-existing`, [
      ...cliArgs(f, existing, operations[1], { rows: 3 }).slice(0, -1),
      existing,
    ]);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /StaleObjectReference/u);
    assert.equal(sha(readFileSync(existing)), originalHash);
    const output = outputPath(f, `cli-${f.format}-old-reference-new`);
    rejectedCli(
      `cli-${f.format}-old-reference-new`,
      [...cliArgs(f, output, operations[1], { rows: 3 }).slice(0, -1), existing],
      output,
      /StaleObjectReference/u,
    );
    assert.equal(sha(readFileSync(existing)), originalHash);
  });
}

let client, transport, connecting, pid;
let mcpStderr = '';
async function mcp() {
  if (!connecting)
    connecting = (async () => {
      transport = new StdioClientTransport({
        command: process.execPath,
        args: ['--max-old-space-size=512', server, '--wasm', wasmPath],
        cwd: evidence,
        stderr: 'pipe',
        env: { ...process.env, TMPDIR: evidence },
      });
      transport.stderr?.on('data', (b) => {
        mcpStderr += b.toString();
      });
      client = new Client({ name: 'source-table-grid-native-host', version: '1.0.0' });
      await client.connect(transport);
      pid = transport.pid;
      return client;
    })();
  return connecting;
}
const content = (reply) =>
  reply.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
async function call(label, arguments_) {
  const reply = await (
    await mcp()
  ).callTool({ name: 'edit_document_table_grid', arguments: arguments_ });
  json(label + '.json', reply);
  return reply;
}
function mcpArgs(f, output, op) {
  return {
    inputPath: f.file,
    outputPath: output,
    reference: reference(f),
    action: op.action,
    index: op.index,
    expectedRows: 2,
    expectedColumns: 2,
    allowStaleLayout: true,
    ...(f.format === 'hwp5' ? { layout: 'observed8' } : {}),
  };
}
test('official MCP stdio exposes exactly 20 tools and a closed grid action schema', async () => {
  const listed = await (await mcp()).listTools();
  json('mcp-tools.json', listed);
  assert.deepEqual(listed.tools.map((t) => t.name).sort(), [
    'apply_document_changes',
    'close_document_session',
    'convert_document',
    'create_document',
    'delete_document_table',
    'edit_document',
    'edit_document_table_grid',
    'export_document_html',
    'extract_document_image',
    'get_document_info',
    'get_document_object',
    'get_document_paragraph',
    'insert_document_image',
    'list_document_images',
    'ocr_document',
    'open_document_session',
    'read_document',
    'read_document_session',
    'read_documents',
    'replace_document_image',
  ]);
  const schema = listed.tools.find((t) => t.name === 'edit_document_table_grid').inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    schema.properties.action.enum,
    operations.map((op) => op.action),
  );
  assert.equal(schema.properties.allowStaleLayout.default, false);
});
for (const f of fixtures) {
  for (const op of operations)
    test(`${f.format} actual MCP ${op.action}, persisted oracle and CLI reopen`, async () => {
      const label = `mcp-${f.format}-${op.action}`;
      const output = outputPath(f, label);
      const reply = await call(label, mcpArgs(f, output, op));
      assert.notEqual(reply.isError, true, content(reply));
      assert.match(content(reply), /layoutRequiresReflow: true/u);
      assert.match(content(reply), /previewStale: true/u);
      verify(f, output, op, label);
    });
  test(`${f.format} actual MCP refuses unknown action, schema extras, consent and old references atomically`, async () => {
    for (const [kind, patch, pattern] of [
      ['unknown-action', { action: 'rotate-table' }, /action|Invalid|enum/iu],
      ['schema-extra', { unexpected: true }, /unexpected|unrecognized|Invalid/iu],
      ['missing-consent', { allowStaleLayout: undefined }, /LayoutRequiresReflow/u],
      [
        'stale-sha',
        { reference: reference(f).replace(f.sha256, '0'.repeat(64)) },
        /StaleObjectReference/u,
      ],
    ]) {
      const label = `mcp-${f.format}-${kind}`;
      const output = outputPath(f, label);
      const reply = await call(label, { ...mcpArgs(f, output, operations[0]), ...patch });
      assert.equal(reply.isError, true, content(reply));
      assert.match(content(reply), pattern);
      absent(output);
    }
    const existing = outputPath(f, `mcp-${f.format}-insert-row`);
    const originalHash = sha(readFileSync(existing));
    for (const [suffix, output] of [
      ['new', outputPath(f, `mcp-${f.format}-old-reference-new`)],
      ['existing', existing],
    ]) {
      const reply = await call(`mcp-${f.format}-old-reference-${suffix}`, {
        ...mcpArgs(f, output, operations[1]),
        inputPath: existing,
        expectedRows: 3,
      });
      assert.equal(reply.isError, true);
      assert.match(content(reply), /StaleObjectReference/u);
      if (suffix === 'new') absent(output);
      assert.equal(sha(readFileSync(existing)), originalHash);
    }
  });
}
after(async () => {
  try {
    await client?.close();
  } finally {
    await transport?.close();
    put('mcp-stderr.log', mcpStderr);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(sha(readFileSync(wasmPath)), wasmSha256);
    for (const f of fixtures) assert.equal(sha(readFileSync(f.file)), f.sha256);
    json('results.json', {
      verifiedOutputs: ledger.length,
      outputs: ledger,
      mcpPid: pid,
      transportClosed: true,
    });
  }
});
