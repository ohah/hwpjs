import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { editDocumentTableGrid } from '../../packages/cli/src/edit-table-grid.ts';
import { openDocument } from '../../packages/cli/src/engine.ts';
import { readDocumentModel } from '../../packages/cli/src/document-model.ts';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const required = (name) => {
  const value = process.env[name];
  assert(
    typeof value === 'string' &&
      isAbsolute(value) &&
      !value.includes('..') &&
      !/hwpers|title-column-roundtrip/i.test(value),
    name,
  );
  return value;
};
const paths = Object.fromEntries(
  ['HWPJS_TEST_WASM', 'HWPJS_TEST_NOORI', 'HWPJS_TEST_NOORI_HWPX', 'HWPJS_NOORI_ROW_EVIDENCE'].map(
    (name) => [name, required(name)],
  ),
);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const wasm = readFileSync(paths.HWPJS_TEST_WASM);
assert.equal(sha(wasm), process.env.HWPJS_TEST_WASM_SHA256);
const evidence = paths.HWPJS_NOORI_ROW_EVIDENCE;
mkdirSync(evidence);
const fixtures = [
  [
    'hwp5',
    paths.HWPJS_TEST_NOORI,
    'hwp',
    'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
  ],
  [
    'hwpx',
    paths.HWPJS_TEST_NOORI_HWPX,
    'hwpx',
    '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab',
  ],
].map(([format, path, ext, pin]) => {
  const bytes = readFileSync(path);
  assert.equal(sha(bytes), pin);
  return { format, path, ext, pin, bytes };
});
async function firstTable(bytes) {
  const doc = await openDocument({ bytes, wasm, expectedSha256: sha(bytes) });
  try {
    const model = await readDocumentModel(doc),
      stack = model.sections.flatMap((s) => s.body).reverse();
    while (stack.length) {
      const block = stack.pop();
      if (block.type === 'table') return block;
    }
    throw Error('NooriTableUnavailable');
  } finally {
    await doc.close();
  }
}
function python(args) {
  return spawnSync('python3', ['-B', ...args], { encoding: 'utf8', timeout: 30000 });
}
for (const fixture of fixtures)
  test(
    fixture.format +
      ': original Noori row insert and nonempty row delete preserve independent source and reopen',
    async () => {
      const table = await firstTable(fixture.bytes);
      assert(table.reference);
      for (const action of ['insert-row', 'delete-row']) {
        const output = await editDocumentTableGrid({
          bytes: fixture.bytes,
          wasm,
          reference: table.reference,
          action,
          index: 1,
          expectedRows: 3,
          expectedColumns: 4,
          layout: fixture.format === 'hwp5' ? 'observed8' : 'spec6',
        });
        assert.equal(output.sourceSha256, fixture.pin);
        assert.equal(output.layoutRequiresReflow, true);
        assert.equal(output.previewStale, true);
        const after = join(evidence, fixture.format + '-' + action + '.' + fixture.ext);
        writeFileSync(after, output.bytes);
        const oracle = resolve(
          root,
          'tests/helpers',
          action === 'insert-row' ? 'noori-row-insert-oracle.py' : 'noori-row-delete-oracle.py',
        );
        for (const flags of [[], ['-O']]) {
          const extra = action === 'insert-row' ? ['insert'] : [];
          const result = python([...flags, oracle, fixture.ext, fixture.path, after, ...extra]);
          assert.equal(result.status, 0, result.stderr);
          const wrong = python([
            ...flags,
            oracle,
            fixture.ext,
            fixture.path,
            fixture.path,
            ...extra,
          ]);
          assert.notEqual(wrong.status, 0, 'Independent oracle must reject unedited input');
        }
        if (fixture.format === 'hwpx') {
          const quoteVariant = after + '.quote.hwpx';
          const authored = python([
            '-c',
            `import sys,zipfile,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as source:
 raw=source.read('Contents/section0.xml');old=b'styleIDRef="0"';new=b"styleIDRef='0'"
 if raw.find(old)<0 or raw.find(old)>=raw.find(b'<hp:tbl'):raise ValueError('ExpectedSurvivorBeforeTable')
 changed=raw.replace(old,new,1)
 if E.tostring(E.fromstring(raw))!=E.tostring(E.fromstring(changed)):raise ValueError('ExpectedSemanticEquality')
 with zipfile.ZipFile(sys.argv[2],'w') as output:
  for entry in source.infolist():output.writestr(entry,changed if entry.filename=='Contents/section0.xml' else source.read(entry.filename))`,
            after,
            quoteVariant,
          ]);
          assert.equal(authored.status, 0, authored.stderr);
          for (const flags of [[], ['-O']]) {
            const extra = action === 'insert-row' ? ['insert'] : [];
            const refused = python([
              ...flags,
              oracle,
              fixture.ext,
              fixture.path,
              quoteVariant,
              ...extra,
            ]);
            assert.notEqual(refused.status, 0);
            assert.match(refused.stderr, /whole raw XML survivor\/source preservation/);
          }
        }
        assert((await firstTable(output.bytes)).reference);
        assert.deepEqual(fixture.bytes, readFileSync(fixture.path));
      }
    },
  );
test('HWPX opaque foreign cache rejects whole transaction without source/history mutation', async () => {
  const before = join(evidence, 'foreign-cache.hwpx');
  const authored = python([
    resolve(root, 'tests/helpers/noori-foreign-cache-fixture.py'),
    paths.HWPJS_TEST_NOORI_HWPX,
    before,
  ]);
  assert.equal(authored.status, 0, authored.stderr);
  const input = readFileSync(before),
    sdk = await createHwpxEditor(await WebAssembly.compile(wasm));
  try {
    sdk.open(input);
    sdk.enableHistoryV2();
    const stats = sdk.historyStats();
    assert.deepEqual(Buffer.from(sdk.save()), input);
    assert.throws(
      () =>
        sdk.editSourceTableGrid({
          section: 0,
          tableNode: sdk.tableBindings(0)[0].tableNode,
          expectedRows: 3,
          expectedColumns: 4,
          action: 'insert-row',
          index: 1,
        }),
      /UnsupportedSourceLineCache/,
    );
    assert.deepEqual(sdk.historyStats(), stats);
    assert.deepEqual(Buffer.from(sdk.save()), input);
  } finally {
    sdk.close();
  }
});
