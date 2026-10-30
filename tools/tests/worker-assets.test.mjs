import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateWorkerAssets,
  validateWorkerPair,
  installWorkerAssets,
  discoverActiveRuntimePaths,
} from '../pages-demo/worker-assets.mjs';
import { canonicalWorkerURLPlugin } from '../pages-demo/canonical-worker-url.mjs';
import { validateBundle } from '../pages-demo/bundle-validation.mjs';
import { loadPrivateDemoBundle } from '../demo-private-bundle.mjs';
import { loadDemoServerBundle } from '../demo-server-bundle.mjs';

const digest = (b) => createHash('sha256').update(b).digest('hex');
const active = Buffer.from('export const active = 69;'),
  legacy = Buffer.from('export const legacy = 67;');
const fixture = () => {
  const files = new Map();
  const workerAssets = installWorkerAssets(files, {
    activeBytes: active,
    legacyBytes: legacy,
    activeRuntimePaths: ['assets/runtime-new.js'],
  });
  files.set(
    'assets/runtime-new.js',
    Buffer.from(
      `const expected = '${digest(active)}'; const defaultURL = new URL('../${workerAssets.activeWorkerPath}', import.meta.url);`,
    ),
  );
  files.set(
    'assets/runtime-old.js',
    Buffer.from(
      `const expected = '${digest(legacy)}'; const defaultURL = new URL('../runtime/worker.js', import.meta.url);`,
    ),
  );
  files.set('hwpjs/hwpjs.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  const manifest = {
    mode: 'frozen-dist-closure',
    base: 'relative',
    wasmSha256: digest(files.get('hwpjs/hwpjs.wasm')),
    workerAssets,
    files: [...files].map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: digest(bytes),
    })),
  };
  return { files, manifest };
};
test('기존 stable-only manifest는 동일 Worker를 active와 legacy로 읽는다', () => {
  const { files, manifest } = fixture();
  delete manifest.workerAssets;
  const result = validateWorkerAssets(manifest, files);
  assert.equal(result.activeWorkerPath, 'runtime/worker.js');
  assert.equal(result.activeWorkerSha256, digest(legacy));
});
test('두 세대의 URL과 bytes를 분리하고 expected hash는 각 세대 그대로 보존한다', () => {
  const a = fixture();
  const b = fixture();
  assert.equal(validateWorkerPair(a, b).activeWorkerSha256, digest(active));
  assert.equal(validateWorkerAssets(a.manifest, a.files).legacyWorkerSha256, digest(legacy));
  assert.notEqual(digest(active), digest(legacy));
  assert.deepEqual(discoverActiveRuntimePaths(a.files, a.manifest.workerAssets.activeWorkerPath), [
    'assets/runtime-new.js',
  ]);
});
test('사설 정책의 Worker hash도 active와 일치해야 한다', () => {
  const a = fixture();
  a.manifest.privateDemo = { workerSHA256: digest(legacy) };
  assert.throws(() => validateWorkerAssets(a.manifest, a.files), /PolicyMismatch/);
});
for (const mode of [
  'hash-name',
  'active-bytes',
  'legacy-bytes',
  'query-ref',
  'missing-ref',
  'unlisted-ref',
  'duplicate-runtime',
  'expected-hash',
])
  test('잘못된 결합을 거부한다: ' + mode, () => {
    const { files, manifest } = fixture();
    const p = manifest.workerAssets;
    if (mode === 'hash-name') p.activeWorkerPath = 'runtime/worker-' + '0'.repeat(64) + '.js';
    if (mode === 'active-bytes') files.set(p.activeWorkerPath, legacy);
    if (mode === 'legacy-bytes') files.set(p.legacyWorkerPath, active);
    if (mode === 'query-ref')
      files.set(
        'assets/runtime-new.js',
        Buffer.from(files.get('assets/runtime-new.js').toString().replace(".js'", ".js?x=1'")),
      );
    if (mode === 'missing-ref')
      files.set('assets/runtime-new.js', Buffer.from('export const x = 0;'));
    if (mode === 'unlisted-ref') files.set('assets/rogue.js', files.get('assets/runtime-new.js'));
    if (mode === 'duplicate-runtime') p.activeRuntimePaths.push(p.activeRuntimePaths[0]);
    if (mode === 'expected-hash')
      files.set(
        'assets/runtime-new.js',
        Buffer.from(
          files.get('assets/runtime-new.js').toString().replace(digest(active), digest(legacy)),
        ),
      );
    assert.throws(() => validateWorkerAssets(manifest, files));
  });
