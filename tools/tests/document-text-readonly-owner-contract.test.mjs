import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertReadonlyOwnerContract } from '../document-text-readonly-owner-contract.mjs';
const owner = await readFile(
  new URL('../../src/hwp5/document_text_read_owner.zig', import.meta.url),
  'utf8',
);
test('readonly H5 owner uses read-only source and the existing Native observation kernels without editor authority', () => {
  assertReadonlyOwnerContract(owner);
});
test('an editable open, lifetime retag or added mutation entry violates readonly owner isolation', () => {
  for (const changed of [
    owner.replace('Source.openReadOnly(a, input)', 'Source.open(a, input)'),
    owner.replace('issuer.epoch != s.issuer_epoch', 'issuer.epoch != issuer.epoch'),
    owner.replace('pub fn anchor(', 'pub fn apply('),
  ])
    assert.throws(() => assertReadonlyOwnerContract(changed));
});
test('the separate readonly probe selects exactly seven declarations without fixture IO or existing filter changes', async () => {
  const root = await readFile(
    new URL('../../src/document_text_readonly_hwp_probe.zig', import.meta.url),
    'utf8',
  );
  assert.match(root, /@import\("hwp5\/document_text_read_owner_tests\.zig"\)/);
  const source = await readFile(
    new URL('../../src/hwp5/document_text_read_owner_tests.zig', import.meta.url),
    'utf8',
  );
  const names = [...source.matchAll(/^test "([^"]+)"/gm)].map((m) => m[1]);
  assert.equal(names.length, 7);
  assert.equal(new Set(names).size, 7);
  assert(names.every((n) => n.startsWith('document text readonly H5 ')));
  assert(!/readFile|cwd\(|@embedFile|legacy\//.test(source));
  assert.match(source, /checkAllAllocationFailures\(a, allocationTrial, \.\{bytes\}\)/);
});
