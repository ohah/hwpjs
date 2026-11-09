import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentOperations,
  validateDocumentOperations,
  DOCUMENT_OPERATION_SPECS,
} from '../src/document-operations.ts';

const SHA = 'a'.repeat(64);
const actions = ['insert-row', 'delete-row', 'insert-column', 'delete-column'];
const op = (extra = {}) => ({
  kind: 'created-table-grid',
  coordinates: 'current-transaction',
  section: 0,
  identity: '18446744073709551615',
  action: 'insert-row',
  index: 0,
  ...extra,
});
function harness(format = 'hwp5', overrides = {}) {
  const calls = [];
  const sdk = {
    supportsCreatedTableGrid: () => true,
    editCreatedTableGrid: (request) => {
      calls.push(['grid', request]);
    },
    insertTable: () => {
      calls.push(['insert']);
      return '7';
    },
    ...overrides,
  };
  const apply = (operations, options = {}) =>
    applyDocumentOperations(
      {
        bytes: new Uint8Array([1]),
        wasm: new Uint8Array([2]),
        expectedSha256: SHA,
        operations,
      },
      {
        openDocument: async () => {
          calls.push(['open']);
          await options.beforeOpen?.();
          return {
            format,
            sdk,
            sectionCount: 1,
            sourceSha256: options.sha ?? SHA,
            save() {
              calls.push(['save']);
              const bytes = new Uint8Array([3]);
              return format === 'hwp5' ? { bytes, layoutRequiresReflow: true } : bytes;
            },
            close() {
              calls.push(['close']);
            },
          };
        },
      },
    );
  return { calls, apply };
}
const insert = () => ({
  kind: 'table-insert',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 1,
  unit: 0,
  rows: 2,
  columns: 2,
  width: 20000,
  rowHeight: 3000,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 1 },
});

test('generic apply spec binds the four fields and transaction coordinates', () => {
  assert.deepEqual(DOCUMENT_OPERATION_SPECS['created-table-grid'], {
    required: ['kind', 'coordinates', 'section', 'identity', 'action', 'index'],
    optional: [],
  });
  for (const name of DOCUMENT_OPERATION_SPECS['created-table-grid'].required) {
    const input = op();
    delete input[name];
    assert.throws(() => validateDocumentOperations([input]));
  }
  assert.throws(() => validateDocumentOperations([op({ coordinates: 'original' })]));
});

