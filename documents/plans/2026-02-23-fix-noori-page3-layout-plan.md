---
title: fix noori HTML 뷰어 페이지 3 레이아웃
type: fix
status: active
date: 2026-02-23
---

# fix: noori HTML 뷰어 페이지 3 레이아웃 수정

## Enhancement Summary

**Deepened on:** 2026-02-23  
**Sections enhanced:** Overview, Problem, Proposed Solution, Technical Considerations, Acceptance Criteria, Dependencies & Risks, References  
**Research agents used:** best-practices-researcher, architecture-strategist, code-simplicity-reviewer, performance-oracle, pattern-recognition-specialist

### Key Improvements

1. **hcd_position 명시 설정**: 객체 페이지 브레이크 직후 `current_page_def`로 (left_mm, top_mm) 계산해 `position_next.hcd_position = Some(...)` 설정. 이미 451–466에서 쓰는 공식 재사용 시 추가 연산 0.
2. **테이블 조각 높이 계약**: `content_height_mm`과 분리해 **optional `fragment_height_mm`**(또는 `table_fragment_height_mm`) 도입. document/paragraph에서 remainder 계산 후 table에 전달; table은 해당 값이 있으면 htb height와 viewBox 높이에만 사용.
3. **(3)을 “솔루션”이 아닌 “검증”으로**: first_para_vertical_mm/hcd 리셋은 코드 변경 없이 AC1/AC2/AC7로 검증. 별도 리셋 전용 코드 경로 추가하지 않음.
4. **성능 Quick win**: 테이블당 `content_size`/`htb_size`/`resolve_container_size`가 paragraph와 render에서 각각 호출되는 이중 호출을, paragraph에서 구한 값을 render에 전달해 1회로 축소 (플랜 범위 외 권장).

### New Considerations Discovered

- **문단 vs 객체 페이지네이션 일관성**: “새 페이지가 시작된 뒤, 그 페이지에 그리는 콘텐츠에는 항상 그 새 페이지의 hcD를 명시적으로 넘긴다”는 규칙으로 두 경로를 맞추기.
- **fragment_height_mm 계산 위치**: 한 곳(document 또는 paragraph)에서만 `fragment_height_mm = total_height_mm - already_drawn_mm` 계산하고, size/geometry에서 재계산하지 않기.
- **YAGNI**: 테이블 조각은 “2→3 페이지, 한 테이블이 한 번 잘리는 경우”만; 여러 조각/다중 페이지 조각용 리스트나 일반화된 fragment 모델은 추가하지 않기.
- **Naming**: `position_next`에 “객체 페이지 브레이크 직후 같은 문단 재렌더용 위치” 주석 또는 `position_for_next_page` 등 의도가 드러나는 이름 고려.

---

## Overview

noori HWP 문서를 HTML로 변환했을 때 **3페이지 레이아웃이 깨져** fixture(원본 noori.html)와 다르게 표시되는 문제를 수정한다. 1페이지는 인라인 테이블 htb 위치 수정으로 이미 맞춰진 상태이며, 2→3페이지 구간에서 테이블이 페이지 나누기(TableOverflow)로 잘릴 때 3페이지 쪽 테이블 높이·viewBox·hcD 위치 등이 fixture와 불일치하는 것이 핵심 이슈로 파악되었다.

### Research Insights

- **업계 패턴**: Paged.js·Chromium LayoutNG·mPDF 등은 페이지 브레이크 후 **다음 페이지 콘텐츠 원점**을 명시하고, 새 박스(페이지) 좌표계에서 계속 배치함.
- **단일 진실 공급원**: 페이지 크기·여백·콘텐츠 높이는 `PageDef`/`current_page_def` 한 곳에서만 유도해 페이지네이션·위치 계산·재렌더가 동일 수치를 쓰도록 함.

## Problem Statement / Motivation

