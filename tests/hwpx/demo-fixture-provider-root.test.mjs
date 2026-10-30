import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  symlink,
  rm,
  readFile,
  stat,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { parseDemoServerArguments } from '../../tools/demo-server-options.mjs';
import { resolveDemoFixtureProviderRoot } from '../../tools/demo-fixture-provider-root.mjs';
import { respondDemoFixture } from '../../tools/demo-fixture-response.mjs';
import { respondDemoFixtureCatalog } from '../../tools/demo-fixture-catalog-response.mjs';
import { demoFixtures, fixtureUrl } from '../../web/preview/fixture-catalog.mjs';
const workspace = await realpath(await mkdtemp(join(tmpdir(), 'fixture-provider-')));
after(() => rm(workspace, { recursive: true, force: true }));
const host = join(workspace, 'host');
const provider = join(workspace, 'provider');
await mkdir(host);
await mkdir(provider);
const fixture = demoFixtures.find((row) => row.id === '1e31c368b7754009-noori.hwp');
assert(fixture, '명시 Noori allowlist 항목이 필요합니다');
assert(!/hwpers|title-column/i.test(fixture.path));
const selected = resolve(provider, fixture.path);
const bytes = Buffer.from('정규 임시 provider의 명시 허용목록 한 파일');
await mkdir(dirname(selected), { recursive: true });
await writeFile(selected, bytes);
const sink = () => ({
  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
  },
  end(body) {
    this.body = body;
  },
});
const privateArgs = ['--bundle-dir=private', '--private-fixtures'];

