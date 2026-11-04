// 테스트 전용: 정규 Surface가 가져오는 renderer 하나만 통제한다.
// Canvas·Core·Native 권한 구현이나 공개 패키지 해석은 대체하지 않는다.
import { registerHooks } from 'node:module';
const surface = new URL('../src/surface.ts', import.meta.url).href;
const rendererFixture = new URL('./non-text-history-fixture.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === surface && specifier === '../../../web/preview/renderer.mjs')
      return { url: rendererFixture, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
