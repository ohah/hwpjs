# 미구현 스펙 처리 구현 — 최종 코드 리뷰 보고서

**계획:** `documents/plans/2026-02-21-unimplemented-specs-handling.md`  
**범위:** 전체 구현 (Task 1~5 + Task 5 follow-up)  
**BASE_SHA:** 660cfd4  
**HEAD_SHA:** 449db3a  
**커밋:** 82bf8a4, 7e5a19f, b1a779a, 1b41370, e30a425, 449db3a

---

## 1. 계획 목표 달성 여부

| 목표 | 계획 | 구현 상태 | 비고 |
|------|------|-----------|------|
| HTML 각주 | footnote 참조 + 문서 말미 블록 | ✅ | `CtrlHeaderResult.footnote_ref_html`, `FootnoteEndnoteState`, body 끝 `<div class="…footnotes">` |
| HTML 미주 | endnote 참조 + 문서 말미 블록 | ✅ | 동일 패턴, `…endnotes` |
| HTML 머리말 | header 영역 본문 상단 | ✅ | `header_html`, document.rs 선수집 후 `<body>` 직후 출력 |
| HTML 꼬리말 | footer 영역 본문 하단 | ✅ | `footer_html`, 본문·각주/미주 블록 앞에 출력 |
| HTML 구역 정의 | section_def 자식 문단 렌더 | ✅ | `extra_content`, `<div class="…section-def">` |
| HTML 단 정의 | column_def 자식 문단 렌더 | ✅ | `extra_content`, `<div class="…column-def">` |
| 글자 모양 | CharShape → bold/italic/underline 등 | ✅ | core/paragraph.rs `char_shape_to_text_styles`, 구간별 `render_text` |
| 개요 번호 HTML | 문단 앞 span | ✅ | paragraph.rs에서 `compute_outline_number` + `format_outline_number`, `<span class="…outline-number">` |
| 개요 번호 Markdown | 목차 번호 형식 | ✅ | `render_outline_number`, `convert_to_outline_with_number`에서 core 공통 사용 |

**결론:** 계획에 명시된 HTML 컨트롤(각주, 미주, 머리말, 꼬리말, section_def, column_def), 글자 모양 적용, 개요 번호(HTML·Markdown)가 모두 구현되어 **계획 목표는 충족**됨.

---

## 2. 태스크 간 일관성

### 2.1 CtrlHeaderResult 사용

- **공통:** 모든 HTML ctrl_header 모듈이 `CtrlHeaderResult`를 반환하고, `mod.rs`의 `process_ctrl_header`에서 한 곳에서 디스패치.
- **필드 사용:** footnote/endnote → `footnote_ref_html`/`endnote_ref_html` + `FootnoteEndnoteState`로 본문 외 블록 수집. header/footer → `header_html`/`footer_html`. section_def/column_def → `extra_content`.
- **document.rs 흐름:** 머리말/꼬리말은 **선수집**(본문 루프 전) 후 body 상단/하단에 출력. 각주/미주는 본문 루프에서 `note_state`로 수집 후 body 끝에 블록 출력. `extra_content`는 문단 내 `render_paragraph`에서 수집해 문단 끝에 붙임. 역할 분리가 명확함.

### 2.2 네이밍·패턴

- **클래스 접두사:** `options.css_class_prefix` 사용 (`ohah-hwpjs-footnote`, `ohah-hwpjs-header` 등). 일관됨.
- **함수 시그니처:** Task 1~3의 `process_*`는 모두 `(header, children, paragraphs, document, options[, note_state])` 형태. footnote/endnote만 `note_state` 추가.
- **빈 입력 처리:** 각 모듈에서 `paragraphs_from_children_or_param`으로 문단 목록 획득 후 `is_empty()`면 빈 결과 반환. 동일 패턴.

### 2.3 document.rs 흐름

- 머리말/꼬리말: control_mask로 필터 후 선수집 → body 직후/본문·각주·미주 앞에 출력.
- 본문: `!has_header_footer`인 문단만 페이지/문단 렌더링. `render_paragraph` 내부에서 `process_ctrl_header` 호출 시 `note_state` 전달로 각주/미주 참조·내용 수집.
- 구역/단: 문단 레코드의 CtrlHeader 처리 시 `extra_content`만 수집해 문단 끝에 붙임.

일관된 구조이며, 계획의 “문서 레벨 상태로 수집 후 body 끝에 삽입” 방식과 부합함.

---

## 3. 남은 기술 부채 및 권장 사항

### 3.1 Critical

- **.bak 파일**
  - `crates/hwp-core/src/viewer/html/paragraph.rs.bak`, `crates/hwp-core/tests/snapshot_tests.rs.bak`이 워크스페이스에 존재. 사용자 안내대로 인덱스에서는 제거된 상태.
  - **권장:** 해당 파일들을 삭제하고 `.gitignore`에 `*.bak` 추가 후, 필요 시 `git rm --cached`로 이전 커밋에 포함된 경우 정리.

### 3.2 Important — 중복 제거 (Task 1~3 리뷰에서 반복 언급)

- **`paragraphs_from_children_or_param`**
  - footnote, endnote, header, footer, section_def, column_def **6개 모듈**에 동일 private 함수가 각각 복사되어 있음.
  - **권장:** `ctrl_header/mod.rs` 또는 공통 헬퍼 모듈에 `fn paragraphs_from_children_or_param(...)` 한 곳만 두고, 각 모듈에서 재사용. bodytext의 `find_paragraphs_in_records`와 의미가 같으므로, 필요 시 core와의 공통화도 검토 가능.

