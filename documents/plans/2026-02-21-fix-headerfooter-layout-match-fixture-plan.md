---
title: fix: 머리말/꼬리말 HTML을 fixture 레이아웃과 일치시키기
type: fix
status: completed
date: 2026-02-21
---

# fix: 머리말/꼬리말 HTML을 fixture 레이아웃과 일치시키기

## Enhancement Summary

**Deepened on:** 2026-02-21  
**Sections enhanced:** Proposed Solution, Technical Considerations, Acceptance Criteria, Dependencies & Risks  
**Agents used:** refactoring-expert, architecture-strategist, best-practices-researcher, pattern-recognition-specialist

### Key Improvements

1. **단계별 구현·검증 순서**: Step 1~3은 출력 변경 없이 파라미터·로직·fragment 계약만 추가하고, Step 4에서 body 레벨 header/footer 제거 및 페이지별 fragment 전달로 레이아웃 변경. Step 5에서 테스트·스냅샷 정리. 매 단계별 Verification steps 명시.
2. **아키텍처·패턴 일관성**: 위치 계산은 `page.rs`만 PageDef 기반 수행; 내용은 ctrl_header/document. hpa 내 순서를 header hcD → footer hcD → body hcD → 테이블들 → hpN으로 고정. left는 body와 동일 수식, top만 header/footer 전용 수식. Phase 2 다중 구역은 document.rs만 확장, `render_page` 시그니처 유지.
3. **코드베이스 패턴 정리**: document.rs의 hcd_position·PageDef 사용처와 page.rs·table position 패턴을 정리한 "Pattern-Consistency Recommendations" 추가. header/footer는 PageDef에서 직접 header_top/footer_top 계산 후 전달 권장.

### New Considerations Discovered

- **레이아웃**: .hpa를 유일한 위치 기준으로 두고, header/footer/body hcD는 모두 동일 부모 기준 `position: absolute` + left/top(mm). overflow는 .hpa 또는 본문 영역에서만 제어해 z-order·클리핑 이슈 회피.
- **접근성**: DOM 순서가 읽기/탭 순서를 결정. fixture 순서(header → footer → body)면 스크린 리더는 머리말→꼬리말→본문 순. 본문 우선 읽기가 필요하면 DOM 순서와 시각적 순서를 CSS로 분리하는 방안 검토.
- **인쇄**: @page margin과 .hpa 절대 위치 역할 분리. @page margin box(@top-center 등)는 브라우저 지원 제한 있으므로 Phase 2로 두고, 우선 .hpa 기준 절대 위치만 fixture와 일치.

---

## Overview

현재 HTML 뷰어는 머리말/꼬리말을 body 직하위의 별도 블록(`ohah-hwpjs-header`, `ohah-hwpjs-footer`)으로 출력하여, 골든 기준인 `fixtures/headerfooter.HTML`과 구조·레이아웃이 다르다. fixture는 **단일 `div.hpa` 안에** 머리말·꼬리말·본문을 `div.hcD` 절대 위치로 배치한다. 이 계획은 뷰어 출력을 fixture와 일치시키기 위한 재구현 범위·수용 기준·기술 접근을 정의한다.

## Problem Statement / Motivation

- **비교 문서**: `documents/plans/2026-02-21-headerfooter-layout-comparison.md`
- **Fixture(골든)**: `div.hpa`(210×297mm) 한 개 안에
  - 머리말 `hcD`: `left:30mm; top:20mm`
  - 꼬리말 `hcD`: `left:30mm; top:267mm`
  - 본문 `hcD`: `left:30mm; top:35mm`
  - 머리말에 쪽 번호 "1."(haN) 포함
- **Snapshot(현재)**: body 직하위에 `ohah-hwpjs-header` → `hpa`(본문만) → `ohah-hwpjs-footer` 순서의 블록 흐름. 머리말/꼬리말이 hpa 밖에 있고 쪽 번호 없음.
- 결과물이 다르면 작업이 잘못된 것이므로, **문서(스펙·fixture)를 참고해 다시 구현**해야 한다.

## Proposed Solution

