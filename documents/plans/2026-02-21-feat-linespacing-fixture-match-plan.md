---
title: feat(core) 라인스페이싱 HTML 출력을 fixture에 맞게 개선
type: feat
status: active
date: 2026-02-21
---

# feat(core) 라인스페이싱 HTML 출력을 fixture에 맞게 개선

## Enhancement Summary

**Deepened on:** 2026-02-21  
**추가 반영:** agent-browser를 통한 이미지 스냅샷(시각 회귀 검증) 요구사항 반영.

### Key Improvements
1. **이미지 스냅샷 검증**: HTML 문자열·스냅샷 외에, 브라우저에서 렌더링한 결과를 이미지로 캡처해 fixture/기준 이미지와 비교하는 단계 추가.
2. **도구**: Vercel agent-browser CLI 또는 MCP cursor-ide-browser로 로컬 HTML 파일 열기 → 스크린샷 저장 → `*-browser-snapshot.png` 패턴으로 보관(기존 table-caption, table-position과 동일).
3. **검증 체인**: 공식 반영 → 텍스트 스냅샷 갱신 → **이미지 스냅샷 촬영·비교** 순서로 진행.
4. **상세화**: Phase별 세부 단계·분기표·에지 케이스·구현 시 주의사항을 추가하여 실행 가능한 수준으로 구체화.

---

## Overview

`linespacing.hwp`를 HTML로 변환한 결과가 **원본 fixture** `tests/fixtures/linespacing.html`과 일치하도록, line-height / top / height 계산 방식을 스펙·JSON·fixture 기준으로 정리하고 수정한다.  
현재는 `LineSegmentInfo`의 `line_height` 또는 `baseline_distance`와 `use_line_grid`만 사용하며, ParaShape의 `line_spacing_type`·`line_spacing`(값)은 HTML 뷰어에서 사용하지 않아 fixture와 차이가 난다.

## Problem Statement / Motivation

- **AGENTS.md**: 원본 스냅샷 = `fixtures/*.html`; 검증 시 JSON 스냅샷 필수 참조, 임의 상수/하드코딩 금지.
- **현상**: fixture `linespacing.html`은 `line-height:2.79mm`, `top:-0.18mm`, `height:3.53mm` 및 줄별로 다른 line-height(2.79, 6.28, 4.44mm 등)를 가짐. 현재 생성 HTML은 `line-height:3.53mm`, `top:0.00mm` 등으로 다르고, 줄간격 타입(글자에 따라 150%/고정 15pt/여백만 5pt 등)별 차이가 반영되지 않음.
- **목표**: fixture와 mm 2자리까지 일치(또는 허용 오차 명시)하여 시각·자동 검증 기준을 맞춘다.

## Proposed Solution

1. **공식 명시**: HWP 5.0 표 43·44·46·62를 참고해, 문단별 `line_spacing_type`(글자/고정/여백만) + `line_spacing`(또는 `line_spacing_old`)과 `LineSegmentInfo`(line_height, text_height, baseline_distance, line_spacing) 조합에 따른 **CSS line-height·top·height** 계산 공식을 한 곳(설계 문서 또는 `line_segment.rs` 주석)에 정리.
2. **HTML 뷰어 수정**: `viewer/html/line_segment.rs`의 `render_line_segment`에서 ParaShape의 `line_spacing_type`·`line_spacing`(5.0.2.5 미만이면 `line_spacing_old`·표 46 구버전)을 반영하고, use_line_grid와의 분기 및 첫 줄 top 오프셋(-0.18mm 등)을 fixture·JSON과 맞춘다.
3. **수용 기준**: line-height, top, height는 fixture와 mm 2자리까지 동일(필요 시 ±0.01mm 허용). 스냅샷은 “fixture 맞춘 결과”로 한 번 갱신한 뒤 insta로 회귀 검증.

## Technical Considerations

### 핵심 파일