test('invalid u64/u32/action/unknown/accessor inputs reject the whole batch before opening', async () => {
  const h = harness();
  const malformed = [
    ...['0', '01', '-1', '1\n', '18446744073709551616', 1].map((identity) => op({ identity })),
    ...['section', 'index'].flatMap((key) =>
      [-0, -1, 1.1, 0x100000000, '0', Infinity].map((value) => op({ [key]: value })),
    ),
    op({ action: 'insert_row' }),
    op({ action: 'constructor' }),
    op({ extra: 1 }),
    op({
      toJSON() {
        throw new Error('hook');
      },
    }),
  ];
  let reads = 0;
  const accessor = op();
  Object.defineProperty(accessor, 'identity', {
    enumerable: true,
    get() {
      reads++;
      return '1';
    },
  });
  malformed.push(accessor, Object.create(op()));
  for (const input of malformed) await assert.rejects(h.apply([op(), input]));
  assert.equal(reads, 0);
  assert.deepEqual(h.calls, []);
});

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: four actions bind only SDK data fields and save once`, async () => {
    const h = harness(format);
    const input = actions.map((action, index) => op({ action, index }));
    const result = await h.apply(input, {
      beforeOpen: () => {
        input[0].identity = '1';
      },
    });
    assert.deepEqual(
      h.calls.filter(([kind]) => kind === 'grid').map(([, value]) => value),
      actions.map((action, index) => ({ section: 0, identity: op().identity, action, index })),
    );
    assert.equal(result.appliedOperations, 4);
    assert.deepEqual(result.operationResults, []);
    assert.equal(h.calls.filter(([kind]) => kind === 'save').length, 1);
    assert.equal(h.calls.at(-1)[0], 'close');
  });
  test(`${format}: known inserted identity can be targeted in sequence`, async () => {
    const h = harness(format);
    const result = await h.apply([insert(), op({ identity: '7' })]);
    assert.deepEqual(
      h.calls.map(([kind]) => kind),
      ['open', 'insert', 'grid', 'save', 'close'],
    );
    assert.equal(h.calls[2][1].identity, '7');
    assert.deepEqual(result.operationResults, [
      { operation: 0, kind: 'table-insert', identity: '7' },
    ]);
  });
  test(`${format}: unavailable capability rejects before preceding insert`, async () => {
    for (const supportsCreatedTableGrid of [undefined, () => false]) {
      const h = harness(format, { supportsCreatedTableGrid });
      await assert.rejects(h.apply([insert(), op()]), /CreatedTableGridAbiUnavailable/);
      assert.deepEqual(h.calls, [['open'], ['close']]);
    }
  });
  test(`${format}: late Native failure discards session without save or returned bytes`, async () => {
    let edits = 0;
    const h = harness(format, {
      editCreatedTableGrid() {
        if (++edits === 2) throw new Error('SyntheticGridFailure');
      },
    });
    await assert.rejects(h.apply([op(), op({ action: 'delete-column' })]), /SyntheticGridFailure/);
    assert.equal(edits, 2);
    assert.deepEqual(h.calls, [['open'], ['close']]);
  });
  test(`${format}: source SHA mismatch and section bounds reject before mutations`, async () => {
    const sha = harness(format);
    await assert.rejects(sha.apply([op()], { sha: 'b'.repeat(64) }), /SourceSha256Mismatch/);
    assert.deepEqual(sha.calls, [['open'], ['close']]);
    const target = harness(format);
    await assert.rejects(target.apply([insert(), op({ section: 1 })]), /InvalidOperationTarget/);
    assert.deepEqual(target.calls, [['open'], ['close']]);
  });
}

test('existing MCP generic apply schema accepts the new operation and rejects bad identity', async () => {
  const { documentTools } = await import('../src/mcp/tools.ts');
  const { parseArguments } = await import('../src/arguments.ts');
  const calls = [];
  const tool = documentTools({
    executeCLI: async (argv) => {
      calls.push(parseArguments(argv));
      return 0;
    },
  }).find(({ name }) => name === 'apply_document_changes');
  const input = {
    inputPath: 'input.hwp',
    outputPath: 'output.hwp',
    expectedSha256: SHA,
    operations: actions.map((action) => op({ action })),
  };
  assert.equal(tool.config.inputSchema.safeParse(input).success, true);
  for (const identity of ['01', '0', '18446744073709551616', 7])
    assert.equal(
      tool.config.inputSchema.safeParse({ ...input, operations: [op({ identity })] }).success,
      false,
    );
  await tool.invoke(input);
  assert.equal(calls[0].command, 'apply');
  assert.deepEqual(JSON.parse(calls[0].inlineOperations), input.operations);
});

test('CLI host keeps original and publishes no output after late grid failure or bad input', async (t) => {
  const fs = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createFiles } = await import('../src/files.ts');
  const { runCLI } = await import('../src/main.ts');
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'hwpjs-created-grid-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1]);
  await fs.writeFile(join(directory, 'input.hwp'), source);
  await fs.writeFile(join(directory, 'native.wasm'), new Uint8Array([1]));
  const files = createFiles({ cwd: () => directory });
  const { sha256 } = await files.readInputSnapshot('input.hwp');
  let opened = 0,
    edited = 0,
    saved = 0,
    closed = 0;
  const stderr = [];
  const dependencies = {
    files,
    io: { stdout: { write() {} }, stderr: { write: (text) => stderr.push(text) } },
    operationService: {
      validateDocumentOperations,
      applyDocumentOperations: (input) =>
        applyDocumentOperations(input, {
          openDocument: async () => {
            opened++;
            return {
              format: 'hwp5',
              sectionCount: 1,
              sourceSha256: sha256,
              sdk: {
                supportsCreatedTableGrid: () => true,
                editCreatedTableGrid() {
                  if (++edited === 2) throw new Error('SyntheticLateGridFailure');
                },
              },
              save() {
                saved++;
                throw new Error('MustNotSave');
              },
              close() {
                closed++;
              },
            };
          },
        }),
    },
  };
  const invoke = (operations, expectedSha256 = sha256) =>
    runCLI(
      [
        'apply',
        'input.hwp',
        '--operations=' + JSON.stringify(operations),
        '--expect-sha256=' + expectedSha256,
        '--output=output.hwp',
        '--wasm=native.wasm',
        '--allow-stale-layout',
      ],
      dependencies,
    );
  assert.equal(await invoke([op(), op({ identity: '01' })]), 1);
  assert.equal(opened, 0);
  assert.equal(await invoke([op()], '0'.repeat(64)), 1);
  assert.equal(opened, 0);
  assert.equal(await invoke([op(), op({ action: 'delete-column' })]), 1);
  assert.match(stderr.join(''), /SyntheticLateGridFailure/);
  assert.equal(opened, 1);
  assert.equal(edited, 2);
  assert.equal(saved, 0);
  assert.equal(closed, 1);
  await assert.rejects(fs.lstat(join(directory, 'output.hwp')), { code: 'ENOENT' });
  assert.deepEqual(new Uint8Array(await fs.readFile(join(directory, 'input.hwp'))), source);
});
