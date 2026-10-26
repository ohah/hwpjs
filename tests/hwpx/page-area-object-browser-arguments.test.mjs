import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('complex page-area browser audit refuses missing candidate before acquiring any browser', () => {
  const env = { ...process.env, PATH: '/nonexistent-browser-tools' };
  delete env.HWPJS_TEST_WASM;
  for (const args of [[], ['unexpected'], ['--case=sections'], ['--case=sections', 'unexpected']]) {
    const result = spawnSync(
      process.execPath,
      ['tools/page-area-object-browser-audit.mjs', ...args],
      { env, encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /agent-browser|ENOENT/);
  }
});
