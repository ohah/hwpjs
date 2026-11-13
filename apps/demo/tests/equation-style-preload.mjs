// Only stylesheet imports are replaced; controls, Core adapters and DOM listeners stay real.
import '../../../tools/object-properties-test-css.mjs';
import { registerHooks } from 'node:module';
const style = new URL('../src/equation-view.css', import.meta.url).href;
registerHooks({
  load(url, context, next) {
    return url === style
      ? { format: 'module', source: 'export {};', shortCircuit: true }
      : next(url, context);
  },
});
