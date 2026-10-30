import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseDemoServerArguments } from '../../tools/demo-server-options.mjs';
import { loadDemoServerBundle } from '../../tools/demo-server-bundle.mjs';
import { demoFixtures } from '../../web/preview/fixture-catalog.mjs';
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const actualRoot = process.env.HWPJS_HOST_POLICY_ACTUAL_ROOT ?? process.cwd();
const parent = await realpath(process.env.HWPJS_HOST_POLICY_TEST_OUTPUT ?? tmpdir());
const workspace = await mkdtemp(join(parent, 'host-policy-'));
after(() => rm(workspace, { recursive: true, force: true }));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const license = await readFile(resolve(sourceRoot, 'LICENSE'));
const sourceNotices = await readFile(resolve(sourceRoot, 'docs/third-party-notices.md'), 'utf8');
let notices = sourceNotices;
for (const [name, file] of [
  ['react', 'LICENSE'],
  ['react-dom', 'LICENSE'],
  ['svelte', 'LICENSE.md'],
]) {
  const metadata = fileURLToPath(import.meta.resolve(name + '/package.json'));
  notices += '\n' + (await readFile(resolve(dirname(metadata), file), 'utf8'));
}
const actualPolicy = JSON.parse(
  await readFile(resolve(actualRoot, 'tools/pages-demo/public-gallery-fixtures.json'), 'utf8'),
);
const noori = ['noori.hwp', 'noori.hwpx'].map((id) => ({
  id,
  name: id,
  label: id,
  available: true,
}));
const gallery = actualPolicy.files.map((row) => ({
  id: row.id,
  name: row.name,
  label: row.label,
  available: true,
}));
const privateCatalog = demoFixtures.map(({ id, name, label }) => ({
  id,
  name,
  label: label ?? name,
  available: true,
}));
assert.equal(gallery.length, 101);
assert(privateCatalog.length > noori.length);
let counter = 0;
async function put(directory, files, extra = {}) {
  const manifest = {
    mode: 'frozen-dist-closure',
    base: 'relative',
    wasmSha256: hash(files.get('hwpjs/hwpjs.wasm')),
    ...extra,
    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })),
  };
  for (const [path, bytes] of files) {
    const output = resolve(directory, path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(resolve(directory, 'manifest.json'), bytes);
  return { directory, files, manifest, manifestSHA: hash(bytes) };
}
function baseFiles(catalog) {
  const files = new Map();
  for (const path of [
    'index.html',
    'demo/vanilla/index.html',
    'demo/react/index.html',
    'demo/svelte/index.html',
    'demo/headless/index.html',
    'api/index.html',
  ])
    files.set(path, Buffer.from('<main>단위검사</main>'));
  for (const path of [
    'api/main.js',
    'api/playground.js',
    'runtime/index.js',
    'runtime/runtime.js',
    'runtime/worker.js',
  ])
    files.set(path, Buffer.from('export {};\n'));
  files.set('hwpjs/hwpjs.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  files.set('LICENSE.txt', license);
  files.set('THIRD_PARTY_NOTICES.txt', Buffer.from(notices));
  files.set('fixture-catalog.json', Buffer.from(JSON.stringify(catalog, null, 2) + '\n'));
  for (const row of catalog) files.set('fixtures/' + row.id, Buffer.from('단위 fixture:' + row.id));
  return files;
}
async function publicCase(catalog) {
  const root = join(workspace, 'root-' + counter++);
  await mkdir(resolve(root, 'docs'), { recursive: true });
  await writeFile(resolve(root, 'LICENSE'), license);
  await writeFile(resolve(root, 'docs/third-party-notices.md'), sourceNotices);
  const bundle = await put(resolve(root, 'apps/docs/docs/public/editor'), baseFiles(catalog));
  const policy = {
    schemaVersion: 1,
    catalogSHA256: hash(bundle.files.get('fixture-catalog.json')),
    files: catalog.map((row) => ({
      id: row.id,
      name: row.name,
      label: row.label,
      path: 'fixtures/' + row.id,
      bytes: bundle.files.get('fixtures/' + row.id).length,
      sha256: hash(bundle.files.get('fixtures/' + row.id)),
    })),
  };
  const fixturePolicyPath = resolve(root, 'policy.json');
  await writeFile(fixturePolicyPath, JSON.stringify(policy));
  return { root, ...bundle, policy, fixturePolicyPath };
}
async function privateCase(publicBundle, change) {
  const files = baseFiles(noori);
  files.set('fixture-catalog.json', Buffer.from(JSON.stringify(privateCatalog)));
  const policy = {
    publicBaseManifestSHA256: publicBundle.manifestSHA,
    catalogCount: privateCatalog.length,
    workerSHA256: hash(files.get('runtime/worker.js')),
  };
  if (change) change(files, policy);
  return put(join(workspace, 'private-' + counter++), files, { privateDemo: policy });
}
const legacy = await publicCase(noori);
const current = await publicCase(gallery);
const goodPrivate = await privateCase(current);
const loadPublic = (fixturePolicyPath = current.fixturePolicyPath) =>
  loadDemoServerBundle(current.directory, { root: current.root, fixturePolicyPath });
const loadPrivate = (bundle, fixturePolicyPath = current.fixturePolicyPath) =>
  loadDemoServerBundle(bundle.directory, {
    root: current.root,
    privateFixtures: true,
    fixturePolicyPath,
  });
test('기본 옵션 객체 모양은 그대로', () => {
  assert.deepEqual(parseDemoServerArguments([], workspace), {
    port: 8082,
    bundleDirectory: undefined,
    privateFixtures: false,
  });
});
test('명시 옵션 두 표기는 같은 경로를 전달', () => {
  const a = parseDemoServerArguments(
    ['--bundle-dir', current.directory, '--fixture-policy', current.fixturePolicyPath],
    workspace,
  );
  const b = parseDemoServerArguments(
    ['--bundle-dir=' + current.directory, '--fixture-policy=' + current.fixturePolicyPath],
    workspace,
  );
  assert.deepEqual(a, b);
  assert.equal(a.fixturePolicyPath, current.fixturePolicyPath);
});
test('누락·중복·bundle 없는 정책 옵션 거부', () => {
  for (const args of [
    ['--bundle-dir=a', '--fixture-policy'],
    ['--bundle-dir=a', '--fixture-policy='],
    ['--bundle-dir=a', '--fixture-policy', '--private-fixtures'],
    ['--bundle-dir=a', '--fixture-policy=a', '--fixture-policy=b'],
    ['--fixture-policy=a'],
  ])
    assert.throws(() => parseDemoServerArguments(args, workspace));
});
test('기본 Noori2 양성 입력은 현재 공개101과 독립', async () => {
  const bundle = await loadDemoServerBundle(legacy.directory, { root: legacy.root });
  assert.equal(bundle.manifest.wasmSha256, legacy.manifest.wasmSha256);
});
test('명시 정책 없는 공개101은 여전히 거부', async () => {
  await assert.rejects(
    loadDemoServerBundle(current.directory, { root: current.root }),
    /UnapprovedFixture/,
  );
});
test('옵션에서 loader로 전달한 명시101 양성', async () => {
  const options = parseDemoServerArguments(
    ['--bundle-dir', current.directory, '--fixture-policy', current.fixturePolicyPath],
    current.root,
  );
  const bundle = await loadDemoServerBundle(options.bundleDirectory, {
    root: current.root,
    ...options,
  });
  assert.equal(bundle.manifest.wasmSha256, current.manifest.wasmSha256);
});
test('누락 정책 파일은 fallback 없이 거부', async () => {
  await assert.rejects(loadPublic(join(workspace, 'missing.json')), { code: 'ENOENT' });
});
test('깨진 JSON과 위조 schema·catalog SHA 거부', async () => {
  for (const [name, text] of [
    ['invalid', '{'],
    ['schema', '{}'],
    ['sha', JSON.stringify({ ...current.policy, catalogSHA256: '0'.repeat(64) })],
  ]) {
    const file = join(workspace, name + '.json');
    await writeFile(file, text);
    await assert.rejects(loadPublic(file));
  }
});
test('정책 regular file 조건 유지', async () => {
  await assert.rejects(loadPublic(workspace), /InvalidFixturePolicyFile/);
});
test('정책 파일 symlink 거부', async () => {
  const alias = join(workspace, 'policy-link.json');
  await symlink(current.fixturePolicyPath, alias);
  await assert.rejects(loadPublic(alias), /SymlinkBundlePath/);
});
test('정책 조상 symlink 거부', async () => {
  const alias = join(workspace, 'root-link');
  await symlink(current.root, alias);
  await assert.rejects(loadPublic(join(alias, 'policy.json')), /SymlinkBundlePath/);
});
test('public manifest symlink 거부 유지', async () => {
  const alias = join(workspace, 'bundle-link');
  await symlink(current.directory, alias);
  await assert.rejects(
    loadDemoServerBundle(alias, {
      root: current.root,
      fixturePolicyPath: current.fixturePolicyPath,
    }),
    /SymlinkBundlePath/,
  );
});
test('사설 catalog는 공개101 정책과 별도로 엄격 일치', async () => {
  const bundle = await loadPrivate(goodPrivate);
  assert.equal(bundle.manifest.privateDemo.catalogCount, privateCatalog.length);
});
test('옛 public2와 사설 catalog 기본 조합 유지', async () => {
  const privateBundle = await privateCase(legacy);
  const bundle = await loadDemoServerBundle(privateBundle.directory, {
    root: legacy.root,
    privateFixtures: true,
  });
  assert.equal(bundle.manifest.privateDemo.catalogCount, privateCatalog.length);
});
test('private의 공개 manifest pin 위조 거부', async () => {
  const bad = await privateCase(current, (_, policy) => {
    policy.publicBaseManifestSHA256 = '0'.repeat(64);
  });
  await assert.rejects(loadPrivate(bad), /InvalidPrivateDemoPolicy/);
});
test('private catalog 개수·ID 위조 거부', async () => {
  const count = await privateCase(current, (_, policy) => {
    policy.catalogCount = privateCatalog.length - 1;
  });
  await assert.rejects(loadPrivate(count), /InvalidPrivateDemoPolicy/);
  const id = await privateCase(current, (files) => {
    const rows = JSON.parse(files.get('fixture-catalog.json'));
    rows[0].id = 'other.hwp';
    files.set('fixture-catalog.json', Buffer.from(JSON.stringify(rows)));
  });
  await assert.rejects(loadPrivate(id), /PrivateCatalogMismatch/);
});
test('private Worker와 WASM drift 거부 유지', async () => {
  for (const path of ['runtime/worker.js', 'hwpjs/hwpjs.wasm']) {
    const bad = await privateCase(current, (files) => {
      files.set(
        path,
        path.endsWith('.js')
          ? Buffer.from('export const changed=true;')
          : Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 0]),
      );
    });
    await assert.rejects(loadPrivate(bad), /PrivateEngineDrift/);
  }
});
test('실제 serve entry도 누락·위조 정책을 전달해 bind 전에 거부', async () => {
  const bad = join(workspace, 'bad-entry.json');
  await writeFile(bad, '{}');
  for (const [policyPath, message] of [
    [join(workspace, 'entry-missing.json'), 'ENOENT'],
    [bad, 'InvalidExplicitFixturePolicy'],
  ]) {
    const child = spawnSync(
      process.execPath,
      [
        resolve(sourceRoot, 'tools/serve-demo.mjs'),
        '--bundle-dir',
        current.directory,
        '--fixture-policy',
        policyPath,
      ],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, new RegExp(message));
    assert.doesNotMatch(child.stderr, /InvalidServerArgument|EADDRINUSE/);
  }
});
