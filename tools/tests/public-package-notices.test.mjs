import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import {
  collectPublicPackageNotices,
  composePublicPackageNotices,
} from '../public-package-notices.mjs';

test('공개 고지는 한컴 원문과 프로젝트 고지 및 의존성 LICENSE/NOTICE 전문을 함께 보존한다', async (t) => {
  const f = await fixture(t);
  const license = '\uFEFF원문 LICENSE\r\n마지막 줄';
  const notice = '원문 NOTICE\n';
  const p = await f.pkg('node_modules/fixture', undefined, { LICENSE: license, NOTICE: notice });
  const project = await readFile(
    new URL('../../docs/third-party-notices.md', import.meta.url),
    'utf8',
  );
  const exactHancom =
    '본 제품은 한글과컴퓨터의 \uF53A글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
  const bundled = await f.collect([p.entry]);
  const output = composePublicPackageNotices(project, bundled);
  assert.ok(output.includes(exactHancom), '한컴 참고 고지가 생성된 배포 고지에 있어야 합니다.');
  assert.ok(output.startsWith(project), '프로젝트 고지 전체 원문을 보존해야 합니다.');
  assert.equal(output.split(exactHancom).length - 1, 1);
  assert.ok(output.includes('## Bundled dependency: fixture@1.2.3'));
  assert.ok(output.includes('SPDX: MIT'));
  assert.ok(output.includes(license));
  assert.ok(output.includes(notice));
});

test('프로젝트 고지 없이 의존성 고지만 배포하지 않으며 의존성 없는 고지도 보존한다', () => {
  for (const missing of [undefined, null, '', ' \n'])
    assert.throws(() => composePublicPackageNotices(missing, 'LICENSE'), /MissingProjectNotices/);
  assert.throws(() => composePublicPackageNotices('고지', undefined), /InvalidBundledNotices/);
  assert.equal(composePublicPackageNotices('고지\r\n', ''), '고지\r\n');
});

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hwpjs-notices-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  async function file(path, contents) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    return path;
  }
  async function pkg(
    relativePath,
    info = { name: 'fixture', version: '1.2.3', license: 'MIT' },
    licenseFiles = { LICENSE: 'Exact license\nCopyright fixture\n' },
  ) {
    const base = join(root, relativePath);
    await file(join(base, 'package.json'), typeof info === 'string' ? info : JSON.stringify(info));
    for (const [name, text] of Object.entries(licenseFiles)) await file(join(base, name), text);
    return { base, entry: await file(join(base, 'dist/nested/index.js'), 'export {};\n') };
  }
  const observe = async (path, category) => {
    calls.push({ path, category });
    return readFile(path);
  };
  return {
    root,
    file,
    pkg,
    observe,
    calls,
    collect: (sourcePaths) => collectPublicPackageNotices({ root, sourcePaths, observe }),
  };
}

test('Bun/private scoped packages: full original license and NOTICE, duplicate modules pinned once', async (t) => {
  const f = await fixture(t);
  const text = '\uFEFFCopyright example\r\n\r\nFull license with no final newline';
  const p = await f.pkg(
    'packages/cli/node_modules/.bun/@sdk+server@2/node_modules/@sdk/server',
    { name: '@sdk/server', version: '2.4.0', license: 'Apache-2.0' },
    { 'LICENSE.txt': text, NOTICE: 'Upstream NOTICE\nall lines\n' },
  );
  const second = await f.file(join(p.base, 'dist/nested/other.js'), 'export {};');
  const output = await f.collect([
    p.entry,
    second,
    p.entry,
    join(f.root, 'src/not-an-installed-file.js'),
  ]);
  assert.equal(output.split('## Bundled dependency: ').length - 1, 1);
  assert.ok(output.includes('@sdk/server@2.4.0'));
  assert.ok(output.includes('SPDX: Apache-2.0'));
  assert.ok(output.includes(text));
  assert.ok(output.includes('Upstream NOTICE\nall lines\n'));
  assert.deepEqual(
    f.calls.map(({ path, category }) => [relative(p.base, path), category]),
    [
      ['package.json', 'bundled-dependency-package'],
      ['LICENSE.txt', 'bundled-dependency-license'],
      ['NOTICE', 'bundled-dependency-license'],
    ],
  );
});

