import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicFixtureModules } from '../pages-demo/public-fixture-modules.mjs';

const policy = {
  files: [
    {
      id: 'independent.hwp',
      name: 'Independent HWP',
      label: '합성 HWP',
      path: 'private/input.hwp',
      sha256: 'unused',
    },
    {
      id: 'independent.hwpx',
      name: 'Independent HWPX',
      label: '합성 HWPX',
      path: 'private/input.hwpx',
      bytes: 123,
    },
  ],
};

test('build boundary projects only public metadata and resolves exact approved IDs', async () => {
  const modules = publicFixtureModules(policy);
  assert.doesNotMatch(modules.inventory, /private|sha256|unused|bytes/);
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'public-demo-fixtures-')));
  try {
    await writeFile(join(dir, 'fixture-inventory.mjs'), modules.inventory);
    await writeFile(join(dir, 'fixture-catalog.mjs'), modules.catalog);
    const catalog = await import(pathToFileURL(join(dir, 'fixture-catalog.mjs')));
    const inventory = await import(pathToFileURL(join(dir, 'fixture-inventory.mjs')));
    assert.equal(catalog.demoFixtures, inventory.trackedDemoFixtures);
    assert.deepEqual(
      catalog.demoFixtures,
      policy.files.map(({ id, name, label }) => ({ id, name, label })),
    );
    assert.ok(Object.isFrozen(catalog.demoFixtures));
    assert.ok(catalog.demoFixtures.every(Object.isFrozen));
    for (const row of policy.files) {
      assert.equal(
        catalog.fixtureUrl(row.id),
        new URL('../fixtures/' + row.id, pathToFileURL(join(dir, 'fixture-catalog.mjs'))).href,
      );
    }
    for (const id of ['unknown.hwp', '../independent.hwp', '/independent.hwp']) {
      assert.throws(() => catalog.fixtureUrl(id), /UnknownDemoFixture/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unsafe public metadata fails closed before Vite', () => {
  assert.throws(
    () =>
      publicFixtureModules({
        files: [{ id: 'safe.hwp', name: '/Users/private/input.hwp', label: 'unsafe' }],
      }),
    /PrivateOrSourcePathInPublishedText/,
  );
});