### 3.3 Important — Task 5 관련 (기존 task5 리뷰와 동일)

- **확장 개요 레벨(8–10):** `format_outline_number(level, 0)` 시 `"0."` 출력. 명세에 맞게 레벨 8–10은 번호 생략 또는 별도 형식으로 다루는 것이 좋음.
- **스냅샷 클래스 접두사:** outline HTML 스냅샷이 `outline-number`로만 나오는 경우, 테스트 옵션의 `css_class_prefix`를 프로젝트 기본(`ohah-hwpjs-`)과 맞추면 일관성 확보에 유리함.

### 3.4 Minor

- **core/bodytext.rs와 HTML document.rs 이중 흐름:**  
  머리말/꼬리말·각주/미주는 HTML은 `document.to_html`에서 직접 수집·출력하고, Markdown 등은 `process_bodytext`에서 `DocumentParts`로 처리. “HTML은 to_html, 나머지는 process_bodytext”로 역할이 나뉘어 있어 현재는 일관적이나, 장기적으로 두 경로의 동작이 스펙과 동일하게 유지되도록 주의가 필요함.
- **render_paragraphs_fragment:**  
  각주/미주·머리말/꼬리말·구역/단에서 공통으로 사용. `note_state: None`, `outline_tracker: None`으로 호출되어 의도대로 동작함.

---

## 4. 강점 요약

1. **계획 대비 완결성:** 5개 태스크 + follow-up이 계획서 단계(실패 테스트 → 구현 → 스냅샷/테스트)에 맞게 구현됨.
2. **CtrlHeaderResult 설계:** 한 결과 구조체로 참조/블록/인라인을 구분해 document.rs에서 수집·배치가 단순함.
3. **개요 번호 공통화:** `viewer/core/outline.rs`로 트래커·계산·형식 생성을 모아 HTML/Markdown이 동일 로직을 사용함.
4. **글자 모양:** DocInfo CharShape와 ParaCharShape를 연결해 구간별로 `render_text`에 전달하는 구조가 명확함.
5. **테스트:** `bun run test:rust` 18개 통과. footnote_endnote, headerfooter, outline 등 관련 스냅샷/단위 테스트가 포함됨.

---

## 5. 머지 전 체크리스트

| 항목 | 상태 |
|------|------|
| 계획 목표 전부 구현 | ✅ |
| 테스트 통과 | ✅ (18/18) |
| CtrlHeaderResult·document.rs 흐름 일관성 | ✅ |
| .bak 파일 인덱스 제거 | ✅ (사용자 확인) |
| .bak 파일 실제 삭제 및 .gitignore | ⚠️ 권장 |
| paragraphs_from_children_or_param 중복 제거 | ⚠️ 권장 (머지 필수 아님) |
| 확장 개요 레벨·스냅샷 접두사 | ⚠️ 권장 |

---

## 6. 최종 평가 및 머지 권고

- **전체:** 미구현 스펙 처리 계획의 목표(HTML 컨트롤 6종, 글자 모양, 개요 번호 HTML/Markdown)가 구현되었고, 태스크 간 패턴과 document.rs 흐름이 일관적임.
- **머지 적합성:**  
  - **바로 머지 가능:** .bak이 인덱스에서 제거된 상태라면 기능·테스트 기준으로는 머지해도 무방함.  
  - **권장 후 머지:** (1) .bak 파일 삭제 및 `.gitignore`에 `*.bak` 추가, (2) `paragraphs_from_children_or_param` 공통화를 같은 브랜치에서 진행한 뒤 머지하면 유지보수성이 더 좋아짐.
- **머지 후:** 확장 개요(8–10) 표시 규칙과 스냅샷용 `css_class_prefix` 일관성은 이슈/후속 작업으로 처리해도 됨.

**결론:** 구현은 계획을 만족하고 품질도 양호하므로, **머지 가능**하다. 위 권장 사항(.bak 정리, 중복 제거)을 반영하면 더 좋다.

---

## 7. 최종 검토 요약 (2026-02-22)

### Ready to merge? **예 (Yes)**

- 계획 5개 태스크 목표 모두 충족. 테스트 18/18 통과.
- `.bak`은 현재 **인덱스에서 제거됨** (`git status`: `D`). 워크스페이스에는 물리 파일이 남아 있으므로 삭제 + `.gitignore` 권장.

### 주요 강점

- **CtrlHeaderResult** 한 구조체로 참조/블록/인라인 구분, document.rs 수집·배치가 단순함.
- **개요 번호** core/outline.rs 공통화로 HTML·Markdown 동일 로직 사용.
- **글자 모양** DocInfo CharShape → 구간별 `render_text` 전달 구조 명확.
- **일관된 네이밍** `options.css_class_prefix` 사용. (단, outline **스냅샷**은 `test_all_fixtures_html_snapshots` 경로로 `css_class_prefix=""` 사용해 `outline-number`로 저장됨 — 단위 테스트는 `ohah-hwpjs-outline-number` 검증.)

### 남은 권장 사항

| 우선순위 | 항목 |
|----------|------|
| 권장 | .bak 파일 삭제 + `.gitignore`에 `*.bak` 추가 |
| 권장 | `paragraphs_from_children_or_param` 6곳 → mod.rs 등 한 곳으로 공통화 |
| 권장 | 확장 개요 레벨(8–10) 번호 표시 규칙 명세 정합, outline 스냅샷 접두사 통일(선택) |
