// Exact source-only mock/UI wiring. No Native profile, package dist or browser evidence.
import { registerHooks } from 'node:module';
const owner = new URL('../../apps/demo/src/page-restart-tool.ts', import.meta.url).href;
const commands = new URL('../../packages/core/src/commands/commands.ts', import.meta.url).href;
const defaults = new URL('../../packages/core/src/keymap/defaults.json', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hwpjs/core' && context.parentURL === owner
      ? { url: commands, shortCircuit: true }
      : next(specifier, context);
  },
  load(url, context, next) {
    return url === defaults
      ? next(url, { ...context, importAttributes: { type: 'json' } })
      : next(url, context);
  },
});
