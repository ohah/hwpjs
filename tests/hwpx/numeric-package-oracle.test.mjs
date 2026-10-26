import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from '../../tools/oracle-process.mjs';

for (const flags of [[], ['-O']])
  test(`numeric package oracle rejects exact ZIP/XML mutations (${flags.join(' ') || 'normal'})`, () => {
    const options = { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] };
    const result = execFileSync(
      'python3',
      [...flags, 'tools/hwpx-numeric-package-self-test.py'],
      options,
    );
    assert.deepEqual(JSON.parse(result), {
      envelopeMutants: 13,
      xmlDeclarationMutants: 2,
      xmlTreesIndependent: true,
    });
    assert.throws(
      () =>
        execFileSync(
          'python3',
          [...flags, 'tools/hwpx-numeric-package-self-test.py', '--skip-crc'],
          options,
        ),
      (error) =>
        error.status === 1 &&
        error.signal === null &&
        /Unexpected numeric package self-test argument/.test(String(error.stderr)),
    );
  });
