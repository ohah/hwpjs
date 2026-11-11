import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join, isAbsolute } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
assert(['sdk', 'cli'].includes(mode), 'ExpectedSdkOrCliMode');
const required = (name) => {
  const value = process.env[name];
  assert(typeof value === 'string' && isAbsolute(value), `ExplicitAbsoluteInput:${name}`);
  assert(
    !/title-column-roundtrip|hwpers_test4_complex_table|legacy[\\/]hwpers/i.test(value) &&
      !value.split(/[\\/]/).includes('..'),
    'ProtectedBeforeAccess',
  );
  return value;
};
const wasm = required('HWPJS_TEST_WASM');
const out = required('HWPJS_PAGE_REGRESSION_OUT');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pin = process.env.HWPJS_TEST_WASM_SHA256;
assert.match(pin ?? '', /^[a-f0-9]{64}$/);
assert.equal(hash(readFileSync(wasm)), pin, 'NativeDigestMismatch');
const manifestPath = join(root, 'tests/fixtures/hwp5-page-settings/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.schemaVersion, 1);
const allowed = new Set([
  'tests/fixtures/hwp5-page-settings/two-sections.hwp',
  'tests/fixtures/hwp5-page-settings/two-reserved.hwp',
  'apps/docs/docs/public/editor/fixtures/page.hwp',
]);
assert.equal(manifest.files.length, allowed.size);
const inputs = {};
for (const entry of manifest.files) {
  assert(allowed.delete(entry.path), 'UnexpectedOrDuplicateFixture');
  const path = resolve(root, entry.path);
  assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  assert.equal(hash(readFileSync(path)), entry.sha256, entry.path);
  inputs[path] = entry.sha256;
}
assert.equal(allowed.size, 0);
mkdirSync(out);
writeFileSync(join(out, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n');
const multi = resolve(root, 'tests/fixtures/hwp5-page-settings/two-sections.hwp');
const env = {
  ...process.env,
  HWPJS_PAGE_H5_INPUTS: join(out, 'inputs.json'),
  HWPJS_TEST_HWP5_MULTI: multi,
  HWPJS_TEST_HWP5_MULTI_SHA256: inputs[multi],
};
const jobs =
  mode === 'sdk'
    ? [
        { name: 'hwp5-sdk', files: ['tools/tests/hwp5-page-settings-native.test.mjs'] },
        {
          name: 'hwpx-sdk',
          files: [
            'tools/tests/hwpx-page-settings-native.test.mjs',
            'tools/tests/page-settings-values.test.mjs',
          ],
        },
      ]
    : [
        {
          name: 'cli',
          files: [
            'packages/cli/e2e/page-settings-bridges.test.mjs',
            'packages/cli/e2e/hwp5-page-settings-bridges.test.mjs',
          ],
        },
      ];
if (mode === 'cli') {
  const old = required('HWPJS_PAGE_TEST_OLD_WASM');
  assert.equal(hash(readFileSync(old)), process.env.HWPJS_PAGE_TEST_OLD_WASM_SHA256);
}
const completed = [];
for (const job of jobs) {
  const jobEnv = {
    ...env,
    HWPJS_TEST_EVIDENCE_DIR: join(out, job.name + '-evidence'),
    HWPJS_PAGE_TEST_EVIDENCE: join(out, 'hwpx-cli'),
    HWPJS_PAGE_H5_EVIDENCE: join(out, 'hwp5-cli'),
  };
  const args =
    mode === 'sdk'
      ? ['test', '--no-install', '--timeout=60000', ...job.files]
      : ['--test', '--test-reporter=tap', '--test-concurrency=1', ...job.files];
  const result = spawnSync(mode === 'sdk' ? 'bun' : process.execPath, args, {
    cwd: root,
    env: jobEnv,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 ** 2,
  });
  const log = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(join(out, job.name + '.log'), log);
  process.stdout.write(log);
  assert.equal(result.status, 0, result.error?.message ?? job.name);
  if (mode === 'sdk') assert.match(log, /\b0 fail\b/);
  else assert.match(log, /^# fail 0$/m);
  completed.push({ name: job.name, files: job.files, exitCode: result.status });
}
writeFileSync(
  join(out, 'RESULT.json'),
  JSON.stringify({ mode, nativeSha256: pin, completed }, null, 2) + '\n',
);