1. **구조 변경**: body 직하위에 header / hpa / footer 를 형제로 두지 않고, **각 페이지당 하나의 `div.hpa`** 안에 머리말·꼬리말·본문을 **`div.hcD`** 로 넣는다. DOM 순서는 fixture와 동일하게 **header hcD → footer hcD → body hcD**.
2. **위치 수식**: PageDef에서 유도. 하드코딩 금지(AGENTS.md).
   - `header_top_mm = top_margin`
   - `body_top_mm = top_margin + header_margin`
   - `footer_top_mm = paper_height - bottom_margin - footer_margin`
   - `left_mm = left_margin + binding_margin` (세 영역 공통)
3. **Fragment 계약**: header/footer는 **hcI 내부 HTML만** 반환하고, `page.rs`의 `render_page()`에서 left/top를 적용해 `hcD`로 감싼다.
4. **Phase 1 범위**: 단일 구역, PageDef 있음, ApplyPage=Both만. 다중 구역·Even/Odd·첫 쪽 감춤·haN(쪽 번호)은 Phase 2 또는 별도 작업.

## Technical Considerations

- **파일 변경**
  - `crates/hwp-core/src/viewer/html/page.rs`: `render_page()`에 `header_fragment: Option<&str>`, `footer_fragment: Option<&str>` 추가. hpa 열린 직후 header hcD → footer hcD → 기존 body hcD 순으로 출력.
  - `crates/hwp-core/src/viewer/html/document.rs`: body 레벨 header/footer 출력(131–134, 593–596행) 제거. 페이지 루프에서 현재 페이지용 header/footer fragment를 결정해 `render_page(..., header_fragment, footer_fragment)`로 전달.
  - `crates/hwp-core/src/viewer/html/ctrl_header/header.rs`, `footer.rs`: wrapper `<div class="...header">` 제거 후 **hcI 안에 들어갈 내용만** 반환하도록 할지, 또는 기존 반환값을 document에서 파싱해 hcI만 추출할지 결정 후 일관 적용.
- **PageDef 없음**: document.rs와 동일한 fallback 사용(210×297, left 20.0, top 24.99 등). header_top_mm / footer_top_mm도 같은 fallback 체인으로 계산.
- **line-height / top 수치**: fixture의 2.48mm, -0.16mm 등은 LineSegment/ParaShape 기반으로 유도(AGENTS.md·parsed-values-no-constants). Phase 1에서 구조·위치만 맞추고, 수치 완전 일치는 필요 시 후속 작업으로 명시 가능.

### Research Insights (Layout & Implementation)

**Best practices (페이지 컨테이너 내 절대 위치):**

- header/footer/body용 hcD는 모두 **동일 부모(.hpa)** 기준 `position: absolute` + left/top(mm) 적용. stacking context를 하나로 두면 PageDef 수식과 좌표계가 맞다.
- **left/top 수식은 한 곳에서만 정의**: `page.rs`에서 PageDef(및 fallback)만 참조해 header_top_mm, body_top_mm, footer_top_mm, left_mm 계산 후 HTML에 주입. 하드코딩 금지와 일치하며, 구역별·ApplyPage 확장 시 한 곳만 수정.

**Overflow & z-order:**

- `.hpa`에 `overflow: hidden`을 두면 절대 위치 자식이 밖으로 나가도 잘림. overflow를 거는 요소가 새 stacking context를 만들 수 있으므로, z-order는 .hpa 안에서만 정의(예: body 0, header 1, footer 1).
- header/footer/body hcD에 **낮은 정수 z-index**를 부여해 겹침 순서를 고정하면, DOM 순서나 추가 요소에 의해 시각적 순서가 바뀌지 않는다.

**접근성:**

- **탭·스크린 리더 순서는 DOM 순서**에 따름. 현재 계획의 "header hcD → footer hcD → body hcD"면 읽기 순서는 머리말→꼬리말→본문. 본문을 먼저 읽게 하려면 DOM 순서를 body → header → footer로 하고 시각적 순서만 CSS로 조정하는 방안을 Phase 2에서 검토 가능 (WebAIM, HTML source order vs CSS display order).

**인쇄:**

