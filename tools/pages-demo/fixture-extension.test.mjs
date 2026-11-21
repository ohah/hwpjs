import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extendPublicFixtureFiles,
  loadPublicFixtureExtension,
  HWP5_MARGIN_RECEIPT,
} from './fixture-extension.mjs';
import { publicFixtureModules } from './public-fixture-modules.mjs';
import { validateExplicitFixturePolicy } from './fixture-policy.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const bytes = (v) => Buffer.from(JSON.stringify(v, null, 2) + '\n');
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
function fixture() {
  const rows = ['noori.hwp', 'noori.hwpx', 'picture-resize.hwp', 'textbox.hwp'].map((id) => {
    const value = Buffer.from('own synthetic parent ' + id);
    return {
      id,
      name: id,
      label: id,
      path: 'fixtures/' + id,
      bytes: value.length,
      sha256: sha(value),
      value,
    };
  });
  const baselineFiles = new Map(rows.map(({ path, value }) => [path, value]));
  const baseCatalog = bytes(
    rows.map(({ id, name, label }) => ({ id, name, label, available: true })),
  );
  baselineFiles.set('fixture-catalog.json', baseCatalog);
  baselineFiles.set('unchanged.js', Buffer.from('export const own = true;\n'));
  const basePolicy = {
    schemaVersion: 1,
    catalogSHA256: sha(baseCatalog),
    files: rows.map(({ value: _value, ...r }) => r),
  };
  const manifest = bytes({
    files: [...baselineFiles].map(([path, value]) => ({
      path,
      bytes: value.length,
      sha256: sha(value),
    })),
  });
  baselineFiles.set('manifest.json', manifest);
  const artifacts = new Map(),
    additions = [];
  for (const [index, kind] of ['picture', 'textbox'].entries()) {
    const id = 'hwp5-' + kind + '-outer-margins.hwp',
      value = Buffer.from('own synthetic derivative ' + kind),
      parent = rows[index + 2];
    const row = {
      id,
      name: id,
      label: kind,
      path: 'fixtures/' + id,
      bytes: value.length,
      sha256: sha(value),
    };
    artifacts.set(id, value);
    additions.push({
      row,
      parentId: parent.id,
      parentBytes: parent.bytes,
      parentSHA256: parent.sha256,
    });
  }
  const targetRows = [...basePolicy.files, ...additions.map(({ row }) => row)];
  const catalog = bytes(
    targetRows.map(({ id, name, label }) => ({ id, name, label, available: true })),
  );
  const targetPolicy = bytes({ schemaVersion: 1, catalogSHA256: sha(catalog), files: targetRows });
  const receipt = {
    schemaVersion: 1,
    feature: 'hwp5-outer-margins',
    baseCount: 4,
    targetCount: 6,
    baseManifestSHA256: sha(manifest),
    basePolicySHA256: sha(bytes(basePolicy)),
    baseCatalogSHA256: sha(baseCatalog),
    targetPolicySHA256: sha(targetPolicy),
    targetCatalogSHA256: sha(catalog),
    additions,
  };
  return {
    files: baselineFiles,
    baselineManifestBytes: manifest,
    baselinePolicyBytes: bytes(basePolicy),
    targetPolicyBytes: targetPolicy,
    receipt,
    artifacts,
  };
}
test('no extension performs no file IO or baseline change', async () => {
  assert.equal(
    await loadPublicFixtureExtension({
      receiptPath: undefined,
      read() {
        throw Error('must not read');
      },
    }),
    null,
  );
});
test('exact two derivatives preserve every old payload and expose only target catalog', () => {
  const input = fixture(),
    old = new Map(input.files),
    output = extendPublicFixtureFiles(input);
  assert.equal(output.policy.files.length, 6);
  assert.deepEqual(input.files, old);
  for (const [path, value] of old)
    if (!['manifest.json', 'fixture-catalog.json'].includes(path))
      assert.deepEqual(output.files.get(path), value);
  validateExplicitFixturePolicy(output.files, output.policy);
  assert.equal(output.files.has('manifest.json'), false);
  assert.equal(output.files.has('fixture-policy.json'), true);
  const modules = publicFixtureModules(output.policy);
  assert.match(modules.inventory, /hwp5-picture-outer-margins/);
  assert.doesNotMatch(modules.inventory, /sourcePath|parentSHA256|private/);
});
for (const [name, mutate] of [
  [
    'wrong old manifest hash',
    (x) => {
      x.baselineManifestBytes = bytes({ files: [] });
    },
  ],
  [
    'wrong old policy hash',
    (x) => {
      x.baselinePolicyBytes = bytes({});
    },
  ],
  [
    'changed old catalog',
    (x) => {
      x.files.set('fixture-catalog.json', bytes([]));
    },
  ],
  [
    'changed unrelated old file',
    (x) => {
      x.files.set('unchanged.js', Buffer.from('changed'));
    },
  ],
  [
    'extra unrelated old file',
    (x) => {
      x.files.set('unlisted.txt', Buffer.from('extra'));
    },
  ],
  [
    'changed derivative bytes',
    (x) => {
      x.artifacts.set(x.receipt.additions[0].row.id, Buffer.from('bad'));
    },
  ],
  [
    'missing derivative',
    (x) => {
      x.artifacts.delete(x.receipt.additions[0].row.id);
    },
  ],
  [
    'third artifact',
    (x) => {
      x.artifacts.set('extra.hwp', Buffer.from('extra'));
    },
  ],
  [
    'duplicate artifact ID',
    (x) => {
      x.receipt.additions[1] = x.receipt.additions[0];
    },
  ],
  [
    'overwrite existing ID',
    (x) => {
      x.receipt.additions[0].row.id = 'noori.hwp';
      x.artifacts.delete('hwp5-picture-outer-margins.hwp');
      x.artifacts.set('noori.hwp', Buffer.from('replacement'));
    },
  ],
  [
    'wrong published parent',
    (x) => {
      x.receipt.additions[0].parentSHA256 = '0'.repeat(64);
    },
  ],
  [
    'unapproved target row',
    (x) => {
      const p = JSON.parse(x.targetPolicyBytes);
      p.files[0].label = 'changed';
      x.targetPolicyBytes = bytes(p);
      x.receipt.targetPolicySHA256 = sha(x.targetPolicyBytes);
    },
  ],
  [
    'target catalog hash mismatch',
    (x) => {
      x.receipt.targetCatalogSHA256 = '0'.repeat(64);
    },
  ],
])
  test(name + ' fails atomically', () => {
    const input = fixture();
    mutate(input);
    const before = new Map(input.files);
    assert.throws(() => extendPublicFixtureFiles(input));
    assert.deepEqual(input.files, before);
  });
