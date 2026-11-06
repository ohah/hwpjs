// CSS evaluation only. No browser, fixture, SDK or Native substitution.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const css = new Set(
  ['dialog-layer.css', 'table-cell-background.css', 'table-cell-properties.css'].map(
    (name) => new URL('../src/' + name, import.meta.url).href,
  ),
);
registerHooks({
  load(url, context, next) {
    if (!css.has(url)) return next(url, context);
    readFileSync(new URL(url));
    return { format: 'module', source: 'export {};', shortCircuit: true };
  },
});