- 브라우저 인쇄 시 `@page { margin }`와 .hpa 절대 위치는 역할을 분리. "단일 .hpa + 내부 절대 위치"는 뷰어 화면/내보내기용에 적합. `@page` margin box(@top-center 등)는 Chrome 131+ 등 제한적 지원이므로 Phase 2 "선택적 향후 개선"으로 둔다.

## Acceptance Criteria

- [x] **구조**: body 직하위에는 `div.hpa`(들)만 있거나, hpa + 각주/미주 블록. `ohah-hwpjs-header` / `ohah-hwpjs-footer`가 body 직하위에 형제로 나오지 않음.
- [x] **hpa 내부 순서**: 각 hpa 안에 header hcD → footer hcD → body hcD 순서로 출력. (fixture와 동일)
- [x] **위치 수식**: header hcD의 top = PageDef `top_margin`(또는 fallback). body hcD의 top = `top_margin + header_margin`. footer hcD의 top = `paper_height - bottom_margin - footer_margin`. left = `left_margin + binding_margin`(세 영역 동일). 모든 값은 PageDef/fallback에서만 유도.
- [x] **headerfooter fixture 테스트**: `fixtures/headerfooter.HTML`과 동일 stem의 스냅샷 또는 구조 검증 테스트 추가. `<link>`→`<style>` 차이만 허용하고, 태그·클래스·hcD 순서·위치 스타일이 fixture와 일치(또는 스펙/JSON 기반 동치).
- [x] **머리말/꼬리말 없음**: header/footer가 없는 문서는 기존처럼 hpa 안에 본문 hcD만 출력.

## Success Metrics

- headerfooter 스냅샷 또는 fixture 비교 테스트 통과.
- 기존 headerfooter 없는 문서의 스냅샷 변경 최소화(본문 hcD만 있는 경우 동일 유지).

## Dependencies & Risks

- **다중 구역**: 현재는 전 구역 header/footer를 한 번에 수집. 페이지별로 “해당 구역의 header/footer”를 선택하려면 구역–페이지 매핑 또는 PageDefChange 시점의 구역 인덱스 추적이 필요. Phase 1에서는 단일 구역만 지원하면 됨.
- **ApplyPage(Even/Odd)**: 스펙 표 141. Phase 1에서는 Both만 지원하고, 짝/홀은 Phase 2로 연기 가능.
- **haN(쪽 번호)**: fixture에는 머리말 안 "1."이 있음. 스펙 4.3.10.3·문단 리스트 기준으로 별도 작업으로 두고, 이번 계획의 수용 기준에서는 “레이아웃·hcD 구조 일치”만 요구하고 haN 포함 여부를 명시적으로 선택(포함 시 구현 범위 확대).

## References & Research

- 레이아웃 비교: `documents/plans/2026-02-21-headerfooter-layout-comparison.md`
- 스펙: `.cursor/skills/hwp-spec/4-3-10-3-머리말-꼬리말.md` (표 140·141)
- Fixture: `crates/hwp-core/tests/fixtures/headerfooter.HTML`, `headerfooter_style.css`
- 구현 위치: `crates/hwp-core/src/viewer/html/document.rs` (90–126, 131–134, 593–596, render_page 호출부), `page.rs` (`render_page` 41–50행 hpa+hcD), `ctrl_header/header.rs`, `footer.rs`
- 수치 유도: `documents/plans/2026-02-21-parsed-values-no-constants.md`, AGENTS.md “HTML 뷰어 테스트 규칙”
- Repo research: 페이지별 header/footer를 render_page에 전달하고, page.rs에서 hcD로 감싸는 방식 권장. Fragment = hcI 내용만.

---

## Pattern-Consistency Recommendations (코드베이스 분석)

다음은 HTML 뷰어의 hpa/hcD/hcI 및 left/top 계산 패턴 분석 결과를 반영한 권고사항이다. 구현 시 이 패턴을 따르면 기존 body/table/image와 일관성을 유지할 수 있다.

### 1. hpa / hcD / hcI 사용 패턴 (단일 “콘텐츠 영역” left/top)

