// Only the styles imported by the source-only object properties tests.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const styles = new Set(
  ['dialog-layer.css', 'object-properties.css', 'table-cell-appearance.css'].map(
    (name) => new URL('../src/' + name, import.meta.url).href,
  ),
);
registerHooks({
  load(url, context, next) {
    if (!styles.has(url)) return next(url, context);
    readFileSync(new URL(url));
    return { format: 'module', source: 'export {};', shortCircuit: true };
  },
});