| 역할 | 파일 |
|------|------|
| HTML line-height/top/height 계산 | `crates/hwp-core/src/viewer/html/line_segment.rs` (`render_line_segment` 65–155행, `render_line_segments_with_content` 161행~) |
| ParaShape 파싱·타입 | `crates/hwp-core/src/document/docinfo/para_shape.rs` (line_spacing_type_old 52행, LineSpacingType 196행, attributes3 line_spacing_type 222행, parse 시 line_spacing_old/line_spacing 438–448행) |
| LineSegment 필드 | `crates/hwp-core/src/document/bodytext/line_seg.rs` (line_height, text_height, baseline_distance, line_spacing 46–65행) |
| 스펙 | `documents/docs/spec/hwp-5.0.md` 표 43, 44, 46, 62 |

### line_spacing_type 분기 (구현 시 참고)

| line_spacing_type (또는 _old) | 의미 | CSS line-height 후보 | 비고 |
|-------------------------------|------|----------------------|------|
| ByCharacter (0) | 글자에 따라 % | LineSegment 값이 이미 레이아웃 결과일 가능성; %는 ParaShape 설정, 실제 간격은 표 62 값 | fixture: 100%→2.79mm, 150%→2.79mm, 200%→다른 값 등 |
| Fixed (1) | 고정값(pt) | line_height 또는 고정 pt→mm 변환 | fixture: "고정 값 15pt", "10pt", "20pt", "0pt" |
| MarginOnly (2) | 여백만 지정 | line_spacing 또는 위·아래 여백만 반영 | fixture: "여백만 지정 5pt", "0pt", "10pt" |
| Minimum (3, 5.0.2.5+) | 최소 | 표 46 해석에 따라 최소 높이 적용 | linespacing.hwp에 있을 수 있음 |

- **버전**: `file_header.version < 0x00020500` 또는 `line_spacing == None`이면 `line_spacing_old` + `line_spacing_type_old`만 사용.

### 공식 정리 필요 사항

- **CSS line-height**: 각 줄마다 `LineSegmentInfo.line_height` / `baseline_distance` / `line_spacing` / ParaShape 유도값 중 무엇을 쓰고, `use_line_grid`와 `line_spacing_type`(글자%/고정/여백만)별로 어떻게 분기할지.
- **hls top**: `vertical_position_mm + offset`에서 offset을 `(line_height - text_height)/2` vs baseline 기반, 첫 줄만 -0.18mm 등으로 정의.
- **hls height**: `text_height`만 쓸지, `line_height`와 동일하게 할지( fixture: 대부분 3.53mm, 혼합 줄 7.06mm·5.29mm).
- **버전 fallback**: 5.0.2.5 미만·`line_spacing == null`일 때 `line_spacing_old` + 표 46(2007 이하)만 사용.

### 제한 사항(레거시·AGENTS)

- ParaLineSeg를 span에 넣을 때 width/height/padding 미적용 제한 있음(backlog). 전부 absolute로 하면 줄간격·들여쓰기 CSS 적용이 어렵다는 레거시 노트 있음.
- `affect_line_spacing`(Object 공통)은 현재 미사용; 필요 시 향후 반영.

## Acceptance Criteria

- [ ] **공식 문서화**: line-height / top / height 계산 공식이 스펙·fixture·JSON과 대응되도록 주석 또는 설계 문서에 명시됨.
- [ ] **ParaShape 반영**: HTML 뷰어가 문단별 `line_spacing_type`(및 _old)과 `line_spacing`(및 _old)을 사용해 줄별 line-height 차이(2.79 / 6.28 / 4.44mm 등)를 반영함.
- [ ] **첫 줄 top**: hcI 내 첫 줄 top이 fixture와 일치(e.g. -0.18mm); vertical_position·baseline 보정 공식 정리됨.
- [ ] **fixture 일치**: `linespacing.hwp` → to_html() 결과의 hls `line-height`, `top`, `height`가 `fixtures/linespacing.html`과 mm 2자리까지 일치(또는 명시된 허용 오차 이내).
- [ ] **스냅샷 갱신**: fixture 맞춘 결과를 `snapshot_tests__linespacing_html.snap` 및 `snapshots/linespacing.html`에 반영하고, `bun run test:rust:snapshot` 통과.
- [ ] **회귀 방지**: 기존 다른 fixture(table, table2, noori 등) HTML 스냅샷은 깨지지 않음(필요 시 linespacing만 별도 테스트 옵션).
- [ ] **이미지 스냅샷(agent-browser)**: 생성 HTML을 브라우저에서 연 뒤 agent-browser(또는 cursor-ide-browser MCP)로 스크린샷을 찍어 `tests/snapshots/linespacing-browser-snapshot.png` 등으로 저장하고, 필요 시 기준 이미지와 시각 비교하여 레이아웃·줄간격이 의도대로 보이는지 검증함.