test('public/private active bytes와 경로가 다르면 기존 stable이 같아도 거부한다', () => {
  const a = fixture(),
    b = fixture();
  b.files.set(b.manifest.workerAssets.activeWorkerPath, legacy);
  assert.throws(() => validateWorkerPair(a, b));
});
test('hash 이름 충돌은 덮어쓰지 않는다', () => {
  const a = fixture();
  a.files.set(a.manifest.workerAssets.activeWorkerPath, legacy);
  assert.throws(
    () =>
      installWorkerAssets(a.files, {
        activeBytes: active,
        legacyBytes: legacy,
        activeRuntimePaths: ['assets/runtime-new.js'],
      }),
    /Collision/,
  );
});
async function diskBundle(bundle) {
  const root = await mkdtemp(resolve(await realpath(tmpdir()), 'worker-assets-'));
  for (const [path, bytes] of bundle.files) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), bytes);
  }
  await writeFile(resolve(root, 'manifest.json'), JSON.stringify(bundle.manifest));
  return root;
}
test('public primitive와 private validator가 동일 계약으로 두 세대를 검증한다', async () => {
  const bundle = fixture();
  bundle.manifest.privateDemo = {};
  const root = await diskBundle(bundle);
  assert.equal(
    (await validateBundle(root)).files.get('runtime/worker.js').toString(),
    legacy.toString(),
  );
  assert.equal(
    (await loadPrivateDemoBundle(root)).manifest.workerAssets.activeWorkerSha256,
    digest(active),
  );
  bundle.manifest.workerAssets.activeWorkerSha256 = '0'.repeat(64);
  await writeFile(resolve(root, 'manifest.json'), JSON.stringify(bundle.manifest));
  await assert.rejects(validateBundle(root));
  await assert.rejects(loadPrivateDemoBundle(root));
});

const repo = fileURLToPath(new URL('../../', import.meta.url));

// 변환 계약만 검증하는 최소 fixture입니다. 고정 SDK/배포 artifact 검사는 sidecar 소유입니다.
function canonicalFixture() {
  const workerBytes = Buffer.from('export const workerVersion = 2;');
  const workerSha256 = digest(workerBytes);
  const runtimePath = resolve(repo, 'synthetic-runtime.js');
  const raw = `import { createHash } from 'node:crypto';
var KNOWN_WORKER_CODE_SHA256 = "${workerSha256}";
export function open(options = {}) {
  const defaultURL = new URL("./worker.js", import.meta.url), custom = options.workerFactory !== undefined || options.workerURL !== undefined;
  return { url: defaultURL.href, custom,
    allows(bytes) { return !custom && createHash('sha256').update(bytes).digest('hex') === KNOWN_WORKER_CODE_SHA256; }
  };
}`;
  return { raw, runtimePath, runtimeSha256: digest(raw), workerBytes, workerSha256 };
}

test('synthetic hash 자산21개와 기존 stable Worker를 보존하며 active를 추가한다', () => {
  const files = new Map();
  const previous = new Map();
  for (let index = 0; index < 21; index++) {
    const bytes = Buffer.from(`export const previousValue = ${index};`);
    const path = `assets/legacy-${digest(bytes).slice(0, 12)}.js`;
    files.set(path, bytes);
    previous.set(path, digest(bytes));
  }
  files.set('runtime/worker.js', legacy);
  const policy = installWorkerAssets(files, {
    activeBytes: active,
    legacyBytes: legacy,
    activeRuntimePaths: ['assets/runtime-new.js'],
  });
  files.set(
    'assets/runtime-new.js',
    Buffer.from(
      `const expected = '${digest(active)}'; const defaultURL = new URL('../${policy.activeWorkerPath}', import.meta.url);`,
    ),
  );
  const manifest = {
    workerAssets: policy,
    files: [...files].map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: digest(bytes),
    })),
  };
  validateWorkerPair({ manifest, files }, { manifest, files: new Map(files) });
  assert.equal(previous.size, 21);
  for (const [path, expected] of previous) assert.equal(digest(files.get(path)), expected);
  assert.deepEqual(files.get('runtime/worker.js'), legacy);
  assert.deepEqual(files.get(policy.activeWorkerPath), active);
});
for (const oldManifest of [false, true])
  test(
    '실제 responder 경로별 Worker 계약: ' +
      (oldManifest ? '기존 stable-only' : 'active/legacy 분리'),
    async () => {
      const bundle = fixture();
      for (const path of [
        'index.html',
        ...['vanilla', 'react', 'svelte', 'headless'].map((n) => `demo/${n}/index.html`),
        'api/index.html',
      ])
        bundle.files.set(path, Buffer.from('<!doctype html><html></html>'));
      for (const path of [
        'api/main.js',
        'api/playground.js',
        'runtime/index.js',
        'runtime/runtime.js',
      ])
        bundle.files.set(path, Buffer.from('export const ok = true;'));
      bundle.files.set('LICENSE.txt', await readFile(resolve(repo, 'LICENSE')));
      let notices = await readFile(resolve(repo, 'docs/third-party-notices.md'), 'utf8');
      for (const [name, license] of [
        ['react', 'LICENSE'],
        ['react-dom', 'LICENSE'],
        ['svelte', 'LICENSE.md'],
      ])
        notices +=
          '\n' +
          (await readFile(
            resolve(dirname(fileURLToPath(import.meta.resolve(name + '/package.json'))), license),
            'utf8',
          ));
      bundle.files.set('THIRD_PARTY_NOTICES.txt', Buffer.from(notices));
      bundle.files.set(
        'fixture-catalog.json',
        Buffer.from(
          JSON.stringify(
            ['noori.hwp', 'noori.hwpx'].map((id) => ({ id, name: id, available: true })),
          ),
        ),
      );
      for (const name of ['noori.hwp', 'noori.hwpx'])
        bundle.files.set('fixtures/' + name, Buffer.from('모의 fixture: Native 읽기 없음'));
      bundle.manifest.files = [...bundle.files].map(([path, bytes]) => ({
        path,
        bytes: bytes.length,
        sha256: digest(bytes),
      }));
      if (oldManifest) {
        bundle.files.delete(bundle.manifest.workerAssets.activeWorkerPath);
        bundle.files.delete('assets/runtime-new.js');
        delete bundle.manifest.workerAssets;
        bundle.manifest.files = [...bundle.files].map(([path, bytes]) => ({
          path,
          bytes: bytes.length,
          sha256: digest(bytes),
        }));
      }
      const directory = await diskBundle(bundle);
      const server = await loadDemoServerBundle(directory, { root: repo });
      for (const [path, expected] of [
        ...(!oldManifest
          ? [
              ['/hwpjs/editor/' + bundle.manifest.workerAssets.activeWorkerPath, active],
              ['/docs/editor/' + bundle.manifest.workerAssets.activeWorkerPath, active],
            ]
          : []),
        ['/hwpjs/editor/runtime/worker.js', legacy],
        ['/docs/editor/runtime/worker.js', legacy],
        ['/hwpjs/worker.js', oldManifest ? legacy : active],
      ]) {
        const response = {
          writeHead(status, headers) {
            this.status = status;
            this.headers = headers;
          },
          end(body) {
            this.body = body;
          },
        };
        await server.respond(path, 'GET', response);
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, expected);
        assert.equal(response.headers['Content-Type'], 'text/javascript; charset=utf-8');
      }
    },
  );
