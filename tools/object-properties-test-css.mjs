// Node 단위 시험의 스타일 경계만 처리한다. SDK/DOM 함수를 대체하지 않는다.
import { registerHooks } from 'node:module';
const styles = new Set([
  new URL('../apps/demo/src/object-properties.css', import.meta.url).href,
  new URL('../apps/demo/src/dialog-layer.css', import.meta.url).href,
]);
registerHooks({
  load(url, context, next) {
    if (styles.has(url)) return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