## Success Metrics

- linespacing fixture와 생성 HTML의 hls 스타일(line-height, top, height) diff 제거(또는 허용 오차 내).
- JSON 스냅샷(`linespacing.json`)의 LineSegment·ParaShape 값과 계산 공식이 일치함을 주석/문서로 확인 가능.

## Dependencies & Risks

- **의존성**: linespacing.hwp 버전(5.0.1.7 등)에서 `line_spacing`이 null일 수 있음 → `line_spacing_old` fallback 필수.
- **리스크**: line_spacing_type별(글자%/고정 pt/여백만) 해석이 스펙·한글 동작과 다르면 fixture와 완전 일치 어려움; JSON과 fixture를 대조해 공식 검증 필요.
- **관련 문서**: `documents/plans/2026-02-21-fixtures-html-sync-plan.md`, `fixture_matrix.md`, `audit_report.md`.

## Implementation Phases (권장)

### Phase 1: 공식 정리 및 데이터 대조

- [x] **1.1** `linespacing.json` 추출: `bun run test:rust:snapshot` 또는 `to_json`으로 `linespacing.hwp` → JSON 생성 후 `snapshots/linespacing.json` 확인(없으면 생성).
- [x] **1.2** JSON에서 문단별 ParaShape ID·`line_spacing_type_old`·`line_spacing_old`·`line_spacing`(5.0.2.5+)·`use_line_grid` 목록 작성.
- [x] **1.3** JSON에서 각 LineSegment의 `vertical_position`, `line_height`, `text_height`, `baseline_distance`, `line_spacing`(HWPUNIT) 값을 줄 단위로 표로 정리.
- [x] **1.4** `fixtures/linespacing.html`에서 각 `class="hls"`의 `line-height`, `top`, `height`(mm) 추출 후 1.3과 1:1 매핑(문단/줄 순서 동일 가정).
- [x] **1.5** 매핑표로부터 규칙 유추: (line_spacing_type_old, use_line_grid) 조합별로 line-height에 line_height vs baseline_distance vs 기타 중 어떤 값이 fixture와 대응하는지 기록.
- [x] **1.6** 첫 줄 top -0.18mm: `vertical_position=0`인 줄의 top이 -0.18이 되도록 하는 offset 공식 유추(예: `(baseline_distance - text_height)/2` 또는 `-text_height*비율` 등).
- [x] **1.7** 설계 문서 초안: `documents/plans/` 하위에 `linespacing-formula.md` 또는 `line_segment.rs` 상단 주석으로 위 공식·분기표 정리.

### Phase 2: line_segment.rs 수정

- [ ] **2.1** `render_line_segment` 시그니처: `para_shape: Option<&ParaShape>`는 이미 전달되는지 확인; 필요 시 `line_spacing_type_old`/`line_spacing_old`(및 5.0.2.5+ `line_spacing_type`/`line_spacing`) 접근 경로 확보.
- [ ] **2.2** 버전·필드 fallback: `document.file_header.version` 또는 ParaShape 내 `line_spacing.is_some()` 여부로 5.0.2.5+ vs 구버전 분기; 구버전이면 `line_spacing_type_old`·`line_spacing_old`만 사용.
- [ ] **2.3** line-height 값 분기: Phase 1.5 공식에 따라 `use_line_grid` true일 때는 기존처럼 `segment.line_height`; false일 때 `line_spacing_type`별로 `baseline_distance` / `line_height` / `line_spacing` 또는 ParaShape 값 유도 로직 추가(현재 102–111행 확장).
- [ ] **2.4** top 계산: 첫 줄(또는 hcI 내 첫 줄) 여부 판단(예: `vertical_position == 0` 또는 문단 내 첫 LineSegment). 첫 줄이면 Phase 1.6 공식 적용해 -0.18mm에 맞추고, 나머지 줄은 기존 `vertical_pos_mm + offset` 유지.
- [ ] **2.5** height: fixture가 3.53mm(단일 글자 크기)·7.06mm·5.29mm(혼합)를 쓰므로, `height_mm`을 `segment.text_height` 기반으로 유지할지 `line_height`로 통일할지 결정 후 적용(현재 80–83행).
- [ ] **2.6** 단위: HWPUNIT → mm는 기존 `int32_to_mm`·`round_to_2dp` 유지; pt 사용 시 스펙 또는 1pt = 1/72 inch 등 변환 일관성 확인.
- [ ] **2.7** `render_line_segments_with_content`에서 `para_shape` 조회 시 해당 문단의 ParaShape가 line_spacing 필드를 갖는지 전달 경로 확인(이미 `document.doc_info.para_shapes` 연동 여부 확인).

