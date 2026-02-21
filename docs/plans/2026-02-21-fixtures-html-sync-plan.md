# Fixtures 테이블(원본 HTML)과 현재 HTML 구현 동기화 계획

**작성일**: 2026-02-21  
**심화일**: 2026-02-21  
**목표**: `crates/hwp-core/tests/fixtures/` 내 원본 HTML과 현재 Rust HTML 뷰어 출력을 동일하게 만드는 방법 및 단계적 계획을 수립한다.

---

## Enhancement Summary

**Deepened on:** 2026-02-21  
**Sections enhanced:** 문제 정의, 제안 방법, 기술적 접근, 구현 단계, 수락 기준, 참고  
**Research agents used:** explore (fixture/golden/snapshot), best-practices-researcher (insta·HTML golden), code-reviewer, architecture-strategist

### Key Improvements

1. **단일 골든 소스 명시**: HTML 골든은 `fixtures/*.html`만 사용. `snapshots/*.html`은 생성물 보관용이며, 비교 기준은 fixture로 고정.
2. **비교·정규화 규칙 추가**: 공백/줄바꿈 정규화, `<link>` 제거 후 `*_style.css`를 `<style>`로 삽입한 형태로 통일. 필요 시 `html-compare-rs` 도입.
3. **Phase 0 산출물 구체화**: Fixture 매트릭스(stem / has_hwp / has_html / has_css / priority) 및 수락 기준 적용 범위를 "동일 stem에 .hwp와 .html이 모두 있는 fixture"로 한정.
4. **Phase 3 검증 구체화**: "fixture가 있는 stem"에 대해 정규화된 fixture vs 뷰어 출력 비교 테스트 도입, 실패 시 구현 수정 후 insta 갱신.
5. **리스크·예외 정리**: Fixture vs JSON/스펙 충돌 시 우선순위(fixture 기준, 필요 시 fixture를 스펙/JSON에 맞게 수정 검토), 수치 포맷·반올림·htG 사용 조건 문서화.

### New Considerations Discovered

- **insta와 골든 공존**: 골든을 fixtures로 두고, insta 스냅은 "현재 구현" 보조 또는 fixture 비교 실패 시 갱신 대상으로 역할 분리.
- **CI**: `CI=true`(또는 `GITHUB_ACTIONS`) 설정 시 insta는 스냅 갱신 없이 diff 시 실패하도록; Rust 스냅샷 테스트를 CI에 포함 권장.
- **HTML 비교**: `html-compare-rs`의 `assert_html_eq!`, `HtmlCompareOptions`(ignore_whitespace, presets)로 의미적 동일성 비교 가능.
- **동치 정의**: "합리적 동치" 예외(스펙/JSON 해석상 동일 의미·표현만 다른 경우)는 문서로 목록화해 일관된 판단 기준 유지.

---

## 1. 문제 정의

### 1.1 현재 구조

- **원본 스냅샷(기준)**: `crates/hwp-core/tests/fixtures/*.html` + `*_style.css`
  - 한/글 등 참조용으로 만든 “기대 출력” HTML
  - `<link rel="stylesheet" href="*_style.css">` 로 외부 CSS 참조
  - 각 요소에 인라인 `style` 적용
- **현재 구현 출력**: `crates/hwp-core/tests/snapshots/*.html` (및 `*.html.snap`)
  - Rust 뷰어(`hwp_core::viewer::html`)가 HWP → HTML 변환한 결과
  - `<link>` 대신 `<style>` 인라인으로 CSS 포함 (AGENTS.md 규칙)
  - 클래스명·구조·스타일 값이 fixture와 다를 수 있음

### 1.2 불일치 유형 (예: table.hwp)

| 구분 | Fixture (table.html) | 현재 구현 (snapshots/table.html) |
|------|----------------------|-----------------------------------|
| CSS | `<link href="table_style.css">` | `<style>...</style>` (규칙상 동일 목표) |
| 테이블 래퍼 | `htb`만 사용 (위치: left:31mm, top:35.99mm) | `htG` > `htb` (htG: left:30mm, top:35mm; htb: left:1mm, top:1mm, width:39.99mm, height:50mm) |
| 셀 높이 | 25mm + 25mm (병합 반영) | 50mm 등으로 상이 |
| SVG viewBox | -2.50 -2.50 46.99 56.99, size 46.99×56.99mm | -2.5 -2.5 44.99 55, size 44.99×55mm |
| hls 스타일 | line-height:2.79mm, top:-0.18mm | line-height:3.00mm, top:-0.26mm |

