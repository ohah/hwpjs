# 공개 API 가이드

`@ohah/hwpjs@0.1.1`의 헤드리스 API와 이전 0.1.0의 차이를 안내합니다. 아래 실행 페이지는 함께 배포한 실제 패키지·WASM을 사용합니다. 현재 소스에 추가된 기능이 기존 npm 설치본에도 자동으로 포함됐다는 뜻은 아닙니다.

- [공개 API 직접 실행](./playground.mdx): 함수·JSON 인수·실제 결과/오류·전후 상태 확인
- [HeadlessEditor](./editor.md): 문서 열기·선택·명령·저장·수명 계약
- [선택과 서식](./selection.md): typed 명령과 지원 경계
- [암호·취소 예제](../guide/password.md): 암호 후보 재시도·기존 문서 보존·readonly 경계
- [편집·저장 예제](../guide/editing.md): 현재 workspace 예제
- [패키지 이름과 게시 상태](../guide/package-names.md): 기존 npm과 새 API의 구분

## 문서 파일 도구와 SDK의 경계

[CLI 사용법](../guide/cli.md#새-파일의-표-삭제그림-삽입의미-html)과 [MCP 추가 도구](../guide/mcp.md#011의-새-파일-도구)는 0.1.1의 표 전체 삭제·PNG/JPEG 삽입·의미 HTML 파일 내보내기 및 기존 그림 교체를 안내합니다. 이전 npm 0.1.0에는 없는 기능입니다.

0.1.1 루트 SDK는 같은 공통 서비스를 사용하는 `toHtml(bytes, options): Promise<string>`을 제공합니다. 이전 npm 0.1.0에는 없습니다.

<!-- example:html.ts -->

```ts
import { toHtml } from '@ohah/hwpjs';

export async function exportHTML(
  documentBytes: Uint8Array,
  wasmBytes: Uint8Array,
): Promise<string> {
  return toHtml(documentBytes, {
    wasm: wasmBytes,
    embedImages: 'supported',
  });
}
```

`wasm`은 필수이며 함수가 파일이나 네트워크에서 자동으로 읽지 않습니다. `embedImages`는 `supported`(기본) 또는 `none`, 선택 옵션은 `title`과 `fragment`입니다. 반환값은 HTML 문자열이며 파일 저장 영수증을 반환하는 CLI `export-html`과 구분합니다. 의미 HTML은 원본 서식·페이지 배치 동등성이나 무손실 변환을 보장하지 않습니다. 미지원 이미지와 미관측 내용은 경고·참조로 남깁니다.

현재 파일 명령은 웹 UI·열린 헤드리스 편집 세션 undo와 연결되지 않았습니다. 참조·원문 SHA·크기 단위와 안전한 새 파일 게시의 제약은 [문서 파일 변환 계약](https://github.com/ohah/hwpjs/blob/main/docs/document-file-transforms.md)이 단일 출처입니다.