test('Zod module-scope manifests are pinned then inherit the nearest named package', async (t) => {
  const f = await fixture(t);
  const p = await f.pkg(
    'node_modules/.bun/zod@4/node_modules/zod',
    { name: 'zod', version: '4.6.7', license: 'MIT' },
    { 'license.md': 'lowercase license\n', 'notice.txt': 'lowercase notice\n' },
  );
  await f.file(
    join(p.base, 'v4/package.json'),
    JSON.stringify({ type: 'module', main: './index.cjs', sideEffects: false }),
  );
  await f.file(
    join(p.base, 'v4/core/package.json'),
    JSON.stringify({ type: 'module', types: './index.d.ts' }),
  );
  const a = await f.file(join(p.base, 'v4/core/a.js'), '');
  const b = await f.file(join(p.base, 'v4/core/b.js'), '');
  const output = await f.collect([a, b]);
  assert.match(output, /zod@4\.6\.7/);
  assert.ok(output.includes('lowercase license\n'));
  assert.equal(f.calls.filter((x) => x.category === 'bundled-dependency-package').length, 3);
  assert.equal(new Set(f.calls.map((x) => x.path)).size, f.calls.length);
});

test('identical name/version in distinct installed roots retains both license texts, aliases deduplicate', async (t) => {
  const f = await fixture(t);
  const a = await f.pkg('node_modules/a', undefined, { LICENSE: 'First installed copy\n' });
  const b = await f.pkg('packages/cli/node_modules/a', undefined, {
    'LICENSE.md': 'Second installed copy\n',
  });
  await symlink(a.base, join(f.root, 'node_modules/alias'), 'dir');
  const out = await f.collect([
    b.entry,
    join(f.root, 'node_modules/alias/dist/nested/index.js'),
    a.entry,
  ]);
  assert.equal(out.split('## Bundled dependency: ').length - 1, 2);
  assert.ok(out.includes('First installed copy\n'));
  assert.ok(out.includes('Second installed copy\n'));
  assert.equal(out, await f.collect([a.entry, b.entry]));
});

test('all recognized license and NOTICE files are preserved, including SPDX expressions', async (t) => {
  const f = await fixture(t);
  const p = await f.pkg(
    'node_modules/multi',
    { name: 'multi', version: '1.0.0-beta.1', license: '(MIT OR Apache-2.0) AND BSD-3-Clause' },
    {
      LICENSE: 'MIT full text',
      'license.txt': 'Apache full text',
      'NOTICE.md': 'Attribution full text',
    },
  );
  const out = await f.collect([p.entry]);
  for (const text of ['MIT full text', 'Apache full text', 'Attribution full text'])
    assert.ok(out.includes(text));
});

test('no dependency source returns no sections or metadata reads', async (t) => {
  const f = await fixture(t);
  assert.equal(await f.collect([join(f.root, 'src/unused.js')]), '');
  assert.equal(f.calls.length, 0);
});

test('rejects outside-root, prefix-sibling and relative inputs before reading metadata', async (t) => {
  const f = await fixture(t);
  for (const source of [
    join(dirname(f.root), 'outside/node_modules/a/a.js'),
    f.root + '-sibling/node_modules/a.js',
  ]) {
    await assert.rejects(f.collect([source]), /BundledDependencyOutsideRoot/);
  }
  await assert.rejects(
    f.collect(['node_modules/a/index.js']),
    /InvalidBundledDependencySourcePath/,
  );
  assert.equal(f.calls.length, 0);
});

