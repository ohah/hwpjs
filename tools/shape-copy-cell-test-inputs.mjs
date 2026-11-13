// Fixture generation CLI; validators are separate to avoid a fixture import cycle.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyShapeCopyTestInputs } from './shape-copy-test-inputs.mjs';
import { oracleInputs } from './shape-copy-cell-input-validation.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));
function safe(path) {
  assert(typeof path === 'string' && isAbsolute(path) && resolve(path) === path);
  assert(!/hwpers|title-column-roundtrip/iu.test(path), 'ProtectedBeforeAccess');
  return path;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4);
  assert.equal(process.argv[2], '--out');
  const out = safe(process.argv[3]);
  await mkdir(out, { recursive: false });
  const baseRaw = await readFile(safe(process.env.HWPJS_SHAPE_COPY_INPUTS));
  const base = JSON.parse(baseRaw);
  await verifyShapeCopyTestInputs(base);
  const run = (args) =>
    JSON.parse(
      execFileSync('python3', [resolve(root, 'tools/shape-copy-cell-fixtures.py'), ...args], {
        encoding: 'utf8',
      }),
    );
  const files = run(['--input', base.fixtures.hwpx, '--out', out]);
  const config = {
    schemaVersion: 2,
    baseInputsSHA256: sha(baseRaw),
    files,
    hwpxOpaque: files.find((r) => r.kind === 'opaque'),
    hwpxProtected: files.find((r) => r.kind === 'protected'),
  };
  const cells = resolve(out, 'cells.json');
  await writeFile(cells, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  process.env.HWPJS_CELL_FIXTURE_INPUTS = cells;
  const { fixture, saved, seedDraft } =
    await import('../apps/demo/tests/shape-copy-cell-fixture.mjs');
  const h = await fixture('hwpx', { opaqueTargets: true });
  const seeded = resolve(out, 'seeded.hwpx');
  try {
    assert.equal(h.source.listNode, 66, 'AuthoredSeedOwnerChanged');
    assert.deepEqual(
      h.targets.map((c) => c.listNode),
      [100, 111],
      'AuthoredTargetOwnersChanged',
    );
    await h.select(h.source);
    assert.equal(
      (await h.appearance.apply(h.appearance.capture(), seedDraft)).status,
      'committed-with-snapshot',
    );
    await writeFile(seeded, await saved(h.e), { flag: 'wx' });
  } finally {
    await h.close();
  }
  const more = run(['--input', base.fixtures.hwpx, '--out', out, '--seed', seeded]);
  const followup = {
    schemaVersion: 2,
    baseInputsSHA256: sha(baseRaw),
    files: [...files.filter((r) => r.kind === 'mixed-protected'), ...more],
  };
  await writeFile(resolve(out, 'followup.json'), JSON.stringify(followup, null, 2) + '\n', {
    flag: 'wx',
  });
  await writeFile(
    resolve(out, 'owner.json'),
    JSON.stringify(await oracleInputs(), null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      sourceFingerprint: base.coreManifest.sourceFingerprint,
      NativeSHA256: base.NativeSHA256,
      authored: [...files, ...more].map(({ kind, sha256, changedParts }) => ({
        kind,
        sha256,
        changedParts,
      })),
      oracleFiles: 20,
    }),
  );
}
