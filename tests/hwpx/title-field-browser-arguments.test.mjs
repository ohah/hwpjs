import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runFieldLabelBrowserAudit } from '../../tools/browser/field-label-roundtrip.mjs';

test('title browser audit refuses missing candidate before browser setup', () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, ['tools/hwpx-title-field-browser-audit.mjs'], {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000,
        env: { ...process.env, HWPJS_TEST_WASM: '' },
      }),
    (e) =>
      e.status === 1 &&
      e.stderr.includes('ExplicitBrowserCandidateRequired') &&
      !e.stdout.includes('browser-phase'),
  );
});

test('title browser audit refuses unexpected arguments before input loading', () => {
  for (const argument of ['--port=0', '--root=/', 'extra'])
    assert.throws(
      () =>
        execFileSync(process.execPath, ['tools/hwpx-title-field-browser-audit.mjs', argument], {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000,
          env: { ...process.env, HWPJS_TEST_WASM: 'must-not-read.wasm' },
        }),
      (e) =>
        e.status === 1 &&
        e.stderr.includes('UnexpectedBrowserAuditArguments') &&
        !e.stderr.includes('ENOENT') &&
        !e.stdout.includes('browser-phase'),
    );
});

test('shared field browser audit rejects unknown and prototype case names without setup', async () => {
  for (const name of ['unknown', '', 'toString', 'constructor', '__proto__'])
    await assert.rejects(runFieldLabelBrowserAudit(name), {
      message: 'UnknownFieldLabelBrowserCase',
    });
});