test('symlinked source/license/metadata cannot escape the root', async (t) => {
  const f = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'hwpjs-notices-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'external.js'), '');
  await mkdir(join(f.root, 'node_modules'), { recursive: true });
  await symlink(outside, join(f.root, 'node_modules/escape'), 'dir');
  await assert.rejects(
    f.collect([join(f.root, 'node_modules/escape/external.js')]),
    /BundledDependencyOutsideRoot/,
  );
  const p = await f.pkg('node_modules/license-escape', undefined, {});
  await symlink(join(outside, 'external.js'), join(p.base, 'LICENSE'));
  await assert.rejects(f.collect([p.entry]), /BundledDependencyOutsideRoot/);
  const q = await f.pkg('node_modules/metadata-escape');
  await rm(join(q.base, 'package.json'));
  await symlink(join(outside, 'external.js'), join(q.base, 'package.json'));
  await assert.rejects(f.collect([q.entry]), /BundledDependencyOutsideRoot/);
});

for (const [label, info, pattern] of [
  ['corrupt JSON', '{broken', /InvalidBundledDependencyPackageJSON/],
  ['non-object JSON', 'null', /InvalidBundledDependencyPackage/],
  ['missing identity', {}, /InvalidBundledDependencyPackageIdentity/],
  [
    'partial identity',
    { name: 'partial', type: 'module' },
    /InvalidBundledDependencyPackageIdentity/,
  ],
  ['missing SPDX', { name: 'missing', version: '1.0.0' }, /InvalidBundledDependencySPDX/],
  [
    'unknown SPDX',
    { name: 'unknown', version: '1.0.0', license: 'DefinitelyNotSPDX' },
    /UnknownBundledDependencyLicense/,
  ],
  [
    'malformed SPDX',
    { name: 'bad', version: '1.0.0', license: 'MIT OR' },
    /UnknownBundledDependencyLicense/,
  ],
  ...[
    'GPL-2.0-only',
    'LGPL-2.1-or-later',
    'MIT OR GPL-3.0-only',
    '(MIT AND LGPL-3.0-only)',
    'AGPL-3.0-only',
  ].map((license) => [
    license,
    { name: 'forbidden', version: '1.0.0', license },
    /ForbiddenBundledDependencyLicense/,
  ]),
]) {
  test(`rejects ${label} rather than omitting bundled attribution`, async (t) => {
    const f = await fixture(t);
    const p = await f.pkg('node_modules/bad', info);
    await assert.rejects(f.collect([p.entry]), pattern);
  });
}

test('missing/empty/invalid UTF8 license fails; parent workspace license cannot substitute', async (t) => {
  const f = await fixture(t);
  await f.file(join(f.root, 'LICENSE'), 'Unrelated workspace license');
  const p = await f.pkg('node_modules/missing', undefined, {});
  await assert.rejects(f.collect([p.entry]), /BundledDependencyLicenseMissing/);
  await f.file(join(p.base, 'LICENSE'), ' \n');
  await assert.rejects(f.collect([p.entry]), /EmptyBundledDependencyLicense/);
  await f.file(join(p.base, 'LICENSE'), Buffer.from([0xff]));
  await assert.rejects(f.collect([p.entry]), /InvalidBundledDependencyUTF8/);
});

test('missing package metadata never borrows enclosing workspace identity', async (t) => {
  const f = await fixture(t);
  await f.file(
    join(f.root, 'package.json'),
    JSON.stringify({ name: 'workspace', version: '1.0.0', license: 'MIT' }),
  );
  const entry = await f.file(join(f.root, 'node_modules/missing/dist/index.js'), '');
  await assert.rejects(f.collect([entry]), /BundledDependencyPackageMissing/);
});

test('observer errors propagate and non-Buffer results cannot bypass byte pinning', async (t) => {
  const f = await fixture(t);
  const p = await f.pkg('node_modules/observer');
  await assert.rejects(
    collectPublicPackageNotices({
      root: f.root,
      sourcePaths: [p.entry],
      observe: async () => {
        throw Error('SourceChangedDuringBuild');
      },
    }),
    /SourceChangedDuringBuild/,
  );
  await assert.rejects(
    collectPublicPackageNotices({
      root: f.root,
      sourcePaths: [p.entry],
      observe: async () => '{}',
    }),
    /InvalidBundledDependencyObservedBytes/,
  );
});
