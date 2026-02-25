# MEMORY.md

Long-term memory and context for this workspace. Update this file with decisions, lessons learned, and things to remember across sessions.

---

## 테스트 PR 기록

하트비트에서 테스트 코드 PR을 올릴 때마다 아래에 한 줄씩 추가. 같은 유형 작업이 겹치지 않도록 참고.

| 날짜       | 브랜치            | PR 제목/번호 | 작업 요약 |
| ---------- | ------------------ | ------------ | --------- |
| 2026-02-24 | test/document-module-unit-tests | test(core): add document module unit tests (PR #21) | Document 모듈에 필드 접근성, 직렬화 가능성 등을 검증하는 단위 테스트 추가 |
| 2025-02-24 | test/viewer-markdown-unit-tests | test(core): add viewer/markdown unit tests (PR #22) | Viewer Markdown 모듈에 MarkdownOptions 빌더 패턴, 생성자 체이닝, 주요 변환 함수 검증 테스트 추가 |
| 2025-02-24 | test/viewer-core-unit-tests | test(core): add viewer/core bodytext and outline unit tests (PR #23) | viewer/core 모듈에 bodytext 프로세싱, OutLineNumberTracker 단위 테스트 추가 |
| 2026-02-25 | test/viewer-html-image-unit-tests | test(core): add viewer/html image module unit tests (PR #26) | Image rendering functions (render_image, render_image_with_style)에 대한 9개 단위 테스트 추가 |
| 2026-02-25 | test/viewer-html-styles-unit-tests | test(core): add viewer/html styles module unit tests (PR #27) | Styles utility functions (round_to_2dp, int32_to_mm)에 대한 13개 단위 테스트 추가 |
| 2026-02-25 | test/viewer-html-options-unit-tests | test(core): add viewer/html HtmlOptions unit tests (PR #28) | HtmlOptions 구조체 기본값, 이미지/HTML 출력 디렉토리, 버전/페이지 정보 포함, CSS 접두사 설정 테스트 추가 |
| 2026-02-25 | test/viewer-html-pagination-unit-tests | test(core): add viewer/html pagination module unit tests (PR #29) | PaginationContext/PaginationResult 구조체, PageBreakReason 열거형, 컨텍스트 초기화 및 결과 검증 테스트 추가 |
| 2026-02-25 | test/viewer-html-render-module-unit-tests | test(core): add viewer/html render module unit tests (PR #30) | TextStyles 기본값, 렌더러 메서드 (render_text, render_bold, render_italic, render_underline, render_strikethrough, render_superscript, render_subscript), 엣지 케이스 및 경계값 테스트 14개 추가 |
| 2026-02-25 | test/viewer-html-text-module-unit-tests | test(core): add viewer/html text module unit tests (PR #31) | ParaText, ParaCharShape 레코드 처리 검증. CharShapeInfo 필드(shape_id, position) 및 형 변환(usize → u32) 8개 단위 테스트 추가 |
| 2026-02-25 | test/viewer-html-page-module-unit-tests | test(core): add viewer/html page module unit tests (PR #32) | HtmlPageBreak 구조체 및 Display impl 테스트, HTML 포맷팅 태그 검증 (5개 테스트), 코드 정리 (text_test/styles_test 경고 수정) |
| 2026-02-25 | test/styles-edge-case-tests | test(core): add styles module edge case tests and remove broken render_test (PR #40) | styles_test.rs에 11개의 엣지 케이스 테스트 추가; round_to_2dp 대형/초소수/경계값, int32_to_mm 최대/최소값/반단위/유리수 테스트; 컴파일 오류 있는 render_test.rs 삭제 |
| 2026-02-25 | test/document-edge-cases | test(document): add edge case tests for FileHeader parsing (PR #42) | document 파일 헤더 빈 데이터, 최소 유효 |
| 2026-02-25 | test/page-html-edge-case-tests | test(core): add page html edge case tests (PR #41) | page_test.rs에 5개의 엣지 케이스 테스트 추가; HtmlPageBreak 클론/복사, 여러 인스턴스 동등성, Display impl, 공백 문자 방지, 중첩 태그 방지 테스트 |

---

(비어 있음)

---
