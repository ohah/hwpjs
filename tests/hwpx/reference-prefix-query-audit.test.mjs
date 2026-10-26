import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (args) =>
  spawnSync(process.execPath, ['tools/reference-hwpx-prefix-query-audit.mjs', ...args], {
    encoding: 'utf8',
    timeout: 60000,
  });
test('reference prefix audit validates explicit scope before reading inputs', () => {
  for (const [args, error] of [
    [[], 'MissingAuditScope'],
    [['--wasm=missing', '--wasm=other'], 'DuplicateAuditArgument'],
    [['--history'], 'UnknownAuditArgument'],
  ]) {
    const result = run(args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(error));
    assert.equal(result.stdout, '');
  }
});
test('reference prefix audit keeps mismatched signatures and corrupt files out of query successes', (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const root = mkdtempSync(join(tmpdir(), 'hwpjs-prefix-query-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  copyFileSync(
    'legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx',
    join(root, 'picture.hwpx'),
  );
  copyFileSync('legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwp', join(root, 'hwp5.hwpx'));
  const args = [`--wasm=${process.env.HWPJS_TEST_WASM}`, `--root=${root}`];
  const clean = run(args);
  assert.equal(clean.error, undefined);
  assert.equal(clean.signal, null);
  assert.equal(clean.status, 0, clean.stderr);
  const parsed = clean.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const summary = parsed.at(-1);
  assert.equal(summary.queried, 1);
  assert.equal(summary.otherFormat, 1);
  assert.equal(summary.failedFiles, 0);
  assert.equal(summary.refused, 0);
  assert.equal(parsed.find((row) => row.format === 'hwp5').status, 'other_format');
  writeFileSync(join(root, 'corrupt.hwpx'), 'not a document');
  const corrupt = run(args);
  assert.equal(corrupt.error, undefined);
  assert.equal(corrupt.signal, null);
  assert.equal(corrupt.status, 1);
  const failed = corrupt.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .at(-1);
  assert.equal(failed.queried, 1);
  assert.equal(failed.otherFormat, 1);
  assert.equal(failed.failedFiles, 1);
});