### Phase 2 에지 케이스

- **혼합 글자 크기 줄**: 한 줄에 10pt+20pt 등이 있으면 `text_height`가 해당 줄의 최대 또는 합산으로 나올 수 있음; fixture 7.06mm·5.29mm와 JSON의 line_height/text_height 대조하여 규칙 확정.
- **line_spacing_old = 0**: "글자에 따라" 또는 "여백 0" 등으로 해석될 수 있음; 표 46·fixture 라벨과 대조.
- **use_line_grid true 문단**: linespacing fixture에 있는지 JSON으로 확인; 있으면 line_height 기반 공식만으로도 fixture와 맞는지 검증.

### Phase 3: 검증 및 스냅샷

- [ ] **3.1** `bun run test:rust:snapshot` 실행 후 linespacing HTML 스냅샷이 변경되었으면 `cargo insta review`로 diff 확인 후 승인(또는 `snapshot_tests__linespacing_html.snap` 및 `snapshots/linespacing.html` 갱신).
- [ ] **3.2** fixture와 생성 HTML diff: `fixtures/linespacing.html`과 `snapshots/linespacing.html`에서 `<link>` 제거·정규화 후 hls의 `line-height`, `top`, `height`만 추출해 비교(스크립트 또는 수동); mm 2자리 일치 또는 허용 오차(±0.01mm) 내인지 확인.
- [ ] **3.3** 불일치 줄이 있으면 해당 줄의 JSON(LineSegment + ParaShape)과 공식 재검토 후 Phase 2 수정 반복.
- [ ] **3.4** 회귀: `test_all_fixtures_html_snapshots` 전체 실행하여 table, table2, table-caption, table-position, noori 등 다른 fixture 스냅샷이 깨지지 않았는지 확인.
- [ ] **3.5** (선택) linespacing만 별도 테스트 함수로 분리해 `css_class_prefix` 등 옵션이 다른 fixture와 충돌하지 않도록 유지.

### Phase 4: Agent-browser를 통한 이미지 스냅샷 (시각 회귀)

- [ ] **4.1 준비**: linespacing용 HTML 경로 확보. 권장: `crates/hwp-core/tests/snapshots/linespacing.html`(to_html 결과 저장) 또는 `fixtures/linespacing.html`. CSS는 fixture의 `linespacing_style.css`를 같은 디렉터리에 두거나, HTML 내 `<style>` 인라인으로 포함된 버전 사용.
- [ ] **4.2 file:// URL**: 로컬 절대 경로 구성. 예: `file:///Users/.../hwpjs/crates/hwp-core/tests/snapshots/linespacing.html`. 브라우저 보안 제한으로 file:// 시 CORS/리소스 로드 이슈가 있으면 간단 로컬 서버(예: `python -m http.server`, `npx serve`)로 서빙 후 `http://localhost:.../linespacing.html` 사용.
- [ ] **4.3 agent-browser 캡처**: 터미널에서 `agent-browser open file://...` 또는 `open http://localhost:.../linespacing.html` 후 `agent-browser screenshot --full crates/hwp-core/tests/snapshots/linespacing-browser-snapshot.png` 실행. 또는 MCP cursor-ide-browser로 동일 URL 열고 전체 페이지 스크린샷 저장.
- [ ] **4.4 저장 위치**: `crates/hwp-core/tests/snapshots/linespacing-browser-snapshot.png` (기존 table-caption-browser-snapshot.png, table-position-browser-snapshot.png와 동일 패턴).
- [ ] **4.5 검증**: (1) 수동으로 이미지를 열어 줄간격·레이아웃이 한글 뷰어 또는 fixture와 유사한지 확인. (2) 기준 이미지가 있으면 픽셀 diff(ImageMagick `compare`, pixelmatch 등)로 차이 영역 확인; 허용 오차(예: 1% 이내 픽셀 차이) 정책 정한 뒤 CI에서 선택 적용.
- [ ] **4.6 CI 정책**: 브라우저/헤드리스 환경이 없을 수 있으므로, 이미지 스냅샷 생성·비교는 로컬/수동 또는 별도 CI job(헤드리스 Chrome 등)으로 제한하고, 기본 CI에서는 텍스트 스냅샷만 필수로 두는 것을 권장.

