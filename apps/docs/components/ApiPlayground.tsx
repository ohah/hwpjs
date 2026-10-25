import { withBase } from '@rspress/core/runtime';
import './ApiPlayground.css';
/** A same-origin, isolated editor instance backed by the real packaged WASM. */
export default function ApiPlayground() {
  return <section className="hwpjs-api-playground" aria-label="실제 Headless API 플레이그라운드">
    <p>API와 JSON 인수를 선택해 실제 엔진의 반환값·오류·전후 상태를 확인하세요.
      <a href={withBase('/editor/api/index.html')} target="_blank" rel="noopener noreferrer">별도 창에서 실행</a>
    </p>
    <iframe title="Headless API 실제 함수 실행" src={withBase('/editor/api/index.html')} />
  </section>;
}