- **단일 패턴 존재**: body의 “콘텐츠 영역” 기준점 (left, top)은 **한 가지 수식**으로 통일되어 있다.
  - **위치**: `document.rs`에서 첫 본문 문단 진입 시 `hcd_position = Some((left_margin_mm, top_margin_mm))` 설정 (324–334행).  
    `left_margin_mm = left_margin + binding_margin`, `top_margin_mm = top_margin + header_margin` (PageDef 또는 fallback 20.0 / 24.99).
  - **사용처**:
    - `page.rs` `render_page()`: body용 hcD의 `left_mm`, `top_mm` = `hcd_position` 우선, 없으면 동일 PageDef 수식 (27–36행).
    - `document.rs`: 페이지 출력 시 `hcd_pos`로 전달 (276–289, 432–451, 568–571행).
    - `paragraph.rs`: `ParagraphPosition.hcd_position`으로 테이블/이미지 기준점 전달.
    - `ctrl_header/table/position.rs`: `table_position()`의 base = `hcd_position` → PageDef 동일 수식 → `FALLBACK_BASE_LEFT_MM/TOP_MM` (65–74행).
- **정리**: header/footer의 **left**는 body와 **동일 수식** 사용 (`left_margin + binding_margin`). **top**만 영역별로 다름 (아래 3번).

### 2. hpa에 주입되는 다른 ctrl_headers (table, image)의 left/top

- **테이블 (like_letters=false)**  
  - **파일**: `paragraph.rs` (583–676), `ctrl_header/table/position.rs`, `ctrl_header/table/render.rs`.  
  - **위치 계산**: `table_position(hcd_position, page_def, segment_position, ctrl_header, ...)`  
    base (left, top) = `hcd_position` 있으면 그대로, 없으면 PageDef `(left_margin + binding_margin, top_margin + header_margin)`, 없으면 `FALLBACK_BASE_LEFT_MM`/`FALLBACK_BASE_TOP_MM`.  
  - **주입 방식**: 테이블 HTML은 **hpa 레벨**에 직접 추가 (`page.rs` 53–55: body hcD와 형제). 테이블 자체가 htG/htb 또는 캡션용 hcD를 포함하므로 page.rs는 별도 hcD 래퍼를 만들지 않음.
- **이미지 (like_letters=false)**  
  - **파일**: `paragraph.rs` (537–584).  
  - **위치**: `VertRelTo::Para`일 때 `(hcd_left, hcd_top)` 또는 `para_start_vertical_mm` 사용.  
  - **주입 방식**: 이미지 HTML은 **body content**에 `push_str`되므로, 최종적으로 **body hcD > hcI 안**에 포함됨 (테이블과 다름).
- **hpN (쪽번호)**  
  - **파일**: `page.rs` (82–164).  
  - **위치**: body와 별도. `PageNumberPosition`에 따라 PageDef로 left/top 계산 (예: 하단 중앙 = `(page_width_mm/2, page_height_mm - bottom_margin)`).
- **권고**: header/footer hcD도 **테이블처럼** “hpa 안의 절대 위치 블록”으로 두고, **left/top만** PageDef 기반으로 계산해 넣으면 기존 패턴과 일치한다. left는 body와 동일 수식, top은 header/footer 전용 수식 사용.

### 3. header/footer가 body와 동일한 left_mm/top_mm 패턴을 쓸지 여부

- **left_mm**: **body와 동일하게** 쓴다.  
  - 기존: body hcD left = `hcd_position.0` 또는 PageDef `left_margin + binding_margin` (fallback 20.0).  
  - 권고: header/footer hcD의 left도 **같은 수식** 사용. `page.rs`에서 header/footer용 (left, top) 계산 시 left는 `render_page()` 내 body용과 동일한 식으로 계산하거나, 이미 계산된 “content left” (예: PageDef 기반 left_mm)를 공유하도록 한 곳에서만 정의.
