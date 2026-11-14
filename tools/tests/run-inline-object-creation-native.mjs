import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  validateInlineObjectCreationInputs,
  projectRoot,
  OLD_879_SHA256,
  validateInlineObjectCaretFixtures,
} from './helpers/inline-object-creation-inputs.mjs';

const flags = new Set(process.argv.slice(2));
assert(
  flags.size === process.argv.length - 2 &&
    [...flags].every((flag) => ['--check-inputs', '--caret'].includes(flag)),
  'InvalidArgument',
);
const caret = flags.has('--caret');
const expectedTests = caret ? 7 : 13;
const inputs = validateInlineObjectCreationInputs();
if (caret) validateInlineObjectCaretFixtures();
if (process.argv.includes('--check-inputs')) {
  console.log(
    JSON.stringify({
      candidateSha256: inputs.candidateSha256,
      oldSha256: OLD_879_SHA256,
      seedSha256: inputs.seedSha256,
      runtimeExecuted: false,
      expectedNormalSdkTests: expectedTests,
      cohort: caret ? 'r9-caret-7' : 'facade6-core7',
    }),
  );
} else {
  mkdirSync(inputs.directory, { recursive: false });
  writeFileSync(join(inputs.directory, 'seed.hwpx'), inputs.seed, { flag: 'wx' });
  const files = [
    'js/hwpx-editor.mjs',
    'js/hwpx-inline-object-insert.mjs',
    'packages/core/src/commands/inline-object-insert.ts',
    'packages/core/src/editor/create-editor.ts',
    'packages/core/src/index.ts',
    'packages/core/src/commands/surface-protocol.ts',
    'web/preview/reader-runtime.mjs',
    ...(caret
      ? [
          'packages/core/src/commands/current-caret.ts',
          'packages/core/src/commands/document-insert.ts',
        ]
      : []),
  ];
  const pin = () =>
    Object.fromEntries(
      files.map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(projectRoot, name)))
          .digest('hex'),
      ]),
    );
  const before = pin();
  writeFileSync(
    join(inputs.directory, 'INPUTS.json'),
    JSON.stringify(
      {
        candidateSha256: inputs.candidateSha256,
        oldSha256: OLD_879_SHA256,
        seedSha256: inputs.seedSha256,
        source: before,
      },
      null,
      2,
    ),
  );
  const results = [];
  const run = (name, executable, args) => {
    const result = spawnSync(executable, args, {
      cwd: projectRoot,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(
      join(inputs.directory, name + '.log'),
      (result.stdout ?? '') + (result.stderr ?? ''),
      { flag: 'wx' },
    );
    results.push({
      name,
      exit: result.status,
      signal: result.signal,
      error: result.error?.message,
    });
    return result;
  };
  try {
    const native = run(caret ? 'caret-7' : 'sdk-13', process.execPath, [
      '--experimental-transform-types',
      '--max-old-space-size=512',
      '--test',
      '--test-concurrency=1',
      '--test-timeout=50000',
      '--test-reporter=tap',
      ...(caret
        ? ['tools/tests/inline-object-creation-caret-native.test.mts']
        : [
            'tools/tests/inline-object-creation-facade-native.test.mjs',
            'tools/tests/inline-object-creation-core-native.test.mts',
          ]),
    ]);
    assert.equal(native.status, 0, 'NormalSdkTestsFailed');
    for (const [key, value] of [
      ['tests', expectedTests],
      ['pass', expectedTests],
      ['fail', 0],
      ['skipped', 0],
    ])
      assert(
        new RegExp('^# ' + key + ' ' + value + '$', 'm').test(native.stdout),
        'UnexpectedTestDiscovery:' + key,
      );
    const oracle = fileURLToPath(
      new URL(
        caret ? './inline-object-creation-caret-oracle.py' : './inline-object-creation-oracle.py',
        import.meta.url,
      ),
    );
    for (const [name, args] of [
      ['oracle', ['-B']],
      ['oracle-optimized', ['-B', '-O']],
    ])
      assert.equal(
        run(name, 'python3', [...args, oracle, inputs.directory]).status,
        0,
        name + 'Failed',
      );
    const negative = run('oracle-wrong-expectation', 'python3', [
      '-B',
      oracle,
      inputs.directory,
      caret ? '--wrong-value' : '--expect-mutated',
    ]);
    assert.equal(negative.status, 1, 'WrongExpectationMustFail');
    assert(
      negative.stderr.includes(
        caret
          ? 'ValueError: saved-chart new chart value'
          : 'ValueError: core-queued-chart.hwpx exact number lexical/order',
      ),
      'WrongExpectedValueWasNotTheRejectionCause',
    );
    assert.deepEqual(pin(), before, 'SourcesChangedDuringRegression');
  } finally {
    writeFileSync(
      join(inputs.directory, 'RESULT.json'),
      JSON.stringify(
        {
          results,
          sourceUnchanged: JSON.stringify(pin()) === JSON.stringify(before),
          browserExecuted: false,
          newNativeBinaryBuilt: false,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  }
}
