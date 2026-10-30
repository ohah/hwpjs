import { resolveDemoFixtureProviderRoot } from './demo-fixture-provider-root.mjs';
import { parseDemoServerArguments } from './demo-server-options.mjs';
import { loadDemoServerBundle } from './demo-server-bundle.mjs';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { respondDemoFixture } from './demo-fixture-response.mjs';
import { respondDemoFixtureCatalog } from './demo-fixture-catalog-response.mjs';
import { createPreviewWasmCompression } from './preview-wasm-compression.mjs';
import { loadDemoDocumentation } from './demo-documentation-response.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { port, bundleDirectory, privateFixtures, fixturePolicyPath, fixtureRoot } =
  parseDemoServerArguments(process.argv.slice(2), root);
const providerRoot = await resolveDemoFixtureProviderRoot(root, fixtureRoot);
const dist = resolve(root, 'apps/demo/dist'),
  core = resolve(root, 'packages/core/dist');
const bundle = bundleDirectory
  ? await loadDemoServerBundle(bundleDirectory, { root, privateFixtures, fixturePolicyPath })
  : undefined;
const index = bundle ? undefined : await readFile(resolve(dist, 'index.html'));
const assets = new Map();
async function snapshot(directory, prefix) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await snapshot(path, prefix + item.name + '/');
    else if (item.isFile() && /\.(?:js|css|wasm|woff2?|ttf|png|svg|ico)$/.test(path))
      assets.set(prefix + item.name, await readFile(path));
  }
}
if (!bundle) {
  await snapshot(dist, '/');
  await snapshot(core, '/hwpjs/');
}
const documentation = await loadDemoDocumentation(root);
const compress = createPreviewWasmCompression();
const primaryWasm = bundle?.primaryWasm ?? assets.get('/hwpjs/hwpjs.wasm');
if (primaryWasm) {
  compress(primaryWasm, 'br');
  compress(primaryWasm, 'gzip');
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/vnd.microsoft.icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};
const pages = new Set([
  '/',
  '/index.html',
  '/web/preview/index.html',
  '/demo/vanilla',
  '/demo/react',
  '/demo/svelte',
  '/demo/headless',
]);
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    // 명시 provider를 쓸 때만 사설 bundle의 fixture 별칭을 같은 strict handler로 보냅니다.
    if (fixtureRoot !== undefined) {
      for (const prefix of ['/hwpjs/editor/', '/docs/editor/']) {
        if (!path.startsWith(prefix)) continue;
        const key = path.slice(prefix.length);
        if (key === 'fixture-catalog.json') {
          await respondDemoFixtureCatalog(
            providerRoot,
            '/demo-fixture-catalog.json',
            request.method,
            response,
          );
          return;
        }
        if (key.startsWith('fixtures/')) {
          await respondDemoFixture(
            providerRoot,
            '/demo-fixtures/' + key.slice('fixtures/'.length),
            request.method,
            response,
          );
          return;
        }
      }
    }
    if (bundle && path.startsWith('/docs/editor/')) {
      await bundle.respond(path, request.method, response, request.headers['accept-encoding']);
      return;
    }
    if (documentation.respond(path, request.method, response, request.headers['accept-encoding']))
      return;
    if (await respondDemoFixtureCatalog(providerRoot, path, request.method, response)) return;
    if (await respondDemoFixture(providerRoot, path, request.method, response)) return;
    if (bundle) {
      await bundle.respond(path, request.method, response, request.headers['accept-encoding']);
      return;
    }
    const body = pages.has(path) ? index : assets.get(path);
    if (!body) {
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    const wasm = path.endsWith('.wasm'),
      representation = wasm
        ? compress(body, request.headers['accept-encoding'])
        : { bytes: body, encoding: null };
    if (representation.bytes === null) {
      response.writeHead(406, { Vary: 'Accept-Encoding', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    const encoded = representation.bytes;
    response.writeHead(200, {
      'Content-Type': pages.has(path)
        ? mime['.html']
        : (mime[extname(path)] ?? 'application/octet-stream'),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': encoded.length,
      ...(wasm ? { Vary: 'Accept-Encoding' } : {}),
      ...(representation.encoding ? { 'Content-Encoding': representation.encoding } : {}),
    });
    response.end(request.method === 'HEAD' ? undefined : encoded);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`http://127.0.0.1:${port}/web/preview/index.html`),
);
