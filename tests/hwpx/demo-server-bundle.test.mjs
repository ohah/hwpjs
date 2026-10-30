import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadDemoServerBundle } from '../../tools/demo-server-bundle.mjs';
import { parseDemoServerArguments } from '../../tools/demo-server-options.mjs';
import { respondDemoFixtureCatalog } from '../../tools/demo-fixture-catalog-response.mjs';
import { respondDemoFixture } from '../../tools/demo-fixture-response.mjs';
import { demoFixtures } from '../../web/preview/fixture-catalog.mjs';
import { readWorkerAssets } from '../../tools/pages-demo/worker-assets.mjs';
const root = process.cwd(),
  privatePath = process.env.HWPJS_TEST_PRIVATE_BUNDLE,
  fixturePolicyPath = process.env.HWPJS_TEST_PUBLIC_FIXTURE_POLICY,
  bundle = await loadDemoServerBundle(
    privatePath ? resolve(privatePath) : resolve(root, 'apps/docs/docs/public/editor'),
    { root, privateFixtures: !!privatePath, fixturePolicyPath },
  );
async function serve(fn) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      if (
        (await respondDemoFixtureCatalog(root, path, req.method, res)) ||
        (await respondDemoFixture(root, path, req.method, res))
      )
        return;
      await bundle.respond(path, req.method, res, req.headers['accept-encoding']);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  console.log(JSON.stringify({ ownedTestPort: server.address().port, host: '127.0.0.1' }));
  try {
    await fn('http://127.0.0.1:' + server.address().port);
  } finally {
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
  }
}
test('explicit mode parsing preserves default dev and rejects invalid/duplicate arguments', () => {
  assert.deepEqual(parseDemoServerArguments([], root), {
    port: 8082,
    bundleDirectory: undefined,
    privateFixtures: false,
  });
  assert.equal(
    parseDemoServerArguments(['49098', '--bundle-dir=apps/docs/docs/public/editor'], root)
      .bundleDirectory,
    resolve(root, 'apps/docs/docs/public/editor'),
  );
  for (const args of [['0'], ['--unknown'], ['--bundle-dir'], ['--bundle-dir=a', '--bundle-dir=b']])
    assert.throws(() => parseDemoServerArguments(args, root));
});
test('legacy redirects keep canonical relative assets valid for every framework and API', () =>
  serve(async (base) => {
    for (const [path, target] of [
      ['/web/preview/index.html', '/hwpjs/editor/demo/vanilla/'],
      ['/demo/react', '/hwpjs/editor/demo/react/'],
      ['/demo/svelte', '/hwpjs/editor/demo/svelte/'],
      ['/api/', '/hwpjs/editor/api/'],
    ]) {
      const response = await fetch(base + path, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), target);
      const page = await fetch(base + target);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /script/);
    }
  }));
test('canonical and legacy engine/worker aliases are byte exact, HEAD bodyless', () =>
  serve(async (base) => {
    const workers = readWorkerAssets(bundle.manifest);
    for (const [a, b] of [
      ['/hwpjs/hwpjs.wasm', '/hwpjs/editor/hwpjs/hwpjs.wasm'],
      ['/hwpjs/worker.js', '/hwpjs/editor/' + workers.activeWorkerPath],
    ]) {
      const x = await fetch(base + a),
        y = await fetch(base + b);
      assert.equal(x.status, 200);
      assert.equal(y.status, 200);
      const xb = Buffer.from(await x.arrayBuffer()),
        yb = Buffer.from(await y.arrayBuffer());
      assert(xb.equals(yb), `alias bytes must match ${b}`);
      const h = await fetch(base + b, { method: 'HEAD' });
      assert.equal(h.status, 200);
      assert.equal((await h.arrayBuffer()).byteLength, 0);
    }
    for (const [path, sha256] of [
      [workers.activeWorkerPath, workers.activeWorkerSha256],
      [workers.legacyWorkerPath, workers.legacyWorkerSha256],
    ]) {
      const response = await fetch(base + '/hwpjs/editor/' + path);
      assert.equal(response.status, 200);
      assert.equal(
        createHash('sha256')
          .update(Buffer.from(await response.arrayBuffer()))
          .digest('hex'),
        sha256,
      );
    }
    const wasm = await fetch(base + '/hwpjs/hwpjs.wasm');
    assert.equal(
      createHash('sha256')
        .update(Buffer.from(await wasm.arrayBuffer()))
        .digest('hex'),
      bundle.manifest.wasmSha256,
    );
  }));
test('full private catalog and allowlisted original fixture handlers remain available', () =>
  serve(async (base) => {
    const list = await (await fetch(base + '/demo-fixture-catalog.json')).json();
    assert.equal(list.length, demoFixtures.length);
    assert(list.length > 2);
    const source = demoFixtures.find((f) => f.id === 'table.hwpx');
    assert(source);
    const response = await fetch(base + '/demo-fixtures/' + source.id);
    assert.equal(response.status, 200);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(resolve(root, source.path)),
    );
    const published = await (await fetch(base + '/hwpjs/editor/fixture-catalog.json')).json();
    assert.equal(
      published.length,
      privatePath
        ? demoFixtures.length
        : fixturePolicyPath === undefined
          ? 2
          : JSON.parse(await readFile(resolve(root, fixturePolicyPath), 'utf8')).files.length,
    );
  }));
test('unknown paths, non-GET and docs alias never read arbitrary files', () =>
  serve(async (base) => {
    assert.equal((await fetch(base + '/AGENTS.md')).status, 404);
    assert.equal((await fetch(base + '/hwpjs/editor/unknown')).status, 404);
    assert.equal((await fetch(base + '/hwpjs/editor/index.html', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/docs/editor/api/index.html')).status, 200);
  }));