- **top_mm**: **body와 다른 수식**을 쓴다 (플랜 수식 유지).  
  - body: `top_margin + header_margin` (현재 `hcd_position.1`와 동일).  
  - header: `top_margin`.  
  - footer: `paper_height - bottom_margin - footer_margin`.  
  - 권고: **동일한 패턴**이란 “PageDef(또는 fallback)에서만 유도”하는 것이지, 수치를 body와 같게 하는 것이 아님. header/footer는 **PageDef에서 위 세 공식으로 각각 계산**하고, `page.rs`에서 body hcD와 같은 fallback 체인(PageDef 없을 때 24.99 등)을 사용하면 패턴 일관성 유지.

### 4. 구현 시 권장 사항 (파일·패턴 요약)

| 항목 | 파일 | 권고 |
|------|------|------|
| left 공통 수식 | `page.rs` | body/header/footer 공통: `hcd_position` 또는 PageDef `(left_margin + binding_margin)` → fallback 20.0. 한 곳에서 계산해 세 hcD에 동일 left 적용. |
| top 수식 | `page.rs` | header = `top_margin`; body = 기존대로 `top_margin + header_margin`; footer = `paper_height - bottom_margin - footer_margin`. PageDef 없을 땐 기존 document.rs fallback과 동일한 값 사용. |
| hcD 래핑 | `page.rs` | header/footer도 body와 동일하게 `<div class="hcD" style="left:{}mm;top:{}mm;"><div class="hcI">{fragment}</div></div>` 형태로 출력. (기존 body hcD와 동일 패턴.) |
| Fragment 계약 | `ctrl_header/header.rs`, `footer.rs` | hcI **내부 내용만** 반환. left/top는 page.rs에서만 계산·적용 (document.rs의 hcd_position/PageDef와 동일 소스). |
| 테이블/이미지와의 일관성 | - | 테이블은 `table_position(..., hcd_position, page_def, ...)`로 base를 받음. header/footer는 “문단/테이블과 무관한 고정 영역”이므로 `hcd_position`을 그대로 쓰지 않고, **PageDef에서 직접** header_top / footer_top 계산 후 page.rs에 전달하는 것이 명확함. |

위 권고를 반영하면 “content area (left/top)는 PageDef 또는 hcd_position에서 한 가지 방식으로 유도한다”는 기존 패턴을 유지하면서, header/footer만 top 수식만 다르게 적용하는 형태로 정리할 수 있다.

---

## Refactoring / implementation order

안전한 단계별 적용(한 단계마다 빌드·테스트·필요 시 스냅샷 검증). “출력 변경 없음” 단계에서는 스냅샷/테스트 결과가 이전과 동일해야 하며, 마지막 단계에서만 headerfooter 레이아웃 변경을 반영한다.

1. **Step 1 – 파라미터만 추가 (동작 동일)**  
   - `page.rs`의 `render_page()`에 `header_fragment: Option<&str>`, `footer_fragment: Option<&str>` 추가.  
   - `document.rs`의 `render_page` 호출부 3곳(페이지 나누기 시, 객체 페이지네이션 시, 마지막 페이지)에서 `None`, `None` 전달.  
   - `render_page` 내부는 아직 두 인자를 사용하지 않음(기존처럼 body hcD만 출력).  
   - **목표**: 시그니처와 호출부만 확장, 출력 동일.

2. **Step 2 – page에서 header/footer hcD 출력 로직 추가 (아직 미사용)**  
   - `render_page()`에서 `hpa` 연 다음, `header_fragment`가 `Some(s)`이고 비어 있지 않으면 `left_mm`/`header_top_mm`으로 header용 `hcD` > `hcI` 출력.  
   - `footer_fragment`가 `Some(s)`이고 비어 있지 않으면 `left_mm`/`footer_top_mm`으로 footer용 `hcD` > `hcI` 출력.  
   - `header_top_mm`/`footer_top_mm`은 PageDef(또는 기존 fallback)에서만 계산(계획의 위치 수식 준수).  
   - body hcD는 기존 순서대로 그대로 출력.  
   - 이 단계에서는 여전히 `document.rs`에서 `None`, `None`만 넘기므로 **출력 변경 없음**.