test('생략 시 기존 default 객체 모양과 root를 그대로 보존', async () => {
  assert.deepEqual(parseDemoServerArguments([], host), {
    port: 8082,
    bundleDirectory: undefined,
    privateFixtures: false,
  });
  assert.deepEqual(parseDemoServerArguments(privateArgs, host), {
    port: 8082,
    bundleDirectory: resolve(host, 'private'),
    privateFixtures: true,
  });
  const absent = join(workspace, '기존-미검사-root');
  assert.equal(await resolveDemoFixtureProviderRoot(absent), absent);
});
test('fixture-root 두 표기는 같은 경로이며 옵션 순서와 무관', () => {
  const a = parseDemoServerArguments([...privateArgs, '--fixture-root', provider], host);
  const b = parseDemoServerArguments(['--fixture-root=' + provider, ...privateArgs], host);
  assert.deepEqual(a, b);
  assert.equal(a.fixtureRoot, provider);
});
test('상대 provider는 bundle root 기준으로만 해석', () => {
  assert.equal(
    parseDemoServerArguments([...privateArgs, '--fixture-root=../provider'], host).fixtureRoot,
    provider,
  );
});
test('값 누락·빈값·다음 옵션을 값으로 쓰는 입력 거부', () => {
  for (const args of [
    [...privateArgs, '--fixture-root'],
    [...privateArgs, '--fixture-root='],
    [...privateArgs, '--fixture-root', '--fixture-policy=x'],
  ])
    assert.throws(() => parseDemoServerArguments(args, host), /MissingFixtureRoot/);
});
test('분리·등호 표기를 섞어도 중복 provider 거부', () => {
  assert.throws(
    () =>
      parseDemoServerArguments([...privateArgs, '--fixture-root=a', '--fixture-root', 'b'], host),
    /DuplicateFixtureRoot/,
  );
});
test('dev·공개bundle·bundle없는 private에서는 provider 옵션 거부', () => {
  for (const args of [
    ['--fixture-root=a'],
    ['--bundle-dir=p', '--fixture-root=a'],
    ['--private-fixtures', '--fixture-root=a'],
  ])
    assert.throws(() => parseDemoServerArguments(args, host), /FixtureRootRequiresPrivateBundle/);
});
test('명시 canonical directory만 허용하고 없는 경로·regular file 거부', async () => {
  assert.equal(await resolveDemoFixtureProviderRoot(host, provider), provider);
  await assert.rejects(resolveDemoFixtureProviderRoot(host, join(workspace, 'missing')), {
    code: 'ENOENT',
  });
  await assert.rejects(
    resolveDemoFixtureProviderRoot(host, selected),
    /InvalidFixtureRootDirectory/,
  );
  for (const value of ['', null, 1])
    await assert.rejects(resolveDemoFixtureProviderRoot(host, value), /InvalidFixtureRoot/);
});
test('provider 자체와 조상 symlink는 canonical directory 검사에서 거부', async () => {
  const alias = join(workspace, 'provider-alias');
  await symlink(provider, alias);
  await assert.rejects(resolveDemoFixtureProviderRoot(host, alias), /NonCanonicalFixtureRoot/);
  await assert.rejects(
    resolveDemoFixtureProviderRoot(host, join(alias, dirname(fixture.path))),
    /NonCanonicalFixtureRoot/,
  );
});
test('분리된 provider의 한 허용 파일만 GET200·정확바이트·bodyless HEAD', async () => {
  const chosen = await resolveDemoFixtureProviderRoot(host, provider);
  for (const path of [fixtureUrl(fixture.id), '/demo-fixtures/' + fixture.id])
    for (const method of ['GET', 'HEAD']) {
      const response = sink();
      assert.equal(await respondDemoFixture(chosen, path, method, response), true);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, method === 'GET' ? bytes : undefined);
    }
  await assert.rejects(readFile(resolve(host, fixture.path)), { code: 'ENOENT' });
});
test('임시 한 파일의 catalog만 실제 IO하고 미선택 provider 경로는 조사하지 않음', async () => {
  const io = {
    async realpath(path) {
      if (path !== selected) throw Object.assign(Error('미선택'), { code: 'ENOENT' });
      return realpath(path);
    },
    async stat(path) {
      assert.equal(path, selected);
      return stat(path);
    },
    async access(path, mode) {
      assert.equal(path, selected);
      return access(path, mode);
    },
  };
  const response = sink();
  await respondDemoFixtureCatalog(provider, '/demo-fixture-catalog.json', 'GET', response, io);
  const rows = JSON.parse(response.body);
  assert.equal(rows.length, demoFixtures.length);
  assert.deepEqual(
    rows.filter((row) => row.available).map((row) => row.id),
    [fixture.id],
  );
});
test('알 수 없는 이름·traversal·임의 경로는 provider IO 전에 거부', async () => {
  const io = {
    async realpath() {
      assert.fail('IO 금지');
    },
    async readFile() {
      assert.fail('IO 금지');
    },
  };
  for (const path of [
    '/demo-fixtures/../LICENSE',
    '/demo-fixtures/unknown.hwp',
    '/demo-fixtures/' + fixture.id + '/extra',
  ]) {
    const response = sink();
    await respondDemoFixture(provider, path, 'GET', response, io);
    assert.equal(response.status, 404);
  }
});
test('허용 이름도 provider 밖 symlink라면 바이트읽기 없이 strict 거부', async () => {
  const escapeProvider = join(workspace, 'escape-provider'),
    target = resolve(escapeProvider, fixture.path);
  await mkdir(dirname(target), { recursive: true });
  await symlink(selected, target);
  let reads = 0;
  const response = sink();
  await respondDemoFixture(escapeProvider, fixtureUrl(fixture.id), 'GET', response, {
    realpath,
    async readFile() {
      reads++;
      assert.fail('탈출 파일 읽기 금지');
    },
  });
  assert.equal(response.status, 404);
  assert.equal(reads, 0);
  const catalog = sink();
  let stats = 0;
  await respondDemoFixtureCatalog(escapeProvider, '/demo-fixture-catalog.json', 'GET', catalog, {
    async realpath(path) {
      if (path !== target) throw Error('미선택');
      return realpath(path);
    },
    async stat() {
      stats++;
      assert.fail('탈출 stat 금지');
    },
    async access() {
      assert.fail('탈출 access 금지');
    },
  });
  assert.equal(JSON.parse(catalog.body).find((row) => row.id === fixture.id).available, false);
  assert.equal(stats, 0);
});