test('original policy rejects target128-style extra files while target policy authenticates all new bytes', () => {
  const input = fixture(),
    out = extendPublicFixtureFiles(input);
  assert.throws(() =>
    validateExplicitFixturePolicy(out.files, JSON.parse(input.baselinePolicyBytes)),
  );
  const tampered = new Map(out.files);
  tampered.set(input.receipt.additions[0].row.path, Buffer.from('x'));
  assert.throws(() => validateExplicitFixturePolicy(tampered, out.policy));
});
test('production receipt binds exact published parents, immutable two files and target128 metadata', async () => {
  const receiptBytes = await readFile(
    new URL('./hwp5-outer-margins-fixture-receipt.json', import.meta.url),
  );
  const receipt = JSON.parse(receiptBytes),
    base = await readFile(new URL('./public-gallery-fixtures-126.json', import.meta.url));
  const targetBytes = await readFile(
    new URL('./hwp5-outer-margins-fixture-policy.json', import.meta.url),
  );
  const target = JSON.parse(targetBytes);
  assert.equal(JSON.parse(base).files.length, 126);
  assert.equal(target.files.length, 128);
  assert.equal(sha(base), receipt.basePolicySHA256);
  assert.equal(sha(targetBytes), receipt.targetPolicySHA256);
  const catalog = bytes(
    target.files.map(({ id, name, label }) => ({ id, name, label, available: true })),
  );
  assert.equal(sha(catalog), receipt.targetCatalogSHA256);
  assert.equal(target.catalogSHA256, receipt.targetCatalogSHA256);
  for (const addition of receipt.additions) {
    const value = await readFile(join(sourceRoot, addition.sourcePath));
    assert.equal(value.length, addition.row.bytes);
    assert.equal(sha(value), addition.row.sha256);
    const parent = JSON.parse(base).files.find((r) => r.id === addition.parentId);
    assert.equal(parent.sha256, addition.parentSHA256);
    assert.equal(parent.bytes, addition.parentBytes);
  }
  assert.equal(receipt.producer.changedStreamOnly, 'BodyText/Section0');
  assert.equal(receipt.producer.layoutFreshnessClaim, false);
});
test('explicit loader rejects a different receipt path before reading it', async () => {
  let reads = 0;
  await assert.rejects(
    loadPublicFixtureExtension({
      root: sourceRoot,
      receiptPath: join(sourceRoot, 'arbitrary.json'),
      read() {
        reads++;
        throw Error('no');
      },
    }),
    /UnapprovedFixtureExtension/,
  );
  assert.equal(reads, 0);
});
test('explicit loader rejects tampered source receipt and receipt symlink', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'hwpjs-extension-unit-')));
  try {
    const path = join(dir, HWP5_MARGIN_RECEIPT);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes({ schemaVersion: 1 }));
    await assert.rejects(
      loadPublicFixtureExtension({ root: dir, receiptPath: path, read: readFile }),
      /UnapprovedFixtureReceipt/,
    );
    await rm(path);
    const other = join(dir, 'other.json');
    await writeFile(other, '{}');
    await symlink(other, path);
    await assert.rejects(
      loadPublicFixtureExtension({ root: dir, receiptPath: path, read: readFile }),
      /FixtureInputSymlink/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
