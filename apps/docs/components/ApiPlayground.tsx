import { withBase } from '@rspress/core/runtime';
import './ApiPlayground.css';
/** A same-origin, isolated editor instance backed by the real packaged WASM. */
export default function ApiPlayground() {
  const apiUrl = withBase('/editor/api/index.html');
  return (
    <section className="hwpjs-api-playground" aria-label="공개 API 플레이그라운드">
      <p>
        API와 JSON 인수를 선택해 실제 엔진의 반환값·오류·전후 상태를 확인하세요.
        <a href={apiUrl} target="_blank" rel="noopener noreferrer">
          별도 창에서 실행
        </a>
      </p>
      <p>
        문서를 먼저 열고 전체 바꾸기를 실행하세요. <code>getReplaceAllCapabilities</code>는 가용성을
        조회하고, <code>planReplaceAll</code>은 변경 계획만 표시합니다. <code>replaceAll</code>은
        리터럴 일괄 교체를 실행합니다. 계획과 실행의 JSON에는 <code>query</code>와{' '}
        <code>replacement</code>만 입력하세요.
      </p>
      <iframe title="공개 API 실제 함수 실행" src={apiUrl} />
    </section>
  );
}
