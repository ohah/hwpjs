// Only these exact styles skip JS evaluation; this is not browser layout evidence.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const styles = new Set(
  [
    'dialog-layer.css',
    'table-cell-appearance.css',
    'table-cell-border.css',
    'table-cell-background.css',
    'table-cell-properties.css',
    'table-insert-dialog.css',
  ].map((name) => new URL('../src/' + name, import.meta.url).href),
);
registerHooks({
  load(url, context, next) {
    if (!styles.has(url)) return next(url, context);
    readFileSync(new URL(url));
    return { format: 'module', source: 'export {};', shortCircuit: true };
  },
});