// 실제 serve entry의 의존성만 주입해 request callback을 검사합니다. socket은 만들지 않습니다.
async function entryHarness(explicit) {
  const source = await readFile(new URL('../../tools/serve-demo.mjs', import.meta.url), 'utf8');
  const calls = [];
  let callback;
  const entryURL = new URL('file://' + join(host, 'tools/serve-demo.mjs')).href;
  const dependencies = {
    './demo-fixture-provider-root.mjs': { resolveDemoFixtureProviderRoot },
    './demo-server-options.mjs': { parseDemoServerArguments },
    './demo-server-bundle.mjs': {
      async loadDemoServerBundle(directory, options) {
        calls.push({ kind: 'bundle', directory, options });
        return {
          primaryWasm: Buffer.from('테스트'),
          async respond(path) {
            calls.push({ kind: 'bundle-response', path });
          },
        };
      },
    },
    'node:http': {
      createServer(fn) {
        callback = fn;
        return {
          listen() {
            calls.push({ kind: 'mock-listen' });
          },
        };
      },
    },
    'node:fs/promises': {
      async readFile() {
        assert.fail('entry 파일읽기 금지');
      },
      async readdir() {
        assert.fail('entry 디렉터리 조사 금지');
      },
    },
    'node:path': { resolve, extname: (path) => path.slice(path.lastIndexOf('.')) },
    'node:url': { fileURLToPath: (url) => decodeURIComponent(new URL(url).pathname) },
    './demo-fixture-response.mjs': {
      async respondDemoFixture(root, path) {
        calls.push({ kind: 'fixture', root, path });
        return path.startsWith('/demo-fixtures/');
      },
    },
    './demo-fixture-catalog-response.mjs': {
      async respondDemoFixtureCatalog(root, path) {
        calls.push({ kind: 'catalog', root, path });
        return path === '/demo-fixture-catalog.json';
      },
    },
    './preview-wasm-compression.mjs': {
      createPreviewWasmCompression: () => () => ({ bytes: Buffer.from('테스트') }),
    },
    './demo-documentation-response.mjs': {
      async loadDemoDocumentation(root) {
        calls.push({ kind: 'documentation', root });
        return { respond: () => false };
      },
    },
  };
  const transformed = source
    .replace(
      /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,
      (_, names, spec) => `const {${names}}=dependencies[${JSON.stringify(spec)}];`,
    )
    .replaceAll('import.meta.url', 'entryURL');
  assert(!/^import /m.test(transformed));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('dependencies', 'entryURL', 'process', transformed)(
    dependencies,
    entryURL,
    {
      argv: [
        'node',
        'entry',
        ...privateArgs,
        '--fixture-policy=policy.json',
        ...(explicit ? ['--fixture-root=' + provider] : []),
      ],
    },
  );
  return {
    calls,
    async request(path) {
      await callback({ url: path, method: 'GET', headers: {} }, sink());
    },
  };
}
test('serve는 bundle·publicBase·license root를 host로 두고 fixture 경로만 provider로 전달', async () => {
  const entry = await entryHarness(true);
  const call = entry.calls.find((row) => row.kind === 'bundle');
  assert.equal(call.options.root, host + '/');
  assert.equal(call.options.fixturePolicyPath, join(host, 'policy.json'));
  assert.equal(call.options.fixtureRoot, undefined);
  assert.equal(entry.calls.find((row) => row.kind === 'documentation').root, host + '/');
  for (const path of [
    '/demo-fixture-catalog.json',
    '/demo-fixtures/' + fixture.id,
    '/hwpjs/editor/fixture-catalog.json',
    '/docs/editor/fixture-catalog.json',
    '/hwpjs/editor/fixtures/' + fixture.id,
    '/docs/editor/fixtures/' + fixture.id,
  ])
    await entry.request(path);
  const handlers = entry.calls.filter((row) => row.kind === 'fixture' || row.kind === 'catalog');
  assert(handlers.length >= 6);
  assert(handlers.every((row) => row.root === provider));
  await entry.request('/docs/editor/runtime/worker.js');
  assert(
    entry.calls.some(
      (row) => row.kind === 'bundle-response' && row.path === '/docs/editor/runtime/worker.js',
    ),
  );
});
test('fixture-root 없는 serve는 기존 root·bundle 별칭 분기 순서를 보존', async () => {
  const entry = await entryHarness(false);
  await entry.request('/demo-fixtures/' + fixture.id);
  assert(
    entry.calls
      .filter((row) => row.kind === 'fixture' || row.kind === 'catalog')
      .every((row) => row.root === host + '/'),
  );
  const before = entry.calls.filter(
    (row) => row.kind === 'fixture' || row.kind === 'catalog',
  ).length;
  await entry.request('/docs/editor/fixture-catalog.json');
  assert.equal(
    entry.calls.filter((row) => row.kind === 'fixture' || row.kind === 'catalog').length,
    before,
  );
  assert(
    entry.calls.some(
      (row) => row.kind === 'bundle-response' && row.path === '/docs/editor/fixture-catalog.json',
    ),
  );
});

test('실제 entry는 잘못된 provider를 bundle 조회·listen 이전에 거부', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  for (const [path, message] of [
    [selected, 'InvalidFixtureRootDirectory'],
    [join(workspace, 'missing-entry-provider'), 'ENOENT'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../../tools/serve-demo.mjs', import.meta.url)),
        '--bundle-dir=' + join(workspace, '존재하지않는-bundle'),
        '--private-fixtures',
        '--fixture-root=' + path,
      ],
      { encoding: 'utf8', timeout: 3000 },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(message));
    assert.doesNotMatch(result.stderr, /http:\/\/127\.0\.0\.1|EADDRINUSE/);
  }
});
