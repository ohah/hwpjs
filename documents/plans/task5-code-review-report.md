# Task 5 코드 품질 리뷰 보고서

**범위:** 1b41370..449db3a (feat + fix 커밋)  
**대상:** 개요 번호 처리 (공통 + HTML/Markdown)  
**계획:** `documents/plans/2026-02-21-unimplemented-specs-handling.md` Task 5

---

## 1. 계획 대비 정합성

- **Step 1–2:** 문단 번호/리스트 헤더 확인 및 실패 테스트 작성 → `test_outline_number_in_html_when_document_has_outline` 추가, 개요 문단이 있는 문서에서 `ohah-hwpjs-outline-number` 포함 여부 검증. 계획 충족.
- **Step 3:** 공통 `paragraph` 처리에서 개요 번호 문자열 생성 → `viewer/core/outline.rs` 신규 (`OutlineNumberTracker`, `format_outline_number`, `compute_outline_number`), `process_paragraph`에 `tracker` 전달 및 `render_outline_number` 호출. 계획 충족.
- **Step 4:** HTML에서 개요 번호 출력 → `ParagraphRenderState`에 `outline_tracker`, `render_paragraph` 마지막에 `<span class="…outline-number">` 선두 추가. 계획 충족.
- **Step 5:** Markdown 개요 번호 → `render_outline_number` 구현, `OutlineNumberTracker`를 `viewer/core`로 통합, `convert_to_outline_with_number`가 `compute_outline_number`/`format_outline_number` 사용. 계획 충족.
- **Step 6–7:** 스냅샷/테스트 및 커밋 → 스냅샷 갱신, `test_process_paragraph_applies_char_shape` 제거(비공개 모듈 접근으로 인한 삭제). 계획 충족.

**결론:** Task 5 계획 항목은 모두 반영되었고, 공통 로직을 core로 모으고 HTML/Markdown 각각에 연결한 구조가 계획과 일치함.

---

## 2. 강점

- **공통화:** 개요 번호 로직을 `viewer/core/outline.rs`로 모아 HTML·Markdown이 동일한 `OutlineNumberTracker`/`compute_outline_number`/`format_outline_number`를 사용함. 중복 제거와 스펙 일치에 유리함.
- **트레이트 설계:** `Renderer::render_outline_number`로 형식별 출력만 분리하고, 번호 계산은 공통에 두어 확장 시 PDF/Canvas 등도 같은 규칙을 쓰기 쉬움.
- **소유권 수정 (449db3a):** `process_paragraph`에 `Option<&mut OutlineNumberTracker>`를 넘기고, HTML에서는 `if let Some(ref mut tracker)`로 빌림만 해서 트래커를 이동하지 않도록 한 점이 적절함.
- **테스트:** 본문에 개요 문단이 있는 모든 HWP에 대해 `ohah-hwpjs-outline-number` 포함을 검사하는 방식이 실제 fixture 다양성을 활용함.
- **스펙 반영:** `compute_outline_number`에서 `HeaderShapeType::Outline`, `paragraph_level`, `line_spacing`, 스타일명 "개요 N", `numbering`/`extended_levels` 및 `format_string` 검사가 명세(4.2.8, 4.3.7)와 맞게 구현됨.

---

## 3. 이슈 및 권장사항

### Critical

- **저장소에 .bak 파일 포함**
  - `git show 449db3a --name-only`에 `crates/hwp-core/src/viewer/html/paragraph.rs.bak` 포함. 동일 범위에 `snapshot_tests.rs.bak`도 존재할 수 있음.
  - **조치:** `.bak`을 커밋에서 제거하고, `git rm --cached …/*.bak` 후 커밋. 필요하다면 `.gitignore`에 `*.bak` 추가.

### Important

- **레벨 8–10(확장 개요) 번호 표시**
  - `compute_outline_number`는 `level >= 8`일 때 `Some((level, 0))`를 반환하고, `format_outline_number(level, 0)`는 `_` 분기로 `"{}.", number` → `"0."`이 됨.
  - 확장 레벨은 번호를 쓰지 않는다는 의도라면, `format_outline_number`에서 `level >= 8`이면 빈 문자열 또는 레벨만 반영하도록 분기하거나, `render_outline_number`/HTML span 출력에서 level 8–10은 번호 부분을 생략하는 편이 명세와 일치할 가능성이 높음.
- **HTML 클래스명 일관성**
  - 스냅샷 `snapshot_tests__outline_html.snap`에는 `class="outline-number"`로 나옴. 테스트는 `ohah-hwpjs-outline-number`를 기대하므로, 스냅샷을 만드는 옵션의 `css_class_prefix`가 빈 문자열인지 확인하고, 프로젝트 기본 접두사(`ohah-hwpjs-`)와 맞추려면 해당 스냅샷 생성 테스트의 옵션을 통일하는 것이 좋음.

### Minor

- **`outline.rs` 중첩 분기**
  - `compute_outline_number` 내 `base_level == 7`일 때의 `line_spacing`/스타일명 분기가 깊음. 동작은 스펙에 맞지만, 보조 함수로 빼면 가독성과 단위 테스트가 쉬워짐.
- **`is_format_string_empty_or_null`**
  - 빈 문자열은 “기본 형식 사용”으로 false 반환하는 것이 맞고, null/전부 0만 true로 두는 현재 로직은 의도와 일치함. 다만 함수명이 “empty or null”이어서 “빈 문자열이면 번호 표시”라는 주석을 함수 상단에 한 줄 적어두면 혼동을 줄일 수 있음.
- **레벨 8 이상 시 `get_and_increment`**
  - `get_and_increment(level)`가 `level >= 8`일 때 0을 반환하고 카운터를 건드리지 않는 것이 의도된 동작이면, `compute_outline_number`에서 level 8–10일 때 아예 `get_and_increment`를 호출하지 않고 `Some((level, 0))`만 반환하는 편이 의도가 더 분명해짐 (동작은 동일).

---

## 4. 아키텍처·설계

- **관심사 분리:** 번호 계산(core/outline) ↔ 출력 형식(Renderer) 분리가 잘 되어 있음.
- **bodytext와의 연동:** `Tracker::Html(OutlineNumberTracker)`로 HTML도 트래커를 갖고, `as_outline_tracker_mut()`로 `process_paragraph`에 넘기는 구조가 fix 커밋으로 정리됨. HTML은 `to_html`에서 자체 루프로 `render_paragraph`만 쓰므로 `process_bodytext`의 `process_paragraph`와 이중 적용 없음.
- **Markdown:** `process_bodytext`에서 Markdown일 때는 `convert_paragraph_to_markdown`만 사용하고, 그 안에서 `convert_to_outline_with_number`가 core의 `compute_outline_number`/`format_outline_number`를 사용. 공통 로직 재사용이 일관됨.

---

## 5. 종합 평가

- **계획 이행:** Task 5 요구사항 전반이 구현되었고, 공통 개요 번호 + HTML/Markdown 출력이 계획대로 동작함.
- **품질:** 공통화·트레이트 설계·소유권 수정이 잘 되어 있으나, **.bak 파일이 커밋에 포함된 것은 반드시 제거**해야 함. 확장 레벨(8–10) 번호 표시와 스냅샷용 `css_class_prefix` 일관성은 보완을 권장함.
- **다음 단계:** .bak 제거 커밋 적용 후, 레벨 8–10 표시 규칙을 명세와 맞추고, 스냅샷 옵션을 프로젝트 기본 접두사에 맞추면 Task 5 마무리로 적절함.
