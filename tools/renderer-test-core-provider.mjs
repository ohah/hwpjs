// Resolve the renderer's package import to an explicit, built SDK; substitute no functions.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.HWPJS_TEST_CORE_DIST;
if (!directory) throw Error('ExplicitRendererCoreDistRequired');
const dist = resolve(directory);
const manifest = JSON.parse(readFileSync(resolve(dist, 'build-manifest.json'), 'utf8'));
const index = resolve(dist, 'index.js');
const expected = manifest.files?.['index.js'];
if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
  throw Error('RendererCoreManifestPinMissing');
if (createHash('sha256').update(readFileSync(index)).digest('hex') !== expected)
  throw Error('RendererCoreManifestPinMismatch');
const importer = pathToFileURL(
  resolve(root, 'web/preview/owned-body-draft-paragraph-index.mjs'),
).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@hwpjs/core' && context.parentURL === importer)
      return { url: pathToFileURL(index).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
