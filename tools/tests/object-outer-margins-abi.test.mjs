import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ABI_VERSION,
  HWPX_OBJECT_OUTER_MARGINS_ABI,
  EXPERIMENTAL_EDITOR_FUNCTIONS,
} from '../../js/abi-schema.mjs';
test('margins ABI is exactly three optional signatures without changing ABI6 legacy surface', () => {
  assert.equal(ABI_VERSION, 6);
  assert.deepEqual(HWPX_OBJECT_OUTER_MARGINS_ABI, {
    hwpx_edit_object_outer_margins_version: { params: [], results: ['i32'] },
    hwpx_edit_object_outer_margins: { params: ['i32', 'i32'], results: ['i32'] },
    hwpx_edit_set_object_outer_margins: { params: ['i32', 'i32'], results: ['i32'] },
  });
  for (const name of Object.keys(HWPX_OBJECT_OUTER_MARGINS_ABI))
    assert(!EXPERIMENTAL_EDITOR_FUNCTIONS.includes(name));
});
test('official generator --check matches exact declared optional signature group', () => {
  execFileSync(process.execPath, [
    new URL('../generate-abi.mjs', import.meta.url).pathname,
    '--check',
  ]);
  const source = readFileSync(new URL('../../src/wasm/abi_schema.zig', import.meta.url), 'utf8');
  for (const name of Object.keys(HWPX_OBJECT_OUTER_MARGINS_ABI))
    assert.equal(source.split('.name = "' + name + '"').length - 1, 1);
});
test('Native write boundary checks actual lifetime before single owned History mutation', () => {
  const source = readFileSync(new URL('../../src/wasm/hwpx_edit.zig', import.meta.url), 'utf8');
  const body = source
    .split('export fn hwpx_edit_set_object_outer_margins(')[1]
    .split('// Exact source-frame geometry:')[0];
  assert(
    body.indexOf('formatting_lifetime.check') <
      body.indexOf('document_text_generation.enterMutation'),
  );
  assert(
    body.indexOf('object_outer_margins.zig").validate') <
      body.indexOf('document_text_generation.enterMutation'),
  );
  assert.equal(body.split('display_resource_generation.zig').length - 1, 1);
  assert(body.includes('request.geometry.selector.section'));
  assert(body.includes('return if (changed) 1 else 2'));
});
