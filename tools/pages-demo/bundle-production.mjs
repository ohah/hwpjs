import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkJavaScriptModule } from './javascript-syntax.mjs';
import { validateBundle } from './bundle-validation.mjs';

const required = [
  'index.html',
  ...['vanilla', 'react', 'svelte', 'headless'].map((name) => `demo/${name}/index.html`),
  'api/index.html',
  'api/main.js',
  'api/playground.js',
  'runtime/index.js',
  'runtime/runtime.js',
  'runtime/worker.js',
  'hwpjs/hwpjs.wasm',
  'LICENSE.txt',
  'THIRD_PARTY_NOTICES.txt',
  'fixture-catalog.json',
  'fixtures/noori.hwp',
  'fixtures/noori.hwpx',
];

function validateFixtures(files) {
  if (
    [...files.keys()].some(
      (path) =>
        path.startsWith('fixtures/') &&
        !['fixtures/noori.hwp', 'fixtures/noori.hwpx'].includes(path),
    )
  )
    throw Error('UnapprovedFixture');
  const fixtures = JSON.parse(files.get('fixture-catalog.json'));
  if (
    !Array.isArray(fixtures) ||
    fixtures.length !== 2 ||
    fixtures
      .map((file) => file.id)
      .sort()
      .join(',') !== 'noori.hwp,noori.hwpx' ||
    fixtures.some((file) => file.name !== file.id || file.available !== true)
  )
    throw Error('InvalidFixtureCatalog');
}
async function validateLicenses(root, files) {
  const notices = files.get('THIRD_PARTY_NOTICES.txt').toString();
  if (
    !files.get('LICENSE.txt').equals(await readFile(resolve(root, 'LICENSE'))) ||
    !notices.includes(await readFile(resolve(root, 'docs/third-party-notices.md'), 'utf8'))
  ) {
    throw Error('MissingLicenseNotices');
  }
  // Package resolution only runs during production, never dependency-free --verify.
  for (const [name, licenseName] of [
    ['react', 'LICENSE'],
    ['react-dom', 'LICENSE'],
    ['svelte', 'LICENSE.md'],
  ]) {
    const path = fileURLToPath(import.meta.resolve(name + '/package.json'));
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    if (
      metadata.name !== name ||
      metadata.license !== 'MIT' ||
      !notices.includes(await readFile(resolve(dirname(path), licenseName), 'utf8'))
    ) {
      throw Error('MissingDependencyLicense:' + name);
    }
  }
}
function validateReferences(files) {
  for (const [path, bytes] of files) {
    if (!/\.(js|css|html)$/.test(path)) continue;
    const source = bytes.toString(),
      refs = [];
    for (const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)(["'`])(\.[^"'`]+)\1/g))
      refs.push(match[2]);
    for (const match of source.matchAll(/new URL\((["'`])([^"'`]+)\1,\s*import\.meta\.url/g))
      refs.push(match[2]);
    if (path.endsWith('.html'))
      for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) refs.push(match[1]);
    for (const prefix of ['/hwpjs/editor/', '/docs/editor/'])
      for (const ref of refs) {
        if (ref.startsWith('data:image/svg+xml,')) continue;
        const url = new URL(ref, 'https://static.invalid' + prefix + path);
        const target = decodeURIComponent(url.pathname.slice(prefix.length));
        const directory =
          target.endsWith('/') && [...files.keys()].some((file) => file.startsWith(target));
        if (
          url.origin !== 'https://static.invalid' ||
          !url.pathname.startsWith(prefix) ||
          (!files.has(target) && !directory)
        )
          throw Error('MissingStaticDependency:' + path + ':' + ref);
      }
    if (path.endsWith('.js')) checkJavaScriptModule(source);
  }
}
export async function validateProductionBundle(directory, { root }) {
  const bundle = await validateBundle(directory);
  if (required.some((path) => !bundle.files.has(path))) throw Error('IncompleteEditorBundle');
  if (
    bundle.manifest.files.some(
      (file) => !/\.(?:js|css|html|json|hwp|hwpx|wasm|woff2?|ttf|png|svg|ico|txt)$/.test(file.path),
    )
  ) {
    throw Error('UnapprovedBundleType');
  }
  validateFixtures(bundle.files);
  await validateLicenses(root, bundle.files);
  validateReferences(bundle.files);
  return bundle;
}
