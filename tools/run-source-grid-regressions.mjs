import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    wasm: { type: 'string' },
    out: { type: 'string' },
    'legacy-compat': { type: 'boolean', default: false },
  },
});
assert(values.wasm && values.out, 'Usage: --wasm FILE --out NEW_DIRECTORY [--legacy-compat]');
if (values['legacy-compat'])
  for (const key of [
    'HWPJS_TEST_SOURCE_GRID_BASELINE_WASM',
    'HWPJS_TEST_SOURCE_GRID_R1_WASM',
    'HWPJS_TEST_SOURCE_GRID_R2_WASM',
    'HWPJS_TEST_SOURCE_GRID_INTERMEDIATE_WASM',
  ])
    assert(process.env[key], 'ExplicitUnreleasedComparisonInput:' + key);
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(values.out),
  fixtures = join(out, 'fixtures'),
  wasm = resolve(values.wasm);
assert(
  !/title-column-roundtrip|hwpers_test4_complex_table|legacy[\\/]hwpers/i.test(wasm),
  'ProtectedInput',
);
await mkdir(out);
await mkdir(fixtures);
const binary = await readFile(wasm),
  hash = (value) => createHash('sha256').update(value).digest('hex');
const env = {
  ...process.env,
  HWPJS_TEST_WASM: wasm,
  HWPJS_TEST_SOURCE_GRID_FIXTURE_DIR: fixtures,
  HWPJS_TEST_SOURCE_GRID_OUTPUT_DIR: fixtures,
};
const python = 'python3';
function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 ** 2,
  });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (options.log)
    return writeFile(join(out, options.log), output).then(() => {
      assert.equal(result.status, 0, output.slice(-6000) || String(result.error));
      return output;
    });
  assert.equal(result.status, 0, output.slice(-6000) || String(result.error));
  return output;
}
run('bun', ['tests/helpers/source-grid-base.mjs']);
function authored(script, original, output, ...args) {
  run(python, ['-B', join(root, 'tests/helpers', script), original, output, ...args]);
}
for (const extension of ['hwp', 'hwpx']) {
  const original = join(fixtures, 'regular.' + extension);
  for (const mode of ['vertical', 'horizontal', 'nested', 'ambiguous', 'protected-nested'])
    authored('source-grid-fixtures.py', original, join(fixtures, mode + '.' + extension), mode);
  for (const mode of [
    'interval-columns',
    'interval-rows',
    'interval-conflict',
    'interval-nonpositive',
  ])
    authored(
      'source-grid-interval-fixtures.py',
      original,
      join(fixtures, mode + '.' + extension),
      mode,
    );
  for (const side of ['top', 'bottom'])
    for (const order of extension === 'hwp' ? ['before'] : ['before', 'after'])
      authored(
        'source-grid-caption-fixtures.py',
        original,
        join(fixtures, `caption-${side}-${order}.${extension}`),
        side,
        order,
      );
  const modes = [
    'unknown-extension',
    'unknown-flags',
    'list-extension',
    'field',
    'cache',
    'nested',
    'duplicate',
    'wrong-owner',
    ...(extension === 'hwp' ? ['presence', 'presence-without-list'] : ['list-cache', 'reference']),
  ];
  for (const mode of modes)
    authored(
      'source-grid-caption-fixtures.py',
      original,
      join(fixtures, `caption-reject-${mode}.${extension}`),
      'top',
      'before',
      mode,
    );
}
const output = await run(
  'bun',
  [
    'test',
    '--no-install',
    '--timeout=60000',
    'tests/table-grid/source-grid-native.test.mjs',
    'tests/table-grid/source-grid-interval-native.test.mjs',
    'tests/table-grid/source-grid-caption-native.test.mjs',
  ],
  { log: 'current-tests.log' },
);
assert.match(output, /\b104 pass\b/);
assert.match(output, /\b0 fail\b/);
assert(!/\b[1-9]\d* skip\b/.test(output), 'CurrentTestsMustNotSkip');
let historical = 0;
if (values['legacy-compat']) {
  for (const key of [
    'HWPJS_TEST_SOURCE_GRID_BASELINE_WASM',
    'HWPJS_TEST_SOURCE_GRID_R1_WASM',
    'HWPJS_TEST_SOURCE_GRID_R2_WASM',
    'HWPJS_TEST_SOURCE_GRID_INTERMEDIATE_WASM',
  ])
    assert(env[key], 'ExplicitUnreleasedComparisonInput:' + key);
  const old = await run(
    'bun',
    [
      'test',
      '--no-install',
      '--timeout=60000',
      'tests/table-grid/source-grid-unreleased-compatibility.test.mjs',
    ],
    { log: 'unreleased-comparisons.log' },
  );
  assert.match(old, /\b13 pass\b/);
  assert.match(old, /\b0 fail\b/);
  historical = 13;
}
await writeFile(
  join(out, 'RESULT.json'),
  JSON.stringify(
    {
      wasmSha256: hash(binary),
      currentTests: 104,
      unreleasedComparisons: historical,
      fixturePolicy:
        'constructor-authored synthetic documents and two explicit tracked table-caption fixtures',
      sourceRoot: root,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    verified: true,
    currentTests: 104,
    unreleasedComparisons: historical,
    evidence: out,
  }),
);