test('canonical plugin의 실제 변환 결과는 URL만 바꾸고 hash·custom 경계를 유지한다', async () => {
  const input = canonicalFixture();
  const { raw, runtimePath, workerBytes, workerSha256 } = input;
  const plugin = canonicalWorkerURLPlugin(input);
  let emitted;
  const context = {
    emitFile(asset) {
      assert.equal(emitted, undefined);
      emitted = asset;
      return 'WORKER_FIXTURE';
    },
  };
  assert.equal(plugin.transform.call(context, raw, runtimePath + '.other'), null);
  const transformed = plugin.transform.call(context, raw, runtimePath);
  const marker = 'import.meta.ROLLUP_FILE_URL_WORKER_FIXTURE';
  assert.equal(
    transformed.code.replace(
      `new URL(${marker}, import.meta.url)`,
      'new URL("./worker.js", import.meta.url)',
    ),
    raw,
  );
  assert.equal(emitted.type, 'asset');
  assert.equal(emitted.fileName, `runtime/worker-${workerSha256}.js`);
  assert.deepEqual(emitted.source, workerBytes);
  assert.equal(transformed.map, null);
  plugin.generateBundle();

  // bundler의 파일 URL 치환만 모의합니다. 생성된 함수는 실제 실행해 URL·hash 결과를 검사합니다.
  const activeURL = 'https://static.invalid/editor/' + emitted.fileName;
  const executable = transformed.code.replace(marker, JSON.stringify(activeURL));
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(executable).toString('base64')
  );
  const port = module.open();
  assert.equal(port.url, activeURL);
  assert.equal(port.custom, false);
  assert.equal(port.allows(workerBytes), true);
  assert.equal(port.allows(Buffer.from('wrong worker bytes')), false);
  assert.equal(module.open({ workerURL: activeURL }).custom, true);
  assert.equal(module.open({ workerURL: activeURL }).allows(workerBytes), false);
  assert.equal(module.open({ workerFactory() {} }).allows(workerBytes), false);
  assert.throws(() => plugin.transform.call(context, raw, runtimePath), /Drift/);
  const fresh = () => canonicalWorkerURLPlugin(input);
  assert.throws(() => fresh().transform.call(context, raw + ' ', runtimePath), /Drift/);
  assert.throws(() => fresh().transform.call(context, raw, runtimePath + '?x=1'), /Drift/);
  assert.throws(() => fresh().generateBundle(), /NotConsumed/);
  assert.throws(
    () => canonicalWorkerURLPlugin({ ...input, workerBytes: legacy }),
    /InvalidCanonicalWorkerInput/,
  );
  for (const badRaw of [
    raw.replace('new URL("./worker.js", import.meta.url)', 'undefined'),
    raw + '\nnew URL("./worker.js", import.meta.url);',
    raw.replace(workerSha256, '0'.repeat(64)),
  ]) {
    const bad = canonicalWorkerURLPlugin({ ...input, runtimeSha256: digest(badRaw) });
    assert.throws(() => bad.transform.call(context, badRaw, runtimePath), /Drift/);
  }
});
