// Map bare Core to exact real command modules; no command/runtime stubs or build.
import { registerHooks } from 'node:module';
const core = new URL('./body-flow-core-source.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hwpjs/core'
      ? { url: core, shortCircuit: true }
      : next(specifier, context);
  },
});
