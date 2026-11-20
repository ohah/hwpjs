import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HWP5_DOCUMENT_TEXT_READ_FUNCTIONS } from '../../js/abi-schema.mjs';
import { documentTextFormat } from '../../js/document-text-observation-schema.mjs';
// Source call-path audit only. The separate Native integration tests still
// require actual compilation/execution; this is not a runtime or cost proof.
function assertDelegate(source, loop) {
  assert(!source.includes('document_text_read_projection.zig'));
  assert.equal((source.match(/control_text_read_context\.zig"\)\.Context\.init/g) || []).length, 1);
  assert(source.includes('defer read_context.deinit();'));
  assert(source.includes('read_context.copyVisibleText('));
  assert(source.includes('document_text_read_options.zig'));
  assert(/fromSession\((?:saved|display)\.options\)/.test(source));
  assert(source.includes('.template_element'));
  if (loop) {
    const init = source.indexOf('control_text_read_context.zig');
    const each = source.indexOf('for (physical.paragraphs, owners, 0..)');
    assert(each > init, 'section context must precede the paragraph loop');
  }
}
test('actual snapshot caret selection and transaction verification callers delegate to the section kernel', async () => {
  for (const name of ['snapshot', 'anchor', 'selection', 'session']) {
    const source = await readFile(
      new URL(`../../src/hwpx/document_text_${name}.zig`, import.meta.url),
      'utf8',
    );
    assertDelegate(source, ['snapshot', 'session'].includes(name));
    assert.throws(() =>
      assertDelegate(source.replace('read_context.copyVisibleText(', 'legacyText('), false),
    );
    assert.throws(() => assertDelegate(source.replace('defer read_context.deinit();', ''), false));
  }
});
test('read-only ABI exports and fixed format family cannot become editor entry points or shared error state', async () => {
  const source = await readFile(
    new URL('../../src/wasm/hwp5_document_text_read.zig', import.meta.url),
    'utf8',
  );
  const exports = [...source.matchAll(/^export fn (\w+)\(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exports, [...HWP5_DOCUMENT_TEXT_READ_FUNCTIONS].sort());
  assert(!source.includes('hwp5_edit'));
  assert(!source.includes('@import("cfb.zig")'));
  assert(source.indexOf('generation.enterMutation()') < source.indexOf('Owner.open('));
  assert(source.includes('generation.invalidate();'));
  for (const kind of ['snapshot', 'selection', 'anchor'])
    assert(source.includes(`owner.?.${kind}(`));
  assert.equal(documentTextFormat('hwp5_read'), 'hwp5');
  assert.equal(documentTextFormat('hwp5_edit'), 'hwp5');
  assert.equal(documentTextFormat('hwpx_edit'), 'hwpx');
  assert.throws(() => documentTextFormat('viewer_hwpx_edit'), /InvalidDocumentTextAbiFamily/);
});
test('published source snapshots use the captured external generation and never the batch JSON serial', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const source = await readFile(
      new URL(`../../src/wasm/${format}_edit.zig`, import.meta.url),
      'utf8',
    );
    for (const kind of ['snapshot', 'anchor', 'selection']) {
      const start = source.indexOf(`export fn ${format}_edit_document_text_${kind}(`),
        end = source.indexOf('\nexport fn ', start + 10),
        body = source.slice(start, end < 0 ? undefined : end);
      assert(body.includes('const observed_read_generation = document_text_generation.current()'));
      assert(body.includes('document_text_generation.assertCurrent(observed_read_generation)'));
      assert(!body.includes('mutation_serial'));
      if (kind === 'snapshot') assert(body.includes('.serial = observed_read_generation'));
    }
  }
});

// Fails if any actual caller stops deriving the policy from its Session options.
test('all four actual callers preserve the Session branch policy through one shared options boundary', async () => {
  const options = await readFile(
    new URL('../../src/hwpx/document_text_read_options.zig', import.meta.url),
    'utf8',
  );
  const checkOptions = (text) => {
    assert(text.includes('.branch_policy = editor.siteOptions(options).branch_policy'));
    assert(!text.includes('.mode = .selected'));
  };
  checkOptions(options);
  assert.throws(() =>
    checkOptions(options.replace('editor.siteOptions(options).branch_policy', '.{}')),
  );
  for (const name of ['snapshot', 'anchor', 'selection', 'session']) {
    const source = await readFile(
      new URL(`../../src/hwpx/document_text_${name}.zig`, import.meta.url),
      'utf8',
    );
    assertDelegate(source, ['snapshot', 'session'].includes(name));
    assert.throws(() =>
      assertDelegate(source.replace(/fromSession\((?:saved|display)\.options\)/, '.{}'), false),
    );
  }
});