- **현상**: noori-fixture.png(원본)와 noori-ours.png(현재 출력) 비교 시 **페이지 3**에서 레이아웃이 틀어짐(테이블 잘림·위치 어긋남).
- **영향**: noori는 대표 fixture로 스냅샷·시각 비교 기준이 되므로, 3페이지 수정이 fixture 일치 및 회귀 방지에 필요함.
- **원인 후보** (SpecFlow·리서치 기반):
  1. **객체 페이지네이션 후 재렌더 시 `hcd_position`**: 테이블이 2페이지에서 넘치면 새 페이지로 나눈 뒤 같은 문단을 다시 그릴 때 `position_next.hcd_position`이 `None`으로 전달됨 (`document.rs` 505–507). 새 페이지의 hcD 좌표가 명시적으로 설정되지 않을 수 있음.
  2. **3페이지 테이블 viewBox/높이**: fixture 3페이지는 SVG `viewBox` 높이 226.19 등으로 전체 표 높이를 반영하는데, 현재 스냅샷은 약 149.13으로 잘려 나옴. 2→3 페이지 분할 시 “3페이지에 그리는 테이블 조각”의 높이 계산 또는 viewBox/htb height 전달 오류 가능성.
  3. **first_para_vertical_mm 리셋**: 새 페이지에서 `first_para_vertical_mm`/`hcd_position` 리셋 후 테이블 위치 계산에 쓰이는 값이 fixture/스펙과 일치하는지 검증 필요.

### Research Insights

- **근본 원인**: 재렌더 시 `position_next`가 `hcd_position = None` 상태로 채워져, table/position fallback만 사용 → 3페이지 hcD/테이블 위치가 어긋날 수 있음.
- **viewBox 불일치**: CSS Fragmentation·LayoutNG의 “연속 조각 높이 = 전체 − 이미 그린 높이” 규칙과 동일하게, 같은 값을 htb `height`와 viewBox 높이 둘 다에 적용해야 fixture(226.19)와 일치함.

## Proposed Solution

1. **객체 페이지네이션 후 새 페이지 hcD 좌표 명시**
   - 테이블(또는 객체) 페이지 브레이크로 새 페이지를 연 직후, **새 페이지의 hcD 좌표**를 `current_page_def`에서 계산해 `position_next.hcd_position`에 넣어 재렌더 시 테이블 위치 계산이 올바른 기준을 사용하도록 한다.
   - 수정 후보: `document.rs` (객체 페이지네이션 분기, `position_next` 구성).

2. **2→3 페이지 분할 시 3페이지 쪽 테이블 높이·viewBox 일치**
   - 3페이지에 그리는 “테이블 조각”의 높이를 **원본 테이블에서 2페이지에 이미 그린 높이를 뺀 나머리**로 정의하고, 해당 높이를 htb `height` 및 SVG `viewBox` 높이에 동일하게 반영한다.
   - 관련: `ctrl_header/table/size.rs` (content_size, row_sizes), `geometry.rs` (viewBox), `render.rs` (htb style, viewBox 전달). 페이지별 “잔여 높이” 계산이 document.rs ↔ table 모듈 간에 일관되게 전달되는지 확인.

3. **first_para_vertical_mm / hcd_position 리셋 검증**
   - 새 페이지 첫 문단/객체 렌더 시 `first_para_vertical_mm = Some(0.0)`(또는 스펙·fixture에 맞는 값)과 새 페이지 hcD가 position 계산에 사용되도록 하고, fixture 3페이지의 hls top(3.53mm, 20.75mm) 등과 비교해 검증.

4. **검증 강화**
   - 3번째 `.hpa` 내 hcD(left:20mm, top:24.99mm), hls top, htb height, SVG viewBox 높이를 fixture와 비교하는 항목을 스냅샷 또는 소규모 테스트로 추가할 수 있음 (선택).
   - 기존 `bun run test:rust:snapshot`, `bun run screenshot:noori`로 회귀 확인.

### Research Insights

**Best Practices (업계·리서치):**
- 객체 페이지 브레이크 직후 `current_page_def`로 (hcd_left_mm, hcd_top_mm) 계산 → `position_next.hcd_position = Some(...)` 설정. 451–466과 **동일 수식** 사용 시 추가 연산 0.
- 연속 조각 높이: `fragment_height_mm = total_table_height_mm - height_drawn_on_previous_page_mm`. 이 **같은 값**을 htb `height`와 SVG viewBox 높이(4번째 값) 둘 다에 사용.
- 재렌더 시 `position_next`는 새 페이지 전용: `hcd_position` = 새 페이지 콘텐츠 원점, `first_para_vertical_mm` = 0.0, `content_height_mm` = 새 페이지 콘텐츠 높이.

**아키텍처 (document ↔ table 계약):**
- `content_height_mm`과 분리해 **optional `fragment_height_mm`** (또는 `table_fragment_height_mm`) 도입 권장. document/paragraph에서 remainder 계산 후 테이블에 전달; table은 값이 있으면 htb height와 viewBox에만 사용, 없으면 기존처럼 전체 테이블 높이 사용.
- “이미 그린 높이”는 `content_height_mm - table_top_mm` 등 pagination과 동일 기준으로 한 곳에서만 계산.

