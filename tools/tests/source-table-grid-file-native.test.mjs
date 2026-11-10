import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectCreatedGridArchive } from '../created-table-grid-oracle.mjs';

function required(name) {
  const value = process.env[name];
  assert(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), name);
  return value;
}
const source = realpathSync(required('HWPJS_TEST_SOURCE_ROOT'));
assert(source.includes('/zig-out/verification/'));
const wasm = readFileSync(required('HWPJS_TEST_WASM'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(wasm), process.env.HWPJS_TEST_WASM_SHA256);
const evidence = required('HWPJS_TEST_EVIDENCE_DIR');
mkdirSync(evidence);
const load = (path) => import(pathToFileURL(resolve(source, path)));
const { editDocumentTableGrid } = await load('packages/cli/src/edit-table-grid.ts');
const { openDocument } = await load('packages/cli/src/engine.ts');
const { readDocumentModel } = await load('packages/cli/src/document-model.ts');
const { createSourceTableGridFileApi } = await load('js/table-file-grid.mjs');
const fixtures = [
  ['hwp5', 'HWPJS_TEST_SOURCE_GRID_HWP5', 'hwp'],
  ['hwpx', 'HWPJS_TEST_SOURCE_GRID_HWPX', 'hwpx'],
].map(([format, key, extension]) => {
  const path = required(key);
  assert(path.endsWith(`/created-table-ui-r1/browser-public-r1/vanilla-${format}.${extension}`));
  return { format, extension, bytes: readFileSync(path) };
});
async function selection(bytes) {
  const doc = await openDocument({ bytes, wasm, expectedSha256: sha(bytes) });
  try {
    const model = await readDocumentModel(doc);
    const stack = model.sections.flatMap((section) => section.body);
    const tables = [];
    while (stack.length) {
      const block = stack.pop();
      if (block.type === 'table') {
        tables.push(block);
        for (const cell of block.cells) stack.push(...cell.blocks);
      }
    }
    assert.equal(tables.length, 1);
    assert(tables[0].reference);
    return tables[0];
  } finally {
    await doc.close();
  }
}
const operations = [
  { action: 'insert-row', index: 1, rows: 3, columns: 2 },
  { action: 'delete-row', index: 0, rows: 1, columns: 2 },
  { action: 'insert-column', index: 1, rows: 2, columns: 3 },
  { action: 'delete-column', index: 0, rows: 2, columns: 1 },
];
for (const fixture of fixtures) {
  for (const operation of operations) {
    test(`${fixture.format} saved source ${operation.action}: independent grid, survivors and unrelated payloads`, async () => {
      const original = Buffer.from(fixture.bytes);
      const before = inspectCreatedGridArchive(original, fixture.format);
      const target = await selection(original);
      const output = await editDocumentTableGrid({
        bytes: original,
        wasm,
        reference: target.reference,
        action: operation.action,
        index: operation.index,
        expectedRows: 2,
        expectedColumns: 2,
        layout: fixture.format === 'hwp5' ? 'observed8' : 'spec6',
      });
      assert.equal(output.format, fixture.format);
      assert.equal(output.sourceSha256, sha(original));
      assert.equal(output.layoutRequiresReflow, true);
      assert.equal(output.previewStale, true);
      assert.deepEqual(original, fixture.bytes);
      const after = inspectCreatedGridArchive(output.bytes, fixture.format);
      assert.equal(after.tables.length, 1);
      const table = after.tables[0];
      assert.equal(table.rows, operation.rows);
      assert.equal(table.columns, operation.columns);
      assert.equal(table.cells.length, operation.rows * operation.columns);
      assert.equal(new Set(table.cells.map((cell) => cell.paragraphId)).size, table.cells.length);
      const oldIds = new Set(before.tables[0].cells.map((cell) => cell.paragraphId));
      const inserted = operation.action.startsWith('insert-');
      const rowEdit = operation.action.endsWith('row');
      for (const cell of table.cells) {
        const coordinate = rowEdit ? cell.row : cell.column;
        if (inserted && coordinate === operation.index) {
          assert(!oldIds.has(cell.paragraphId));
          assert.equal(cell.text, '');
          continue;
        }
        const oldCoordinate = inserted
          ? coordinate - Number(coordinate > operation.index)
          : coordinate + Number(coordinate >= operation.index);
        const oldRow = rowEdit ? oldCoordinate : cell.row;
        const oldColumn = rowEdit ? cell.column : oldCoordinate;
        const prior = before.tables[0].cells[oldRow * 2 + oldColumn];
        for (const key of ['paragraphId', 'text', 'width', 'height', 'rowSpan', 'columnSpan'])
          assert.deepEqual(cell[key], prior[key], key);
      }
      const targetPath = fixture.format === 'hwp5' ? 'BodyText/Section0' : 'Contents/section0.xml';
      assert.deepEqual(Object.keys(after.streams).sort(), Object.keys(before.streams).sort());
      for (const [path, digest] of Object.entries(before.streams))
        if (path !== targetPath) assert.equal(after.streams[path], digest, path);
      const reopened = await selection(output.bytes);
      assert.equal(reopened.rows, operation.rows);
      assert.equal(reopened.columns, operation.columns);
      writeFileSync(
        join(evidence, `${fixture.format}-${operation.action}.${fixture.extension}`),
        output.bytes,
      );
    });
  }
  test(`${fixture.format} source reference expires after save and fresh observation enables inverse edit`, async () => {
    const target = await selection(fixture.bytes);
    const first = await editDocumentTableGrid({
      bytes: fixture.bytes,
      wasm,
      reference: target.reference,
      action: 'insert-row',
      index: 1,
      expectedRows: 2,
      expectedColumns: 2,
      layout: fixture.format === 'hwp5' ? 'observed8' : 'spec6',
    });
    await assert.rejects(
      editDocumentTableGrid({
        bytes: first.bytes,
        wasm,
        reference: target.reference,
        action: 'delete-row',
        index: 1,
        expectedRows: 3,
        expectedColumns: 2,
        layout: fixture.format === 'hwp5' ? 'observed8' : 'spec6',
      }),
    );
    const current = await selection(first.bytes);
    const second = await editDocumentTableGrid({
      bytes: first.bytes,
      wasm,
      reference: current.reference,
      action: 'delete-row',
      index: 1,
      expectedRows: 3,
      expectedColumns: 2,
      layout: fixture.format === 'hwp5' ? 'observed8' : 'spec6',
    });
    assert.deepEqual(
      inspectCreatedGridArchive(second.bytes, fixture.format).tables[0].cells,
      inspectCreatedGridArchive(fixture.bytes, fixture.format).tables[0].cells,
    );
  });
}
test('actual older engine refuses optional source grid ABI before editing', async () => {
  const old = readFileSync(required('HWPJS_TEST_OLD_WASM'));
  await assert.rejects(createSourceTableGridFileApi(old), /TableFileGridAbiUnavailable/);
});
