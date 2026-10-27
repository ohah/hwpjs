// Development oracle CLI: explicit evidence only; never generates Native output.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2),
  options = {};
try {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log(
      'node tools/verify-formatting-evidence.mjs --repo-root /absolute/checkout --evidence-dir /absolute/owned-output [--python-optimize]',
    );
  } else {
    for (let i = 0; i < argv.length; i++) {
      const key = argv[i];
      assert(
        ['--repo-root', '--evidence-dir', '--python-optimize'].includes(key),
        'unknown option ' + key,
      );
      assert(options[key] === undefined, 'duplicate option ' + key);
      options[key] = key === '--python-optimize' ? true : argv[++i];
      assert(options[key] !== undefined, 'missing option value');
    }
    assert(
      typeof options['--repo-root'] === 'string' && isAbsolute(options['--repo-root']),
      'FormattingEvidenceNotPrepared: explicit absolute --repo-root required',
    );
    const declaredRoot = resolve(options['--repo-root']);
    console.error(
      JSON.stringify({
        event: 'formatting-evidence-context',
        declaredRoot,
        cwd: process.cwd(),
        sourceRoot: resolve(sourceRoot),
        cwdLoader: 'tests/hwp5/style-preservation/text-record-oracle.mjs -> legacy/cfb.js',
      }),
    );
    assert.equal(declaredRoot, resolve(sourceRoot), 'repo-root must match this CLI source');
    assert.equal(
      process.cwd(),
      declaredRoot,
      'cwd must equal explicit repo-root for the existing oracle loader',
    );
    const directory = options['--evidence-dir'];
    assert(
      typeof directory === 'string' && isAbsolute(directory),
      'FormattingEvidenceNotPrepared: explicit absolute --evidence-dir required',
    );
    assert(
      !/title-column-roundtrip|hwpers_test4_complex_table|[\\/]legacy[\\/]hwpers(?:[\\/]|$)/.test(
        directory,
      ),
      'protected evidence path',
    );
    const modes = ['new7', 'reset-character', 'reset-paragraph', 'reset-all'],
      cases = ['hwp5', 'hwpx'].flatMap((format) => modes.map((mode) => format + '-' + mode));
    let caseFolders;
    try {
      caseFolders = readdirSync(directory);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        throw new Error(
          'FormattingEvidenceNotPrepared: explicit Native48 evidence directory is not ready',
          { cause: error },
        );
      throw error;
    }
    assert.deepEqual(
      caseFolders.sort(),
      [...cases].sort(),
      'expected exactly eight evidence case folders',
    );
    const names = ['source', 'edited', 'restored', 'redone', 'noop', 'metadata.json'];
    for (const item of cases)
      assert.deepEqual(
        readdirSync(resolve(directory, item)).sort(),
        [...names].sort(),
        'expected six evidence files per case',
      );
    const { verify } = await import('./formatting-evidence/hwp5-oracle.mjs');
    const results = [];
    for (const mode of modes) {
      const item = 'hwp5-' + mode,
        read = (name) => readFileSync(resolve(directory, item, name)),
        metadata = JSON.parse(read('metadata.json'));
      assert.equal(metadata.format, 'hwp5', 'wrong evidence format');
      if (mode !== 'new7')
        assert.deepEqual(
          metadata.command.patch,
          { reset: { basis: 'paragraph-style', scope: mode.slice(6) } },
          'case reset command mismatch',
        );
      const result = verify(read('source'), read('edited'), metadata.command);
      assert.deepEqual(read('restored'), read('source'), 'restored source bytes');
      assert.deepEqual(read('redone'), read('edited'), 'redo edited bytes');
      assert.deepEqual(read('noop'), read('edited'), 'noop edited bytes');
      results.push({
        case: item,
        ...result,
        restoredExact: true,
        redoExact: true,
        noopExact: true,
      });
    }
    const pythonArgs = [
      ...(options['--python-optimize'] ? ['-O'] : []),
      '-B',
      fileURLToPath(new URL('./formatting-evidence/check_hwpx.py', import.meta.url)),
      '--evidence-dir',
      directory,
    ];
    const xml = JSON.parse(
      execFileSync('python3', pythonArgs, { encoding: 'utf8', cwd: declaredRoot }),
    );
    assert.equal(xml.pass, 4);
    results.push(...xml.cases);
    console.log(JSON.stringify({ pass: results.length, evidenceFiles: 48, cases: results }));
  }
} catch (error) {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
}