**단순성·YAGNI:**
- (3)은 “솔루션”이 아니라 **검증만**: AC1/AC2 통과 시 first_para/hcd 리셋도 올바른 것으로 간주. 별도 리셋 전용 코드 경로 추가하지 않음.
- 테이블 조각은 **한 번만** (2→3 페이지, 한 테이블 한 번 잘림). 셀 단위 분할·다중 조각 리스트·일반화된 fragment 모델은 추가하지 않음.
- (4) 선택 검증은 구현 완료 후 AC로 만족 안 될 때만 추가.

**성능:**
- `hcd_pos` 재사용으로 fallback 재계산 제거. fragment_height는 O(1) 산술 한 번.
- Quick win(플랜 범위 외): paragraph에서 구한 content_size/height를 render_table에 전달해 테이블당 크기 계산 2회 → 1회로 축소.

**Edge Cases:**
- PageDef 변경 시 content_height_mm·여백이 바뀌므로 “이미 그린 높이”를 같은 페이지 기준으로만 계산할 것.
- `position_next` 주석 또는 `position_for_next_page` 등 의도가 드러나는 이름으로 문단 vs 객체 페이지네이션 경로 일관성 유지.

**References:**
- Paged.js: [How Paged.js works](https://pagedjs.org/en/documentation/4-how-paged.js-works/)
- Chromium: [RenderingNG block fragmentation](https://developer.chrome.com/docs/chromium/renderingng-fragmentation)
- MDN: [CSS Fragmentation](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Fragmentation)
- 상세 리서치: `documents/plans/2026-02-23-research-pagination-table-fragment-layout.md`
- 아키텍처 검토: `documents/plans/2026-02-23-fix-noori-page3-layout-architecture-review.md`
- 패턴 분석: `documents/plans/2026-02-23-noori-page3-layout-pattern-analysis.md`

## Technical Considerations

- **아키텍처**: `document.rs`의 페이지 루프·`page_content`/`page_tables`/`position_next` 흐름을 유지하면서, 객체 페이지 브레이크 시에만 `hcd_position`을 새 페이지 기준으로 채우는 최소 변경 선호.
- **테이블 분할**: 현재는 테이블 단위(TableOverflow)만 지원. 3페이지 “조각”은 “같은 문단 재렌더 + skip_tables_count” 경로로 그려지므로, **재렌더 시 전달되는 content_height_mm / 테이블 top/height**가 3페이지 콘텐츠 영역과 일치해야 함.
- **성능**: 추가 계산은 페이지당 1회 수준으로 제한.
- **호환**: 1페이지(인라인 htb 0,0), table/table2 등 다른 fixture 스냅샷이 깨지지 않도록 `test_all_fixtures_html_snapshots` 전체 실행 필수.

### Research Insights

- **관심사 분리**: (1) hcD는 document가, (2) “얼마나 그렸는지”는 document/paragraph가, “주어진 높이로 그리기”는 table이 담당하도록 유지.
- **중복 방지**: PageDef → hcd 계산이 여러 곳에 있으므로, 단기에는 451–464와 동일 수식 사용; 중기에는 `hcd_from_page_def(Option<&PageDef>) -> (f64, f64)` 공용 함수로 묶어 한 곳만 수정하도록 고려.
- **메모리**: 새 필드 `Option<(f64,f64)>`, `Option<f64>` 수준으로 힙 할당 없음.

## Acceptance Criteria

- [x] **AC1** 3번째 `div.hpa` 내 `div.hcD`가 `left:20mm;top:24.99mm` (또는 fixture와 동일한 값)을 가짐.
- [x] **AC2** 3페이지 첫/둘째 `div.hls`의 `top`이 fixture와 동일 (예: 3.53mm, 20.75mm).
- [ ] **AC3** 3페이지 대형 테이블 `div.htb`의 `height`가 fixture와 동일 (예: 221.19mm). (fragment_height_mm 미구현으로 보류)
- [ ] **AC4** 3페이지 대형 테이블 SVG `viewBox`의 높이(4번째 값)가 fixture와 일치 (예: 226.19; 현재 149.13). (fragment_height_mm 미구현으로 보류)
- [x] **AC5** 3페이지 쪽번호(hpN) 텍스트가 "3".
- [x] **AC6** `bun run test:rust:snapshot` noori_html 포함 전체 통과.
- [ ] **AC7** `bun run screenshot:noori` 후 noori-ours.png 3페이지가 noori-fixture.png 3페이지와 시각적으로 동일(테이블 잘림 없음). (viewBox/조각 높이 보류)
- [x] **AC8** 1페이지 레이아웃 유지(첫 인라인 테이블 htb top:0mm, left:0mm).
- [x] **AC9** table, table2, multicolumns_layout, sample_5017 등 다른 fixture HTML 스냅샷 회귀 없음.

### Research Insights

- AC1/AC2 통과 시 first_para_vertical_mm·hcd 리셋도 올바른 것으로 간주 가능 (별도 “리셋 검증” 코드 없이).
- 3번째 .hpa 전용 스냅샷/테스트는 **선택**: 먼저 기존 스냅샷·스크린샷으로 확인 후, 필요 시 추가.

## Success Metrics

- noori 3페이지가 fixture와 구조·인라인 스타일·시각적으로 일치.
- 스냅샷 테스트 및 스크린샷 비교로 회귀 없음 확인.

## Dependencies & Risks

- **의존성**: `page.rs`, `pagination.rs`, `ctrl_header/table/position.rs`, `size.rs`, `geometry.rs`, `render.rs` 이해 필요.
- **리스크**: 테이블 “조각” 높이 정의가 스펙/한글 뷰어와 다르면 시각 차이가 남을 수 있음. 이 경우 fixture 수치를 우선하고 스펙은 보조로 사용(AGENTS.md 원칙).

### Research Insights

- “나머리 = 전체 테이블 높이 − 2페이지에 그린 높이”를 **fixture(221.19mm, viewBox 226.19)에 맞추기 위한 도출 공식**으로 두고, “스펙보다 fixture 일치를 목표로 한다”고 명시하면 가정이 단순해짐.
- `fragment_height_mm` 등 새 필드 의미를 AGENTS.md 또는 viewer 주석에 한 줄 정도 문서화하면 이후 패턴 준수에 도움이 됨.

## References & Research

### Internal

- SpecFlow 분석: `documents/plans/2026-02-23-spec-flow-noori-page3-layout.md`
- 리서치(페이지네이션·테이블 조각): `documents/plans/2026-02-23-research-pagination-table-fragment-layout.md`
- 아키텍처 검토: `documents/plans/2026-02-23-fix-noori-page3-layout-architecture-review.md`
- 패턴 분석: `documents/plans/2026-02-23-noori-page3-layout-pattern-analysis.md`
- 페이지/테이블 흐름: `crates/hwp-core/src/viewer/html/document.rs` (`to_html`, `first_para_vertical_mm`, `hcd_position`, 271–330, 439–491, 494–535, 556–561)
- 페이지 렌더: `crates/hwp-core/src/viewer/html/page.rs` (`render_page`, 테이블 hpa 직하위 배치)
- 페이지 나누기: `crates/hwp-core/src/viewer/html/pagination.rs` (`check_table_page_break`, `PaginationContext`)
- 테이블 위치/크기/렌더: `crates/hwp-core/src/viewer/html/ctrl_header/table/position.rs`, `size.rs`, `geometry.rs`, `render.rs`
- 1페이지 수정(인라인 htb 0,0): `branch-summary.md`, `table/render.rs` 849–855
- 테이블 높이·parsed 값: `documents/plans/2026-02-21-parsed-values-no-constants.md`
- Fixture vs 스냅샷 우선순위: `documents/plans/2026-02-22-feat-html-fixtures-vs-snapshots-priority-plan.md`

### Test / Snapshot

- noori HTML 생성: `crates/hwp-core/tests/snapshot_tests.rs` → `test_all_fixtures_html_snapshots`
- 스냅샷 파일: `crates/hwp-core/tests/snapshots/noori.html`, `snapshot_tests__noori_html.snap`
- 원본 fixture: `crates/hwp-core/tests/fixtures/noori.html`
- 이미지 비교: `e2e/document-snapshots` → `bun run screenshot:noori` → `crates/hwp-core/tests/snapshots/noori-fixture.png`, `noori-ours.png`

### 규칙

- AGENTS.md: 값은 스펙·JSON·fixture에서만 유도, 임의 상수 금지. `<link>`→`<style>` 제외하고 구조·스타일은 fixture와 동일하게.
