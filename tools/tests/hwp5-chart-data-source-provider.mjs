// Exact source wiring for mock/UI contract tests only; no Native qualification or dist claim.
import { registerHooks } from 'node:module';
const sources = new Map(
  [
    ['hwp5-chart-data-tool.ts', 'hwp5-chart-data.ts'],
    ['object-geometry-port.ts', 'object-geometry.ts'],
  ].map(([owner, source]) => [
    new URL('../../apps/demo/src/' + owner, import.meta.url).href,
    new URL('../../packages/core/src/commands/' + source, import.meta.url).href,
  ]),
);
sources.set(
  new URL('../../apps/demo/tests/hwp5-chart-properties.test.mjs', import.meta.url).href,
  new URL('../../packages/core/src/commands/object-geometry.ts', import.meta.url).href,
);
const dialogStyle = new URL('../../apps/demo/src/dialog-layer.css', import.meta.url).href;
registerHooks({
  load(url, context, next) {
    // The controlled DOM tests exercise behavior. Vite loads the real stylesheet.
    if (url === dialogStyle) return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  },
  resolve(specifier, context, next) {
    const source = specifier === '@hwpjs/core' ? sources.get(context.parentURL) : undefined;
    return source ? { url: source, shortCircuit: true } : next(specifier, context);
  },
});
