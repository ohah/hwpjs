import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUiLicenseInputs, UI_LICENSE_FILES } from '../pages-demo/ui-license-inputs.mjs';

function fixture() {
  const files = new Map([
    ['/repo/LICENSE', Buffer.from('Project license')],
    ['/repo/docs/third-party-notices.md', Buffer.from('HANCOM format reference\n')],
  ]);
  for (const [name, license] of UI_LICENSE_FILES) {
    files.set(
      `/repo/node_modules/${name}/package.json`,
      Buffer.from(
        JSON.stringify({
          name,
          version: name === 'svelte' ? '5.57.2' : '19.3.1',
          license: 'MIT',
        }),
      ),
    );
    files.set(
      `/repo/node_modules/${name}/${license}`,
      Buffer.from(`Complete MIT text for ${name}`),
    );
  }
  const options = {
    root: '/repo',
    resolvePackage: (name) => `/repo/node_modules/${name}/package.json`,
    read: async (path) => {
      assert(files.has(path), 'UnexpectedDependencySourceRead:' + path);
      return files.get(path);
    },
  };
  return { files, options };
}

test('dependency upgrades refresh notice versions even when full license bytes stay identical', async () => {
  const { files, options } = fixture();
  const before = await collectUiLicenseInputs(options);
  files.set(
    '/repo/node_modules/svelte/package.json',
    Buffer.from(
      JSON.stringify({
        name: 'svelte',
        version: '5.57.3',
        license: 'MIT',
      }),
    ),
  );
  const after = await collectUiLicenseInputs(options);
  assert.equal(before.manifest.packages[2].version, '5.57.2');
  assert.equal(after.manifest.packages[2].version, '5.57.3');
  assert.equal(before.manifest.packages[2].licenseSha256, after.manifest.packages[2].licenseSha256);
  assert.match(after.notices.toString(), /svelte 5\.57\.3/);
  assert.doesNotMatch(after.notices.toString(), /svelte 5\.57\.2/);
  assert.match(after.notices.toString(), /HANCOM format reference/);
  for (const [name] of UI_LICENSE_FILES)
    assert(after.notices.includes(`Complete MIT text for ${name}`));
  assert.equal(after.project.toString(), 'Project license');
});

test('unexpected metadata and missing license text cannot become published notice metadata', async () => {
  for (const metadata of [
    { name: 'other', version: '1', license: 'MIT' },
    { name: 'react', version: '', license: 'MIT' },
    { name: 'react', version: '1', license: 'GPL-3.0' },
  ]) {
    const { files, options } = fixture();
    files.set('/repo/node_modules/react/package.json', Buffer.from(JSON.stringify(metadata)));
    await assert.rejects(collectUiLicenseInputs(options), /UnexpectedPackageLicense:react/);
  }
  const { files, options } = fixture();
  files.set('/repo/node_modules/react/LICENSE', Buffer.alloc(0));
  await assert.rejects(collectUiLicenseInputs(options), /EmptyDependencyLicense:react/);
});