이 외에도 다른 fixture(linespacing, lists-bullet, table-caption, table-position 등)에서 구조·수치·클래스 불일치가 있을 수 있다.

### 1.3 목표

- **기준**: Fixtures의 HTML이 “정답”이다. (AGENTS.md: 원본 스냅샷 기준)
- **동일하게**: `<link>` → `<style>` 치환만 허용하고, 구조·태그·클래스·인라인 스타일은 fixture와 동일하게 맞춘다.
- **검증**: JSON 스냅샷 + 스펙 문서 기반으로 값 유도, 하드코딩 금지.

### 1.4 용어 및 적용 범위

- **Golden**: fixture HTML (및 비교 시 `*_style.css`를 인라인한 정규화 버전). 단일 진실 원천(SSOT).
- **비교 대상**: 뷰어가 생성한 HTML (`document.to_html(&options)`).
- **수락 기준 적용 범위**: 동일 stem으로 `.hwp`와 `.html`이 **둘 다 있는** fixture만. (Phase 0에서 fixture 매트릭스로 목록 확정.)

---

## 2. 제안 방법

### 2.1 단일 기준원(Single Source of Truth)

- Fixture HTML + 동일 이름 `*_style.css` 를 golden으로 사용.
- 구현 변경 시 `snapshots/*.html` 또는 `*.html.snap` 이 fixture와 비교 가능하도록 유지.

### 2.2 비교·정렬 방식

1. **Fixture 목록 정리**: fixtures 디렉토리에서 `*.html` 목록 추출 (table.html, linespacing.html, lists-bullet.html, table-caption.html, table-position.html 등). Phase 0에서 **fixture 매트릭스** 산출: (stem, has_hwp, has_html, has_css, priority).
2. **Per-fixture diff**: 각 fixture에 대해 동일 stem의 `.hwp` 파싱 → 현재 뷰어 HTML 생성 → **정규화 후** fixture HTML과 비교.
3. **우선순위**: 테이블 관련(table, table2, table-caption, table-position) → 나머지 fixture 순으로 정렬해 하나씩 수렴.

