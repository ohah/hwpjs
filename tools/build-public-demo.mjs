#!/usr/bin/env node
/** Verification-only producer. Never writes source, dist, published assets or Git. */
import { readFile, writeFile, mkdir, lstat, readdir, rename } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, minify } from 'vite';
import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import {
  digest,
  assertBundlePath,
  assertPublicText,
  rejectSymlinkAncestors,
} from './pages-demo/bundle-validation.mjs';
import { validateProductionBundle } from './pages-demo/bundle-production.mjs';
import { validateExplicitFixturePolicy } from './pages-demo/fixture-policy.mjs';
import { canonicalWorkerURLPlugin } from './pages-demo/canonical-worker-url.mjs';
import { installWorkerAssets, discoverActiveRuntimePaths } from './pages-demo/worker-assets.mjs';
import { publicFixtureModules } from './pages-demo/public-fixture-modules.mjs';
import { collectUiLicenseInputs } from './pages-demo/ui-license-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2),
  options = new Map();
if (args.length % 2) throw Error('Usage: --source DIR --wasm FILE --out NEW_VERIFICATION_DIR');
for (let i = 0; i < args.length; i += 2) {
  if (!['--source', '--wasm', '--out'].includes(args[i]) || options.has(args[i]))
    throw Error('InvalidOption');
  options.set(args[i], resolve(args[i + 1]));
}
if (options.size !== 3) throw Error('ExplicitInputsRequired');
const source = options.get('--source'),
  output = options.get('--out'),
  wasmPath = options.get('--wasm');
if (![source, output].every((p) => p.startsWith(resolve(root, 'zig-out/verification') + '/')))
  throw Error('VerificationPathsRequired');