3. **Step 3 – header/footer를 hcI 내용만 반환하도록 변경 (body 레벨 출력은 유지)**  
   - `ctrl_header/header.rs`, `footer.rs`: 외부 `<div class="...header">` / `<div class="...footer">` 제거 후 **hcI 안에 들어갈 내용만** 반환(예: `render_paragraphs_fragment` 결과만).  
   - `document.rs`: 기존에 body 상단/하단에 출력하던 부분(131–134, 593–596)은 **당분간 유지**. 단, `header_contents`/`footer_contents`에 넣을 때 반환된 hcI 내용을 기존과 동일한 래퍼로 감싼 뒤 push(예: `<div class="ohah-hwpjs-header">…</div>`).  
   - **목표**: header/footer 모듈 계약을 “hcI 내용만”으로 바꾸되, body 직하위 출력 문자열은 이전과 동일하게 유지.

4. **Step 4 – body 레벨 header/footer 제거, 페이지별 fragment 전달 (의도한 레이아웃 변경)**  
   - `document.rs`: body 직하위 머리말/꼬리말 출력 블록(131–134, 593–596) 제거.  
   - 페이지를 출력하는 세 지점에서 “현재 페이지용” header/footer fragment 결정(Phase 1: 단일 구역이므로 첫 번째 header/footer 내용 또는 없으면 빈 문자열).  
   - `render_page(..., header_fragment, footer_fragment)`에 해당 fragment 전달(옵션은 `Option<&str>` 형태로, 없으면 `None`, 있으면 hcI 내용의 참조).  
   - **목표**: body 직하위에는 `hpa`(및 각주/미주 블록)만 있고, 각 `hpa` 안에 header hcD → footer hcD → body hcD 순서로 출력.

5. **Step 5 – 테스트 및 스냅샷 정리**  
   - `test_headerfooter_html`: `ohah-hwpjs-header`/`ohah-hwpjs-footer`가 body 직하위에 있다는 assert 제거 또는 수정. 대신 “각 `hpa` 안에 header hcD → footer hcD → body hcD 순서가 있다” 등 구조 검증으로 변경.  
   - headerfooter HTML 스냅샷은 **의도적으로 변경**되므로 `bun run test:rust:snapshot:review`로 변경분 검토 후 승인.  
   - headerfooter가 없는 문서(예: sample_5017, charstyle 등)의 HTML 스냅샷은 **변경 없음**이어야 함(회귀 확인).

---

## Verification steps

각 단계 전·후에 아래를 실행해 회귀와 의도된 변경만 발생하는지 확인한다.

- **공통 (매 단계)**  
  - `bun run test:rust-core` 또는 `bun run test:rust`  
  - `bun run lint`  
  - `cargo fmt` / `bun run format`

- **Step 1 전**  
  - `bun run test:rust:snapshot` 실행 후 통과 확인.  
  - (선택) `snapshot_tests__headerfooter_html.snap` 등 관련 스냅샷 내용을 눈으로 한 번 확인해 기준선 파악.

- **Step 1 후**  
  - `bun run test:rust:snapshot` 다시 실행. **스냅샷 결과는 Step 1 전과 동일해야 함.** 차이가 나면 파라미터 추가 시 로직이 바뀌었거나 호출부가 잘못된 것.

- **Step 2 후**  
  - 동일하게 `bun run test:rust:snapshot`. **여전히 모든 스냅샷이 Step 1과 동일.** (document가 아직 None만 넘기므로)

- **Step 3 후**  
  - `bun run test:rust:snapshot`. **전체 스냅샷·테스트 결과 동일.** body 레벨에서 래퍼를 그대로 유지했으므로 출력 문자열이 바뀌면 안 됨.

- **Step 4 후 (레이아웃 변경)**  
  - `bun run test:rust:snapshot` 실행 시 headerfooter HTML 스냅샷이 **변경됨**(의도된 구조 변경).  
  - `bun run test:rust:snapshot:review` 실행 후 `snapshot_tests__headerfooter_html.snap` 등 변경된 스냅샷만 검토·승인.  
  - headerfooter가 없는 다른 HTML 스냅샷(예: `snapshot_tests__sample_5017_html.snap`, `snapshot_tests__charstyle_html.snap`)은 **변경되지 않아야 함.** 변경되면 회귀이므로 원인 제거.