**정규화 규칙 (비교 전 적용)**  
- 공백·줄바꿈 정규화 (의미만 비교 시 재현 가능).  
- Fixture 쪽: `<link rel="stylesheet" href="*_style.css">` 제거 후, 해당 `*_style.css` 내용을 `<style>...</style>`로 삽입한 문자열을 golden으로 사용.  
- 구현체 출력은 이미 `<style>` 인라인이므로 동일 규칙으로 정규화한 뒤 비교.  
- (선택) Rust `html-compare-rs` 도입: `assert_html_eq!(expected_norm, got_norm, HtmlCompareOptions { ignore_whitespace: true, ... })` 또는 `presets::strict()` 사용. 참고: [html-compare-rs](https://docs.rs/html-compare-rs), [insta quickstart](https://insta.rs/docs/quickstart).

### 2.3 데이터·스펙 참조

- **JSON**: `crates/hwp-core/tests/snapshots/*.json` 에서 테이블/문단/스타일 값 확인.
- **스펙**: `docs/docs/spec/hwp-5.0.md`, `.cursor/skills/hwp-spec/` 등에서 단위·의미 해석.
- 모든 수치·클래스는 JSON/스펙에서 유도하고, 임의 상수 사용 금지.

### 2.4 테스트 자동화

- 기존: `snapshot_tests.rs` 에서 `test_document_html_snapshot`, `test_all_fixtures_html_snapshots` 등으로 생성 HTML을 insta 스냅샷과 비교.
- 보강: **fixture가 있는 stem**에 대해 정규화된 fixture(link→style 치환) vs 뷰어 출력 비교 테스트 도입. 실패 시 구현 수정 후 insta 갱신. CI에서는 `CI=true`로 스냅 자동 갱신 없이 diff 시 실패. 참고: insta CLI, Golden file testing (matttproud.com).

---

## 3. 기술적 접근 (구현 쪽)

### 3.1 HTML 뷰어 수정 포인트

- **테이블**: `crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs`
  - htG 사용 조건 (캡션 유무 등)을 fixture와 맞추기: table.html처럼 캡션 없는 경우 htG 없이 htb만 낼지 결정.
  - htb/htG의 left/top/width/height를 JSON·스펙 기반으로 fixture와 동일한 값으로 계산.
- **테이블 셀/라인**: 셀 높이·병합 해석이 fixture와 다르면 스펙·JSON과 대조해 동일 로직으로 수정.
- **공통**: `document.rs`, `page.rs`, `paragraph.rs`, `line_segment.rs` 등에서 hcD/hcI/hls/htb/hce 등 클래스·인라인 스타일이 fixture와 동일한 단위(mm)·포맷으로 나가도록 정리.
- **CSS**: `styles.rs` 등에서 생성하는 클래스 집합이 `*_style.css` 와 동일 의미를 갖도록 유지 (이미 대부분 동일할 수 있음).

### 3.2 옵션 정리

- `HtmlOptions` 의 `css_class_prefix`: fixture와 동일하게 하려면 빈 문자열 사용 (table 등은 이미 그렇게 테스트 중). noori 등 다른 fixture는 필요 시 fixture별로 prefix 여부 확인.

---

## 4. 구현 단계(안)

1. **Phase 0 – 현황 정리**
   - **Fixture 매트릭스** 산출: (stem, has_hwp, has_html, has_css, priority). `common::find_fixture_file`, `find_all_hwp_files` 참고.
   - Fixture가 있는 항목에 대해 “현재 출력 vs fixture” diff 요약을 diff_summary 또는 audit_report.md에 문서화. 수락 기준: 동일 stem에 .hwp와 .html이 모두 있는 fixture만 대상.

2. **Phase 1 – 테이블 fixture 우선**
   - htG 사용 조건을 fixture별로 확인하고, 캡션 유무·위치에 따른 규칙을 render.rs 또는 테이블 모듈에 문서화. table.html은 캡션 없음 → htG 없이 htb만.
   - table.hwp / table.html: htG 제거 또는 조건부 적용, htb 위치·크기, 셀 높이, SVG viewBox/size, hls 스타일을 fixture와 맞춤. mm·viewBox 등 수치 포맷(소수 자리, 반올림)을 fixture와 동일하게 점검 (예: round_to_2dp).
   - table2, table-caption, table-position 순으로 동일 방식 적용. 각 fixture 완료 시: 뷰어 HTML 정규화 후 fixture(link→style 치환)와 diff; 0이면 다음으로.

3. **Phase 2 – 나머지 fixture**
   - linespacing, lists-bullet, multicolumns-in-common-controls, pagedefs, strikethrough 등에 대해 diff 후 수정.
   - noori 등 fixture별 css_class_prefix 정리 및 옵션/테스트 반영.

4. **Phase 3 – 검증 강화**
   - fixture가 있는 모든 stem에 대해 정규화된 fixture(link→style) vs 뷰어 출력 비교 테스트 수행. 실패 시 구현 수정 후 insta 스냅샷 갱신.
   - CI에 Rust 스냅샷 테스트 포함, CI=true로 스냅 자동 갱신 비활성화. `cargo insta review` 워크플로 유지.

---

## 5. 수락 기준

- Fixture가 있는 모든 .hwp에 대해: `<link>` → `<style>` 차이만 있고, 나머지 HTML 구조·태그·클래스·인라인 스타일이 fixture와 동일 (또는 스펙/JSON에 근거한 합리적 동치). 동치 정의: 기본은 fixture와 동일, 스펙/JSON 해석상 동일 의미는 예외 문서화. Fixture vs JSON/스펙 충돌 시 fixture 기준, 수치 불일치 시 fixture 수정 검토 후 불가 시 예외 문서화.
- 기존 JSON/마크다운 스냅샷 테스트 유지.
- AGENTS.md의 “HTML 뷰어 테스트 규칙”을 만족.

---

## 6. 참고

- **AGENTS.md**: HTML 뷰어 테스트 규칙, 원본 스냅샷 기준, JSON 참조 필수.
- **코드**: `crates/hwp-core/tests/snapshot_tests.rs`, `common::find_fixture_file`, `find_all_hwp_files`, `crates/hwp-core/src/viewer/html/`, `ctrl_header/table/render.rs`, `size.rs`.
- **Fixtures**: `crates/hwp-core/tests/fixtures/*.html`, `*_style.css`.
- **골든 역할**: HTML 골든은 `fixtures/*.html`만 사용. `snapshots/*.html`은 생성물 보관용. 골든 수정 시 해당 fixture의 JSON·스펙과 일치하는지 검토.
- **옵션**: 픽스처별 골든은 단일 `HtmlOptions` 세트를 문서화하고, 동기화 테스트는 그 세트만 사용 (예: table은 css_class_prefix 빈 문자열).
- **참고 링크**: [insta.rs](https://insta.rs/docs/quickstart), [html-compare-rs](https://docs.rs/html-compare-rs), [Golden file testing](https://matttproud.com/blog/posts/golden-file-testing.html), [Fixture-first Development](https://formidable.com/blog/2020/fixture-first/).
