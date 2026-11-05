// Node 시험의 정확한 스타일 모듈만 처리한다. SDK/DOM/서식 함수 대역이 아니다.
import { registerHooks } from 'node:module';
export function installFormattingTestStyles() {
  const styles = new Set(
    ['text-color.css', 'font-name.css', 'dialog-layer.css', 'document-open-ui.css'].map(
      (name) => new URL('../src/' + name, import.meta.url).href,
    ),
  );
  return registerHooks({
    load(url, context, next) {
      if (styles.has(url)) return { format: 'module', source: 'export {};', shortCircuit: true };
      return next(url, context);
    },
  });
}