- **Step 5 후**  
  - `test_headerfooter_html`의 새 assert로 “hpa 내부 header hcD → footer hcD → body hcD” 구조 검증.  
  - `bun run test:rust:snapshot` 및 `bun run test:rust:snapshot:review` 한 번 더 실행해 최종 스냅샷 확정.

**AGENTS.md·프로젝트 규칙 반영:**

- **스냅샷 원칙**: 리팩토링 단계(1–3)에서는 스냅샷·결과물이 **반드시 이전과 동일**해야 함. 차이가 나면 해당 단계를 수정하거나 원복.  
- **의도된 변경만 허용**: Step 4에서 headerfooter 관련 스냅샷만 바뀌고, 그 외 문서 스냅샷은 그대로여야 함.  
- **스냅샷 검토 필수**: Step 4 이후 `cargo insta review`(또는 `bun run test:rust:snapshot:review`)로 변경분을 반드시 검토한 뒤 승인.  
- **값 유도**: `header_top_mm`/`footer_top_mm`/`left_mm` 등 모든 위치 값은 PageDef 또는 document와 동일한 fallback 체인에서만 계산. 하드코딩 상수 사용 금지(AGENTS.md “HTML 뷰어 테스트 규칙”).

---

## Architecture review (추가 권장 사항)

### 1. 기존 패턴과의 일관성

- **테이블·hpN과 동일한 레이어**: 테이블은 이미 hpa 직하위에 배치되고, hpN은 `page.rs`에서 PageDef로 위치를 계산한다. 머리말/꼬리말도 **hpa 내부의 hcD**로 두고, **위치 계산은 `page.rs`에서만** PageDef(및 fallback)로 수행하도록 하면, “위치는 page.rs, 내용은 document/ctrl_header” 책임이 동일하게 유지된다. 계획서에 한 줄 추가 권장: “hpa 내 절대 위치 요소(body hcD, 테이블, hpN, header/footer hcD)의 위치 계산은 모두 `page.rs`에서 PageDef 기반으로 수행한다.”
- **DOM 순서 명시**: 각 hpa 내 출력 순서를 계획에 명시하면 테이블/hpN 변경 여부가 분명해진다. 권장: “hpa 내 순서: header hcD → footer hcD → body hcD → (기존) 테이블들 → (기존) hpN.” 테이블·hpN은 기존과 동일한 레벨·역할 유지.

### 2. 단일/다중 구역과 document.rs ↔ page.rs 경계

- **경계 정리**: “**document.rs**: 페이지별로 어떤 header/footer fragment를 쓸지 결정(Phase 1에서는 단일 구역이므로 동일 fragment 반복 전달). **page.rs**: 전달받은 `header_fragment`/`footer_fragment`를 그대로 hcD로 감싸고 left/top만 적용. 구역·섹션 인덱스는 알지 못함.” 이렇게 쓰면 Phase 2에서 구역별 머리말/꼬리말은 **document.rs만** 수정(페이지→구역 매핑 후 구역별 fragment 전달)하면 되고, `render_page` 시그니처는 그대로 둘 수 있다.
- **Phase 2 한 줄**: “다중 구역 지원 시: document.rs에서 현재 페이지의 구역을 판별해 해당 구역의 header/footer fragment만 `render_page(..., header_fragment, footer_fragment)`로 전달; page.rs 변경 없음.”

### 3. 책임 분리(레이어링)

- **위치 vs 렌더링**: 계획에 “**위치 계산**: `page.rs`만 담당. PageDef(또는 fallback)로 header_top_mm, body_top_mm, footer_top_mm, left_mm 계산. **내용 생성**: header/footer hcI 내용은 `ctrl_header/header.rs`, `footer.rs`(또는 document에서 이들의 반환값 사용). **조립**: `page.rs`의 `render_page()`가 fragment를 hcD로 감싸고 계산된 left/top 스타일을 적용.” 처럼 한 문단으로 명시하면, “위치는 page, 내용은 ctrl_header/document” 계층이 구현 시 혼동 없이 유지된다.
