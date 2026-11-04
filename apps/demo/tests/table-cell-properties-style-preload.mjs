// 정확히 두 CSS의 JS 평가만 생략한다. 실제 스타일·배치·Canvas 증거가 아니다.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const css = new Set(
  ['../src/dialog-layer.css', '../src/table-cell-properties.css'].map(
    (path) => new URL(path, import.meta.url).href,
  ),
);
registerHooks({
  load(url, context, next) {
    if (!css.has(url)) return next(url, context);
    readFileSync(new URL(url));
    return { format: 'module', source: 'export {};', shortCircuit: true };
  },
});
