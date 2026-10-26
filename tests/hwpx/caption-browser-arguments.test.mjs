import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('caption browser audit refuses missing candidates and unknown arguments before creating sessions', () => {
  const env = { ...process.env };
  delete env.HWPJS_TEST_WASM;
  for (const [args, expected] of [
    [[], /ExplicitBrowserCandidateRequired/],
    [['--unknown'], /UnexpectedBrowserAuditArguments/],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['tools/captioned-picture-browser-audit.mjs', ...args],
      { encoding: 'utf8', env, timeout: 5000 },
    );
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.equal(result.error, undefined);
    assert.match(result.stderr, expected);
    assert.equal(result.stdout, '');
  }
});
