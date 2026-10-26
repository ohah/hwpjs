import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tableNumberSourceOracle } from './table-number-source-oracle.mjs';

test('independent table caption oracle preserves eight IDs and declared values', () => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwp'),
    before = Buffer.from(input);
  const result = tableNumberSourceOracle(input);
  assert.equal(result.tables.length, 8);
  result.tables.forEach((row, index) => {
    assert.equal(row.object.instance, 1748212109 + index);
    assert.deepEqual(row.values, [{ attributes: 4, number: index + 1 }]);
  });
  assert.deepEqual(input, before);
});
for (const [name, objects, tables, resolved, missing, digest] of [
  [
    'hwpspec.hwp',
    518,
    459,
    137,
    5,
    'd2447c7a84804de00940b5d2ac2bc9e9f40cd4d0dc00a2f6daf942dee3e46b77',
  ],
  [
    'hwp-3.0-HWPML.hwp',
    321,
    305,
    0,
    5,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  ],
])
  test(`independent table number source census: ${name}`, (t) => {
    const path = `reference/rhwp/samples/${name}`;
    if (!existsSync(path)) {
      t.skip('RHWP reference fixture is unavailable');
      return;
    }
    const input = readFileSync(path),
      before = Buffer.from(input),
      result = tableNumberSourceOracle(input);
    assert.equal(result.objects.length, objects);
    assert.equal(result.tables.length, tables);
    assert.equal(
      result.references.filter((row) => row.state === 'resolved-declaration').length,
      resolved,
    );
    assert.equal(
      result.references.filter((row) => row.state === 'unresolved-target').length,
      missing,
    );
    assert.equal(result.references.length, resolved + missing);
    assert.equal(result.resolvedDigest, digest);
    assert.deepEqual(input, before);
  });
