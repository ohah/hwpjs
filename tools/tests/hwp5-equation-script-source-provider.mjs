// Source-only tests. Exact Core source, never a stale package dist symlink.
import { registerHooks } from 'node:module';
const owners = ['hwp5-equation-script-tool.ts', 'equation-tool.ts', 'picture-crop-port.ts'].map(
  (name) => new URL('../../apps/demo/src/' + name, import.meta.url).href,
);
const core = new URL('../../packages/core/src/index.ts', import.meta.url).href;
const defaults = new URL('../../packages/core/src/keymap/defaults.json', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hwpjs/core' && owners.includes(context.parentURL)
      ? { url: core, shortCircuit: true }
      : next(specifier, context);
  },
  load(url, context, next) {
    return url === defaults
      ? next(url, { ...context, importAttributes: { type: 'json' } })
      : next(url, context);
  },
});
