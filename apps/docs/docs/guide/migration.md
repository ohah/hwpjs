# 기존 Rust 문서에서 이동

과거 `legacy/rust/documents` 사이트는 역사로 보존합니다. 해당 사이트의 `@ohah/hwpjs`, napi/WASI 구성, `toJson`/`toHtml`/`toMarkdown`/CLI 예제를 현재 `@hwpjs/core`의 public API로 바꾸어 읽지 마세요.

| 과거 문서의 안내 | 현재 시작점 |
| --- | --- |
| @ohah/hwpjs 설치와 플랫폼별 바이너리 | @hwpjs/* workspace 패키지와 명시 WASM 아티팩트 |
| 전역 변환 함수/CLI | Runtime 주입 → createEditor → load → typed 명령 → save |
| Rust WASI import의 SSR externals 처리 | 문서 예제는 정적 코드 블록, Canvas는 클라이언트 마운트 |
| 광범위 format/spec 문서 목록 | 실제 public API와 현재 지원 제한 중심 |
| React Native에서 파일 변환 호출 | Native provider/아티팩트/실기기 검증 경계를 둔 experimental 안내 |

이 문서 사이트는 레거시 사양·개발 검증 기록 전체를 복제하지 않습니다. 사용자 통합에는 [설치](./installation.md), [Runtime](./runtime.md), [편집과 저장](./editing.md), [프레임워크](../frameworks/vanilla.md), [제한](./limitations.md)을 먼저 참고하세요.