await rejectSymlinkAncestors(output);
try {
  await lstat(output);
  throw Error('OutputAlreadyExists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const policy = JSON.parse(
  await readFile(resolve(root, 'tools/pages-demo/public-gallery-fixtures.json')),
);
const baseline = await validateProductionBundle(resolve(root, 'apps/docs/docs/public/editor'), {
  root,
  fixturePolicy: policy,
});
const files = new Map([...baseline.files].filter(([p]) => p !== 'manifest.json'));
const inputs = [];
async function input(path) {
  const bytes = await readFile(path);
  inputs.push({ sha256: digest(bytes), bytes: bytes.length });
  return bytes;
}
const wasm = await input(wasmPath),
  core = resolve(source, 'packages/core/dist');
if (!(await input(resolve(core, 'hwpjs.wasm'))).equals(wasm)) throw Error('CandidateWasmMismatch');
const worker = await input(resolve(core, 'worker.js')),
  runtimePath = resolve(core, 'runtime.js'),
  runtime = await input(runtimePath);
const activeWorkerPath = `runtime/worker-${digest(worker)}.js`;
const modules = publicFixtureModules(policy),
  catalog = resolve(source, 'web/preview/fixture-catalog.mjs'),
  inventory = resolve(source, 'web/preview/fixture-inventory.mjs');
const apiId = '\0public-demo-api';
const api = `import * as core from '@hwpjs/core';
import {createWorkerRuntimeFactory} from '@hwpjs/core/runtime';
import {createCanvasSurface} from '@hwpjs/vanilla';
import {mountApiPlayground} from ${JSON.stringify(resolve(source, 'apps/demo/src/api-playground.mjs'))};
import {mountNamedFieldsPanel} from ${JSON.stringify(resolve(source, 'apps/demo/src/api-named-fields-panel.mjs'))};
const editor = core.createEditor({
  runtimeFactory: createWorkerRuntimeFactory({
    wasmURL: new URL('../hwpjs/hwpjs.wasm', import.meta.url),
  }),
});
const panel = mountApiPlayground(document.querySelector('main'), {
  editor,
  createSurface: createCanvasSurface,
  spliceCommand: core.SPLICE_TEXT_COMMAND,
  getHistoryAvailability: core.getHistoryAvailability,
  getTableInsertAvailability: core.getTableInsertAvailability,
  createParagraphSelection: core.createParagraphSelection,
  planReplaceAll: core.planReplaceAll,
  replaceAllCommand: core.REPLACE_ALL_COMMAND,
  editParagraphBulletDefinitionCommand: core.EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  listParagraphBulletDefinitions: (options) => editor.listParagraphBulletDefinitions(options),
  async loadFixture(format, fixture = 'noori') {
    const name = fixture + (format === 'hwp5' ? '.hwp' : '.hwpx');
    const response = await fetch(new URL('../fixtures/' + name, import.meta.url));
    if (!response.ok) throw Error('FixtureFetchFailed');
    return new Uint8Array(await response.arrayBuffer());
  },
});
const namedFieldsSlot = document.createElement('div');
document.querySelector('main .api-playground h1').after(namedFieldsSlot);
const namedFieldsPanel = mountNamedFieldsPanel(namedFieldsSlot, {
  editor,
  setNamedFieldValueCommand: core.SET_NAMED_FIELD_VALUE_COMMAND,
  createNamedFieldCommand: core.CREATE_NAMED_FIELD_COMMAND,
  getSelectionClipboard: core.getSelectionClipboard,
  setNamedFieldParametersCommand: core.SET_NAMED_FIELD_PARAMETERS_COMMAND,
  readNamedFieldParameters: (selector, options) => editor.readNamedFieldParameters(selector, options),
});
addEventListener('pagehide', () => {
  namedFieldsPanel.dispose();
  void Promise.resolve(panel.dispose()).finally(() => editor.dispose());
}, { once: true });`;
const alias = [
  { find: '@hwpjs/core/runtime', replacement: runtimePath },
  {
    find: '@hwpjs/core/_internal/native-geometry',
    replacement: resolve(core, '_internal/native-geometry.js'),
  },
  ...['core', 'vanilla', 'react', 'svelte'].map((name) => ({
    find: '@hwpjs/' + name,
    replacement: resolve(source, `packages/${name}/dist/index.js`),
  })),
];
const seen = new Set();
const boundary = {
  name: 'public-demo-input-boundary',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'public-demo-api') return apiId;
  },
  load(id) {
    if (id === apiId) return api;
    if (id === catalog) {
      seen.add('catalog');
      return modules.catalog;
    }
    if (id === inventory) {
      seen.add('inventory');
      return modules.inventory;
    }
  },
  transform(code, id) {
    if (id === runtimePath)
      return code.replace(
        'new URL("./hwpjs.wasm", import.meta.url)',
        'new URL(/* @vite-ignore */ "../hwpjs/hwpjs.wasm", import.meta.url)',
      );
    if (id === resolve(source, 'apps/demo/src/available-fixtures.ts'))
      return code.replace(
        "'/demo-fixture-catalog.json'",
        'new URL("../fixture-catalog.json",import.meta.url).href',
      );
    if (id === resolve(source, 'apps/demo/src/demo-controller.ts'))
      return code.replace(
        /(['"])\/demo\/(vanilla|react|svelte|headless)\1/g,
        (_, q, name) => `new URL('../demo/${name}/',import.meta.url).pathname`,
      );
  },
};
// Pin canonical runtime before the separate public WASM URL transform runs.
const result = await build({
  configFile: false,
  root: resolve(source, 'apps/demo'),
  base: './',
  publicDir: false,
  resolve: { alias },
  plugins: [
    canonicalWorkerURLPlugin({
      runtimePath,
      runtimeSha256: digest(runtime),
      workerBytes: worker,
      workerSha256: digest(worker),
    }),
    boundary,
    react(),
    svelte(),
  ],
  build: {
    target: 'es2023',
    write: false,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      input: {
        main: resolve(source, 'apps/demo/index.html'),
        api: 'public-demo-api',
        core: resolve(core, 'index.js'),
        runtime: runtimePath,
        'native-geometry': resolve(core, '_internal/native-geometry.js'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'api' ? 'api/main.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
if (seen.size !== 2) throw Error('PublicFixtureAliasesNotConsumed');
const sdkEntries = new Map();
const sdkNames = ['core', 'runtime', 'native-geometry'];
for (const item of result.output) {
  const bytes = Buffer.from(item.type === 'asset' ? item.source : item.code);
  files.set(item.fileName, bytes);
  if (item.type === 'chunk' && item.isEntry && sdkNames.includes(item.name)) {
    if (!item.exports.length) throw Error('EmptyPublicSdkEntry:' + item.name);
    sdkEntries.set(item.name, item.fileName);
  }
}
for (const name of sdkNames) {
  const entry = sdkEntries.get(name);
  if (!entry) throw Error('MissingPublicSdkEntry:' + name);
  files.set(`sdk/current/${name}.js`, Buffer.from(`export * from '../../${entry}';\n`));
}
// Preserve old assets and stable worker for already-open pages; active chunks use hash URLs.
for (const name of ['vanilla', 'react', 'svelte', 'headless'])
  files.set(
    `demo/${name}/index.html`,
    Buffer.from(files.get('index.html').toString().replaceAll('./assets/', '../../assets/')),
  );
async function copyRuntime(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = prefix + entry.name;
    if (entry.isDirectory()) await copyRuntime(resolve(dir, entry.name), p + '/');
    else if (entry.isFile() && p.endsWith('.js') && p !== 'worker.js' && p !== 'runtime.js') {
      const bytes = await input(resolve(dir, entry.name));
      files.set(
        'runtime/' + p,
        Buffer.from((await minify(p, bytes.toString(), { module: true })).code),
      );
    }
  }
}
await copyRuntime(core);
files.set('runtime/runtime.js', Buffer.from(`export * from '../${sdkEntries.get('runtime')}';\n`));
files.set('hwpjs/hwpjs.wasm', wasm);
files.set('api/playground.js', await input(resolve(source, 'apps/demo/src/api-playground.mjs')));
validateExplicitFixturePolicy(files, policy);
const activeRuntimePaths = discoverActiveRuntimePaths(files, activeWorkerPath);
const workerAssets = installWorkerAssets(files, {
  activeBytes: worker,
  legacyBytes: baseline.files.get('runtime/worker.js'),
  activeRuntimePaths,
});
const uiLicenses = await collectUiLicenseInputs({ root, read: input });
files.set('LICENSE.txt', uiLicenses.project);
files.set('THIRD_PARTY_NOTICES.txt', uiLicenses.notices);
for (const [path, bytes] of files) {
  assertBundlePath(path);
  assertPublicText(path, bytes);
}
const manifest = {
  ...baseline.manifest,
  licenses: uiLicenses.manifest,
  workerAssets,
  wasmSha256: digest(wasm),
  inputChecksums: inputs.sort((a, b) => a.sha256.localeCompare(b.sha256)),
  verification: {
    staticURLPrefixes: ['/hwpjs/editor/', '/docs/editor/'],
    moduleSyntax: true,
    fixtureAllowlist: true,
    browserE2E: 'separate',
  },
  files: [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) })),
};
files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
const stage = output + '.assembling';
await mkdir(stage, { recursive: false });
for (const [path, bytes] of files) {
  const dest = resolve(stage, path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
}
const checked = await validateProductionBundle(stage, { root, fixturePolicy: policy });
await rename(stage, output);
console.log(
  JSON.stringify(
    {
      output,
      files: checked.files.size,
      fixtures: policy.files.length,
      manifestSha256: digest(checked.manifestBytes),
      wasmSha256: digest(wasm),
      workerSha256: digest(worker),
      baselineManifestSha256: digest(baseline.manifestBytes),
      source: relative(root, source),
    },
    null,
    2,
  ),
);
