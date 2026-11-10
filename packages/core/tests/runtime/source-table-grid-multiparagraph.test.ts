import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createEditor, EDIT_SOURCE_TABLE_GRID_COMMAND } from '../../src/index.ts';
import type { SourceTableGridAction } from '../../src/commands/source-table-grid.ts';
import { createReaderRuntimeFactory, createWorkerRuntimeFactory } from '../../src/runtime.ts';
// @ts-ignore Test-only independent CFB/ZIP/XML inspection.
import {
  h5Inspect,
  hxInspect,
  assertGridTransition,
} from '../../../../tools/tests/source-table-grid-multiparagraph-oracle.mjs';

const root = process.env.HWPJS_TEST_SOURCE_ROOT;
if (typeof root !== 'string') throw Error('ExplicitSourceRootRequired');
assert(root.endsWith('/zig-out/verification/document-transforms-connect-r1/source'));
const workspace = root.slice(0, root.indexOf('/zig-out/verification/'));
const evidence = join(workspace, 'zig-out/verification/source-grid-multipara-r1');
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function guard(path: string | undefined): asserts path is string {
  assert(path && isAbsolute(path) && resolve(path) === path && !path.includes('//'));
  assert(!/hwpers|title-column-roundtrip|(?:^|\/)rhwp(?:\/|$)/iu.test(path));
  assert(![...path].some((c) => c.charCodeAt(0) < 32));
  assert(path.startsWith(workspace + '/'));
}
const wasmPath = process.env.HWPJS_TEST_WASM;
const wasmHash = process.env.HWPJS_TEST_WASM_SHA256;
const manifestPath = join(evidence, 'task-d/old-refusal-final/seeds.json');
const cfbPath = join(workspace, 'legacy/cfb.js');
[root, wasmPath, manifestPath, cfbPath].forEach(guard);
assert(/^[a-f0-9]{64}$/u.test(wasmHash ?? ''));
assert.notEqual(wasmHash, '28d2f91917e81d0522ffe04d6ddff150aee2ad815a9ed1ed6d470af905aaacca');
function read(path: string | undefined) {
  guard(path);
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join(current, part);
    assert(!lstatSync(current).isSymbolicLink());
  }
  assert(lstatSync(path).isFile());
  return readFileSync(path);
}
const binary = read(wasmPath);
assert.equal(hash(binary), wasmHash);
const module = await WebAssembly.compile(binary);
const cfbSource = read(cfbPath);
assert.equal(hash(cfbSource), 'd3162bbd248745eb17fd3ff9b3239e8a0f4480f466b55e4db79daecd8bf23479');
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(cfbSource.toString(), context);
const seeds = JSON.parse(read(manifestPath).toString()).filter((s: any) =>
  ['hwp5-observed', 'hwp5-empty', 'hwpx-plain'].includes(s.label),
);
assert.equal(seeds.length, 3);
for (const seed of seeds) {
  guard(seed.path);
  assert.equal(
    seed.path,
    join(evidence, 'task-d/old-refusal-final', `${seed.label}-source.${seed.ext}`),
  );
  assert(/^[a-f0-9]{64}$/u.test(seed.sha256));
}
for (const seed of seeds) {
  const input = read(seed.path);
  assert.equal(hash(input), seed.sha256);
  const inspect = (bytes: Uint8Array): any =>
    seed.format === 'hwp5'
      ? h5Inspect(context.module.exports, Buffer.from(bytes))
      : hxInspect(Buffer.from(bytes));
  for (const transport of ['reader', 'worker'] as const) {
    test(`${seed.label} ${transport}: every paragraph projection, four source edits, history and reopen`, async () => {
      const runtimeFactory =
        transport === 'reader'
          ? createReaderRuntimeFactory({ wasmModule: module })
          : createWorkerRuntimeFactory({
              wasmModule: module,
              workerFactory: () =>
                new Worker(new URL('../../src/worker.ts', import.meta.url), { type: 'module' }),
            });
      const editor = createEditor({ runtimeFactory });
      const reopened = createEditor({ runtimeFactory });
      const content = () => editor.getEditorState().content as any;
      const save = async () => (await editor.save({ allowStaleLayout: true })).bytes;
      function projection(model: any, archive: any) {
        assert.equal(model.limited, false);
        const table = model.tables[seed.targetIndex],
          expected = archive.tables[seed.targetIndex];
        assert.equal(table.rows, expected.rows);
        assert.equal(table.columns, expected.columns);
        const paragraphs = new Map(
          model.paragraphs.map((p: any) => [`${p.section}:${p.paragraph}`, p]),
        );
        const cells = new Map(table.cells.map((c: any) => [`${c.row}:${c.column}`, c]));
        for (const cell of expected.cells) {
          const actual = cells.get(`${cell.row}:${cell.column}`) as any;
          assert(actual);
          assert.equal(actual.paragraphs.length, cell.paragraphs.length);
          assert.deepEqual(
            actual.paragraphs.map((id: number) => {
              const p = paragraphs.get(`${table.section}:${id}`) as any;
              assert(
                p &&
                  p.tableCell?.tableNode === table.tableNode &&
                  p.tableCell.listNode === actual.listNode,
              );
              return p.text.replace(/\r$/u, '');
            }),
            cell.paragraphs.map((p: any) => p.text),
          );
        }
      }
      try {
        await editor.load(input, { format: seed.format, editable: true });
        projection(content(), inspect(input));
        for (const action of [
          'insert-row',
          'delete-row',
          'insert-column',
          'delete-column',
        ] as SourceTableGridAction[]) {
          const before = await save(),
            view = inspect(before),
            table = content().tables[seed.targetIndex];
          const result = await editor.dispatchCommand(EDIT_SOURCE_TABLE_GRID_COMMAND, {
            section: table.section,
            tableNode: table.tableNode,
            expectedRows: table.rows,
            expectedColumns: table.columns,
            action,
            index: 1,
            layout: seed.format === 'hwp5' ? 'observed8' : 'spec6',
          });
          assert.equal(result.status, 'committed-with-snapshot', result.error);
          const after = await save(),
            next = inspect(after);
          assertGridTransition(view, next, {
            action,
            index: 1,
            format: seed.format,
            targetIndex: seed.targetIndex,
          });
          projection(content(), next);
          assert.equal((await editor.undo()).status, 'committed-with-snapshot');
          assert.deepEqual(await save(), before);
          projection(content(), view);
          assert.equal((await editor.redo()).status, 'committed-with-snapshot');
          assert.deepEqual(await save(), after);
          projection(content(), next);
          await reopened.load(after, { format: seed.format, editable: true });
          projection(reopened.getEditorState().content, next);
          assert.equal((await editor.undo()).status, 'committed-with-snapshot');
          assert.deepEqual(await save(), before);
        }
        assert.equal(hash(input), seed.sha256);
      } finally {
        await editor.dispose();
        await reopened.dispose();
      }
    });
  }
}
