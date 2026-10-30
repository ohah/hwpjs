import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { validateExplicitFixturePolicy } from '../../tools/pages-demo/fixture-policy.mjs';
import { validateProductionBundle } from '../../tools/pages-demo/bundle-production.mjs';
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = process.env.HWPJS_FIXTURE_POLICY_TEST_ROOT ?? projectRoot;
const baselineDirectory =
  process.env.HWPJS_FIXTURE_POLICY_TEST_BASELINE ??
  resolve(projectRoot, 'apps/docs/docs/public/editor');
const policy = JSON.parse(
  await readFile(
    new URL('../../tools/pages-demo/public-gallery-fixtures.json', import.meta.url),
    'utf8',
  ),
);
const data = JSON.parse(
  await readFile(
    new URL('../../tools/pages-demo/public-gallery-sources.json', import.meta.url),
    'utf8',
  ),
);
const inputManifest = JSON.parse(
  await readFile(resolve(baselineDirectory, 'manifest.json'), 'utf8'),
);
const parent = await realpath(process.env.HWPJS_FIXTURE_POLICY_TEST_TMP ?? tmpdir());
const workspace = await mkdtemp(join(parent, 'hwpjs-fixture-policy-'));
const directory = join(workspace, 'gallery');
const noori2Directory = join(workspace, 'noori2');
after(() => rm(workspace, { recursive: true, force: true }));
const files = new Map();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safe = (path) => {
  if (
    typeof path !== 'string' ||
    path.startsWith('/') ||
    path.split('/').some((p) => !p || p === '.' || p === '..') ||
    /hwpers|title-column/i.test(path)
  )
    throw Error('UnsafeTestInput');
  return path;
};
for (const row of inputManifest.files) {
  const bytes = await readFile(resolve(baselineDirectory, safe(row.path)));
  if (bytes.length !== row.bytes || sha(bytes) !== row.sha256)
    throw Error('BaselineTestInputDrift');
  files.set(row.path, bytes);
}
for (const row of policy.files) {
  let bytes = files.get(row.path);
  if (!bytes) {
    const provider = process.env.HWPJS_FIXTURE_POLICY_TEST_PROVIDER;
    const path = provider
      ? resolve(provider, safe(row.id))
      : resolve(projectRoot, safe(data.sourcePaths[row.id]));
    bytes = await readFile(path);
  }
  if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw Error('FixtureTestInputDrift');
  files.set(row.path, bytes);
}
const catalog = policy.files.map((row) => ({
  id: row.id,
  name: row.name,
  label: row.label,
  available: true,
}));
files.set('fixture-catalog.json', Buffer.from(JSON.stringify(catalog, null, 2) + '\n'));
if (sha(files.get('fixture-catalog.json')) !== policy.catalogSHA256)
  throw Error('CatalogTestInputDrift');
const manifest = {
  ...inputManifest,
  fixtures: policy.files.map((row) => row.id),
  files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })),
};
files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
for (const [path, bytes] of files) {
  const output = resolve(directory, safe(path));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
}
// 현재 공개 갤러리 크기와 독립적으로 기본 Noori2 계약을 검증합니다.
const noori2Files = new Map(
  [...files].filter(
    ([path]) =>
      path !== 'manifest.json' &&
      (!path.startsWith('fixtures/') ||
        path === 'fixtures/noori.hwp' ||
        path === 'fixtures/noori.hwpx'),
  ),
);
const noori2Catalog = ['noori.hwp', 'noori.hwpx'].map((id) => ({
  id,
  name: id,
  label: id,
  available: true,
}));
noori2Files.set('fixture-catalog.json', Buffer.from(JSON.stringify(noori2Catalog, null, 2) + '\n'));
const noori2Manifest = {
  ...inputManifest,
  fixtures: ['noori.hwp', 'noori.hwpx'],
  files: [...noori2Files].map(([path, bytes]) => ({
    path,
    bytes: bytes.length,
    sha256: sha(bytes),
  })),
};
noori2Files.set('manifest.json', Buffer.from(JSON.stringify(noori2Manifest, null, 2) + '\n'));
for (const [path, bytes] of noori2Files) {
  const output = resolve(noori2Directory, safe(path));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
}
const copy = () => JSON.parse(JSON.stringify(policy));
test('명시101 정책은 정확 payload를 허용', () => validateExplicitFixturePolicy(files, policy));
test('추가 payload 거부', () => {
  const x = new Map(files);
  x.set('fixtures/extra.hwp', Buffer.from('x'));
  assert.throws(() => validateExplicitFixturePolicy(x, policy));
});
test('누락 payload 거부', () => {
  const x = new Map(files);
  x.delete(policy.files[0].path);
  assert.throws(() => validateExplicitFixturePolicy(x, policy));
});
test('중복 ID 거부', () => {
  const x = copy();
  x.files[1] = x.files[0];
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('경로와 ID 불일치 거부', () => {
  const x = copy();
  x.files[0].path = 'fixtures/other.hwp';
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('bytes 불일치 거부', () => {
  const x = copy();
  x.files[0].bytes++;
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('SHA 불일치 거부', () => {
  const x = copy();
  x.files[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('catalog 바이트 불일치 거부', () => {
  const x = new Map(files);
  x.set('fixture-catalog.json', Buffer.from('[]'));
  assert.throws(() => validateExplicitFixturePolicy(x, policy));
});
test('정책 알 수 없는 키 거부', () => {
  const x = copy();
  x.extra = true;
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('내부 URL label 거부', () => {
  const x = copy();
  x.files[0].label = 'https://sample.ts.net';
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('보호 이름 거부', () => {
  const x = copy();
  x.files[0].id = 'hwpers.hwp';
  x.files[0].path = 'fixtures/hwpers.hwp';
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('Noori 기존 별칭 누락 거부', () => {
  const x = copy();
  x.files = x.files.filter((r) => r.id !== 'noori.hwp');
  assert.throws(() => validateExplicitFixturePolicy(files, x));
});
test('기본 Noori2 정규 계약 유지', async () => {
  await validateProductionBundle(noori2Directory, { root });
});
test('기본 계약은 명시정책없는101 거부', async () => {
  await assert.rejects(validateProductionBundle(directory, { root }), /UnapprovedFixture/);
});
test('명시101은 나머지 정규 production검사도 통과', async () => {
  await validateProductionBundle(directory, { root, fixturePolicy: policy });
});
