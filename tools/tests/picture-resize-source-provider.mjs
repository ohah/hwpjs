// Source-only test resolution. No Native origin, renderer or production entry is patched.
import { registerHooks } from 'node:module';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const defaultsURL = new URL('../../packages/core/src/keymap/defaults.ts', import.meta.url);
const defaultsOwners = new Set([defaultsURL.href, pathToFileURL(realpathSync(defaultsURL)).href]);
const surfaceSources = new Set([
  new URL('../../packages/vanilla/src/surface.ts', import.meta.url).href,
  new URL('../../packages/vanilla/src/picture-resize-controls.ts', import.meta.url).href,
]);
const entries = new Map([
  ['@hwpjs/core', new URL('../../packages/core/src/index.ts', import.meta.url).href],
  [
    '@hwpjs/core/_internal/native-geometry',
    new URL('../../packages/core/src/_internal/native-geometry.ts', import.meta.url).href,
  ],
  [
    '@hwpjs/core/_internal/native-read-source',
    new URL('../../packages/core/src/_internal/native-read-source.ts', import.meta.url).href,
  ],
]);
registerHooks({
  resolve(name, context, next) {
    // Preserve the exact JSON bytes/config parser. Node's direct source runner
    // requires the import attribute that the production bundler supplies.
    if (name === './defaults.json' && defaultsOwners.has(context.parentURL)) {
      const importAttributes = { ...context.importAttributes, type: 'json' };
      return { ...next(name, { ...context, importAttributes }), importAttributes };
    }
    const url = entries.get(name);
    return url ? { url, shortCircuit: true } : next(name, context);
  },
  load(url, context, next) {
    if (surfaceSources.has(url))
      process.stderr.write(JSON.stringify({ kind: 'picture-resize-source', url }) + '\n');
    return next(url, context);
  },
});