#### Research Insights (이미지 스냅샷)

**Best practices**
- 시각 회귀는 HTML/텍스트 스냅샷만으로는 발견하기 어려운 레이아웃·폰트 렌더링 차이를 잡는 데 유리함.
- 참조 이미지는 “fixture에 맞춘 후 한 번 촬영한 결과”를 golden으로 두고, 이후 변경 시 diff로 회귀 여부 판단.
- agent-browser: `agent-browser screenshot --full output.png`로 전체 페이지 저장; 로컬 파일은 `file:///absolute/path/to/linespacing.html`로 열기.

**구현 참고**
- 기존 프로젝트에 `table-caption-browser-snapshot.png`, `table-position-browser-snapshot.png`가 있으므로, linespacing도 동일한 네이밍·위치 규칙을 따르면 일관성 유지에 좋음.
- CI에서 브라우저/헤드리스가 없을 수 있으므로, 이미지 스냅샷 단계는 “로컬/수동 실행” 또는 “선택적 CI job”으로 두고, 텍스트 스냅샷은 기존처럼 필수로 유지하는 편이 안전함.

## References & Research

### Internal

- Line-height 계산: `crates/hwp-core/src/viewer/html/line_segment.rs:98–120` (use_line_grid, line_height vs baseline_distance).
- ParaShape 파싱: `crates/hwp-core/src/document/docinfo/para_shape.rs` (line_spacing_old, line_spacing, attributes3 line_spacing_type).
- 테스트: `crates/hwp-core/tests/snapshot_tests.rs` (`test_document_html_snapshot` linespacing, `test_all_fixtures_html_snapshots`).
- Fixture 매칭 패턴: `crates/hwp-core/tests/snapshots/compare-table-fixture-vs-snapshot.md`, AGENTS.md “HTML 뷰어 테스트 규칙”.

### Spec

- `documents/docs/spec/hwp-5.0.md`: 표 43(문단 모양), 표 44(속성1 use_line_grid), 표 46(줄 간격 종류), 표 62(문단 레이아웃 line_height, text_height, baseline_distance, line_spacing).
- `.cursor/skills/hwp-spec/`: 4-2-10-문단-모양 등.

### Related plans

- `documents/plans/2026-02-21-fixtures-html-sync-plan.md` (Phase: linespacing, fixture vs 뷰어 비교).
- `documents/plans/audit_report.md` (table hls line-height 2.79 vs 3.00 등).
- `documents/plans/fixture_matrix.md` (HTML golden 목록·수락 기준).

### 브라우저·이미지 스냅샷

- **agent-browser (Vercel)**: CLI 기반 브라우저 자동화; `agent-browser open <url>`, `agent-browser screenshot [--full] [output.png]`. Skill: `.cursor/plugins/.../compound-engineering/.../skills/agent-browser/SKILL.md`.
- **cursor-ide-browser MCP**: Cursor IDE 연동 브라우저 MCP; 스냅샷·스크린샷 등으로 시각 검증에 활용 가능.
- **기존 이미지 스냅샷**: `crates/hwp-core/tests/snapshots/table-caption-browser-snapshot.png`, `table-position-browser-snapshot.png` — linespacing도 동일 패턴(`linespacing-browser-snapshot.png`)으로 추가.
