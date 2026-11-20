import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertReadGenerationBoundaries,
  generationRoute,
  readGenerationFunctions,
} from '../document-text-read-generation-contract.mjs';
const shared = ['apply', 'applyBatch', 'travel'];
for (const format of ['hwp5', 'hwpx']) {
  const source = await readFile(
    new URL(`../../src/wasm/${format}_edit.zig`, import.meta.url),
    'utf8',
  );
  test(`${format}: module documentation precedes the external authority declaration`, () => {
    assert(source.startsWith('//!'), 'ModuleDocumentationMustPrecedeDeclarations');
  });
  const direct = [
    `${format}_edit_close`,
    `${format}_edit_history_enable`,
    `${format}_edit_history_enable_options`,
    `${format}_edit_apply_formatting_patch`,
    `${format}_edit_replace_document_text`,
    `${format}_edit_apply_text_transaction`,
    ...(format === 'hwp5'
      ? ['applyRichCharacter', 'hwp5_edit_split_source_table_cells']
      : [
          'hwpx_edit_insert_document',
          'hwpx_edit_merge_source_table_cells',
          'hwpx_edit_split_source_table_cells',
          'hwpx_edit_set_named_field_parameters',
          'hwpx_edit_create_named_field',
          'hwpx_edit_rename_named_field',
          'applyRichCharacter',
          'hwpx_edit_bullet_definition_write',
          'hwpx_edit_write_page_settings',
          'hwpx_edit_set_object_geometry',
        ]),
  ];
  test(`${format}: shared and direct Native mutation boundaries retain external read-generation admission`, () => {
    const fns = assertReadGenerationBoundaries(source, [...shared, ...direct]);
    for (const name of [
      `${format}_edit_undo`,
      `${format}_edit_redo`,
      `${format}_edit_splice`,
      `${format}_edit_source_table_grid`,
      `${format}_edit_created_table_grid`,
    ])
      assert(generationRoute(fns, name), name);
    for (const kind of ['anchor', 'selection', 'snapshot', 'read_binding']) {
      const body = fns.get(`${format}_edit_document_text_${kind}`)?.body;
      assert(body?.includes('document_text_generation.current()'));
      assert(!body.includes('enterMutation()'));
    }
    assert(
      fns.get(`${format}_edit_document_text_snapshot`).body.includes('snapshot.bindReadStamp('),
    );
  });
  test(`${format}: deleting a central or direct mutation guard is detected`, () => {
    for (const name of [...shared, ...direct]) {
      const fns = readGenerationFunctions(source),
        body = fns.get(name).body;
      assert(body.includes('document_text_generation.'));
      // Modify that actual function's text only; no compiler or production execution.
      const begin = source.indexOf(`fn ${name}(`),
        next = source.indexOf('\n}', begin) + 2;
      const broken =
        source.slice(0, begin) +
        source
          .slice(begin, next)
          .replace(/document_text_generation\.(enterMutation|invalidate)\(/g, 'unrelated.$1(') +
        source.slice(next);
      assert.throws(() => assertReadGenerationBoundaries(broken, [...shared, ...direct]));
    }
  });
}
test('source scanner ignores calls in comments/strings and preserves helper paths', () => {
  const f = readGenerationFunctions(
    'fn helper() void { document_text_generation.enterMutation() catch {}; }\nexport fn write() u32 { // fake()\n const s = "helper()"; helper(); return 1; }',
  );
  assert.deepEqual(generationRoute(f, 'write'), ['write', 'helper']);
  assert(!f.get('write').calls.includes('fake'));
});

test('generation admission must precede mutation and managed-state changes, not merely appear in the body', () => {
  for (const effect of [
    'session.apply(command);',
    'session.history_delta_managed = true;',
    'history = History.init(session);',
  ]) {
    const late = `var document_text_generation: State = .{};\nfn apply() void { ${effect} try document_text_generation.enterMutation(); }`;
    assert.throws(() => assertReadGenerationBoundaries(late, ['apply']), /LateMutationFence/);
  }
});
