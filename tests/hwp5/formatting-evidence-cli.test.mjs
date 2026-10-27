import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { preserveInactiveGridSnapReset as proof } from '../../tools/formatting-evidence/hwp5-oracle.mjs';
import { encodeRecord } from './style-preservation/text-record-oracle.mjs';
const root = resolve(fileURLToPath(new URL('../../', import.meta.url))),
  cli = resolve(root, 'tools/verify-formatting-evidence.mjs');
const run = (args, cwd = root) =>
  spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
test('formatting evidence CLI help needs no Native artifacts', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--repo-root/);
});
test('formatting evidence CLI requires explicit repo-root', () => {
  const r = run([]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /explicit absolute --repo-root/);
});
test('formatting evidence CLI refuses unknown and duplicate options', () => {
  assert.equal(run(['--unknown']).status, 1);
  assert.equal(run(['--repo-root', root, '--repo-root', root]).status, 1);
});
test('formatting evidence CLI logs and refuses different declared root', () => {
  const r = run(['--repo-root', tmpdir()]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /formatting-evidence-context/);
  assert.match(r.stderr, /repo-root must match/);
});
test('formatting evidence CLI logs and refuses implicit cwd switch', () => {
  const r = run(['--repo-root', root], tmpdir());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cwd must equal explicit/);
});
test('formatting evidence CLI does not search for implicit verification data', () => {
  const r = run(['--repo-root', root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /explicit absolute --evidence-dir/);
});
test('formatting evidence proof is source-only and rejects active or incomplete grid', () => {
  const before = Buffer.alloc(54),
    after = Buffer.alloc(54);
  before.writeUInt32LE(256);
  const definition = Buffer.alloc(14);
  definition.write('dces');
  const command = {
    section: 0,
    patch: { reset: { basis: 'paragraph-style', scope: 'paragraph' } },
  };
  const original = { sections: [{ bytes: encodeRecord(71, 1, definition) }] };
  assert.equal(proof(original, command, before, after), true);
  definition.writeUInt16LE(1, 10);
  assert.equal(
    proof({ sections: [{ bytes: encodeRecord(71, 1, definition) }] }, command, before, after),
    false,
  );
  assert.equal(proof({ sections: [{ bytes: Buffer.alloc(0) }] }, command, before, after), false);
  const changed = Buffer.from(after);
  changed[4] ^= 1;
  assert.equal(proof(original, command, before, changed), false);
});

test('formatting evidence CLI fails clearly when Native48 directory is absent', () => {
  const absent = resolve(tmpdir(), 'hwpjs-evidence-not-created-' + process.pid);
  const r = run(['--repo-root', root, '--evidence-dir', absent]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FormattingEvidenceNotPrepared/);
  assert.equal(r.stdout, '');
});
