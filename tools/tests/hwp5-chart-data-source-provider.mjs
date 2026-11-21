// Exact source wiring for mock/UI contract tests only; no Native qualification or dist claim.
import { registerHooks } from 'node:module';
const owner = new URL('../../apps/demo/src/hwp5-chart-data-tool.ts', import.meta.url).href;
const source = new URL('../../packages/core/src/commands/hwp5-chart-data.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@hwpjs/core' && context.parentURL === owner)
      return { url: source, shortCircuit: true };
    return next(specifier, context);
  },
});
