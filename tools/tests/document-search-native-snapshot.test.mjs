import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  unlink,
  lstat,
  chmod,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  documentSearchSnapshotFiles,
  prepareDocumentSearchSnapshot,
} from '../run-document-search-native.mjs';

const pin = [
  ['hwp', 257536, 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f'],
  ['hwpx', 324413, '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab'],
];
const sourcePath = (extension) => `src/testing/noori-column/noori.${extension}`;
const publicPath = (extension) => `apps/docs/docs/public/editor/fixtures/noori.${extension}`;
const link = (extension) => `../../../${publicPath(extension)}`;
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'hwpjs-search-snapshot-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'checkout'),
    input = join(base, 'input');
  for (const [extension] of pin) {
    const target = join(root, publicPath(extension));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      await readFile(new URL(`../../${publicPath(extension)}`, import.meta.url)),
    );
    const alias = join(root, sourcePath(extension));
    await mkdir(dirname(alias), { recursive: true });
    await symlink(link(extension), alias);
  }
  return { base, root, input };
}
test('exact two own public Noori aliases become truthful regular byte snapshots without copying the public tree', async (t) => {
  const f = await fixture(t);
  const { sourceFiles, sourceLinks } = await prepareDocumentSearchSnapshot(f.root, f.input);
  assert.deepEqual(sourceFiles, await documentSearchSnapshotFiles(f.input));
  assert.equal(sourceFiles.length, 2);
  assert.equal(sourceLinks.length, 2);
  for (const [extension, bytes, sha256] of pin) {
    const path = sourcePath(extension),
      metadata = await lstat(join(f.input, path));
    assert(metadata.isFile() && !metadata.isSymbolicLink());
    assert.equal(metadata.mode & 0o222, 0);
    assert.deepEqual(
      sourceFiles.find((row) => row.path === path),
      { path, bytes, sha256 },
    );
    assert.equal(
      createHash('sha256')
        .update(await readFile(join(f.input, path)))
        .digest('hex'),
      sha256,
    );
    assert.deepEqual(
      sourceLinks.find((row) => row.path === path),
      {
        path,
        link: link(extension),
        target: publicPath(extension),
        bytes,
        sha256,
        physicalRegularTarget: true,
      },
    );
  }
  await assert.rejects(lstat(join(f.input, 'apps')), { code: 'ENOENT' });
});
test('an undeclared source symlink is rejected even when it points to the same approved public bytes', async (t) => {
  const f = await fixture(t);
  await symlink(link('hwp'), join(f.root, 'src/testing/noori-column/other.hwp'));
  await assert.rejects(prepareDocumentSearchSnapshot(f.root, f.input), /UnexpectedSnapshotSymlink/);
  await assert.rejects(lstat(f.input), { code: 'ENOENT' });
});
test('declared paths cannot use a foreign absolute target', async (t) => {
  const f = await fixture(t),
    alias = join(f.root, sourcePath('hwp'));
  await unlink(alias);
  await symlink(join(f.root, publicPath('hwp')), alias);
  await assert.rejects(documentSearchSnapshotFiles(f.root), /SnapshotAliasLiteralMismatch/);
});
test('declared paths cannot swap the HWP and HWPX target literals', async (t) => {
  const f = await fixture(t),
    alias = join(f.root, sourcePath('hwp'));
  await unlink(alias);
  await symlink(link('hwpx'), alias);
  await assert.rejects(documentSearchSnapshotFiles(f.root), /SnapshotAliasLiteralMismatch/);
});
test('the target public directory cannot redirect through a symlink', async (t) => {
  const f = await fixture(t),
    directory = join(f.root, 'apps/docs/docs/public/editor/fixtures');
  const original = await readFile(join(f.root, publicPath('hwp'))),
    other = join(f.base, 'other');
  await mkdir(other);
  await writeFile(join(other, 'noori.hwp'), original);
  await rm(directory, { recursive: true });
  await symlink(other, directory);
  await assert.rejects(documentSearchSnapshotFiles(f.root), /SnapshotAliasTargetMismatch/);
});
test('an approved terminal target must itself be a physical regular file', async (t) => {
  const f = await fixture(t),
    target = join(f.root, publicPath('hwp')),
    other = join(f.base, 'other.hwp');
  await writeFile(other, await readFile(target));
  await unlink(target);
  await symlink(other, target);
  await assert.rejects(documentSearchSnapshotFiles(f.root), /SnapshotAliasTargetMismatch/);
});
for (const [extension] of pin)
  test(`approved ${extension} target size and digest are both mandatory`, async (t) => {
    const f = await fixture(t),
      target = join(f.root, publicPath(extension));
    const bytes = await readFile(target);
    bytes[0] ^= 1;
    await writeFile(target, bytes);
    await assert.rejects(documentSearchSnapshotFiles(f.root), /SnapshotAliasDigestMismatch/);
    await writeFile(target, bytes.subarray(1));
    await assert.rejects(documentSearchSnapshotFiles(f.root), /SnapshotAliasSizeMismatch/);
  });
test('missing approved targets are rejected before materialization or a Native launch', async (t) => {
  const f = await fixture(t);
  await unlink(join(f.root, publicPath('hwp')));
  await assert.rejects(prepareDocumentSearchSnapshot(f.root, f.input), { code: 'ENOENT' });
  await assert.rejects(lstat(f.input), { code: 'ENOENT' });
});
test('a modified regular snapshot still changes the manifest and cannot inherit the alias proof', async (t) => {
  const f = await fixture(t),
    { sourceFiles } = await prepareDocumentSearchSnapshot(f.root, f.input);
  const target = join(f.input, sourcePath('hwp'));
  await chmod(target, 0o644);
  await writeFile(target, 'changed snapshot');
  assert.notDeepEqual(await documentSearchSnapshotFiles(f.input), sourceFiles);
});
