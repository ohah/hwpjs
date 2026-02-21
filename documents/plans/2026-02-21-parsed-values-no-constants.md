# 파싱 값 기반 HTML 수치 구현 계획 (상수 제거)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** audit_report.md에 정리된 테이블/htb/SVG/hls 불일치를 제거하고, 모든 수치가 HWP 문서·파싱 데이터에서만 유도되도록 한다. 절대 상수(30.0, 2.79, -0.18, 3.53, 20.0, 24.99 등)를 제거·대체한다.

**Architecture:** (1) 테이블 위치는 `hcd_position`/`page_def`/CtrlHeader offset만 사용하고, fallback (20, 24.99)은 page_def 없을 때만 유지·문서화. (2) 테이블·셀 크기·SVG viewBox는 `content_size`/`htb_size`/`row_sizes`/cell height·margin만 사용. (3) hls의 line-height·top은 LineSegment(baseline_distance, line_height, text_height)·ParaShape에서만 계산. (4) 캡션/빈 hls fallback은 첫 문단 LineSegment 또는 CharShape/ParaShape 기반 기본값으로 대체.

**Tech Stack:** Rust (hwp-core), HWP 5.0 스펙·JSON 스냅샷 참조, insta 스냅샷 테스트.

**참고:** `documents/plans/audit_report.md`, `documents/plans/fixture_matrix.md`, `documents/plans/2026-02-21-fixtures-html-sync-plan.md`

---

## Task 1: 테이블 절대 위치 — hcd/page_def 전용, fallback 명시

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/position.rs:57-66`
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs:315-320` (캡션 width fallback 30.0)
- Test: `crates/hwp-core/tests/` (기존 table HTML 스냅샷 테스트)

**Step 1: position.rs fallback 문서화 및 상수 제거**

- `table_position()`에서 `hcd_position`·`page_def` 모두 없을 때만 사용하는 fallback `(20.0, 24.99)`를 상수로 두지 말고, `page_def`가 없을 때만 사용하도록 주석으로 "PageDef 없음 시에만 사용; 가능하면 hcd_position/PageDef 전달 보장" 명시.
- 코드 변경: fallback 값을 모듈 상단 `const`로 빼거나, 주석으로 "스펙 기본 여백 대응" 등 근거 명시. (값 자체는 유지하되 "문서 없는 경우" 한정.)

**Step 2: render.rs 캡션 width fallback 제거**

- `info.width`가 없을 때 `30.0` 사용 제거. 대신 `resolved_size.width - margin_left_mm - margin_right_mm` 또는 동일 스코프에서 이미 있는 `htb_width_mm_for_caption` 등 파생 값 사용. 세로 캡션일 때만 해당 분기이므로, "테이블 실제 폭"을 사용하도록 수정.

**Step 3: 테스트 실행**

Run: `bun run test:rust-core` (또는 `bun run test:rust`)
Expected: 기존 테스트 통과. table fixture 기준 left/top이 31/35.99에 가까워지려면 hcd_position이 올바르게 전달되는지 document.rs 쪽도 확인 가능 (별도 태스크에서).

**Step 4: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/table/position.rs crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs
git commit -m "refactor(core): table position and caption width from parsed data only"
```

---

## Task 2: content_size·row 높이 — row_sizes·cell height만 사용

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/size.rs:95-220`
- Test: `crates/hwp-core/tests/` (table 스냅샷)

**Step 1: content_size height 계산 정리**

- `content_size()`에서 `ctrl_header_height_mm`을 그대로 쓸 때와 `max_row_heights_with_shapes` 등 계산값을 쓸 때 조건을 명확히 한다. Fixture table: row_sizes [7086, 7086] → 25mm+25mm. `ctrl_header.height`(14172)는 "전체 테이블 높이"이므로, row_sizes 합과 일치하면 row_sizes 우선 사용하도록 로직 정리 (또는 row_sizes 합을 content_height로 사용하고 ctrl_header.height는 검증/폴백만).
- row_sizes 단위: HWPUNIT (1/7200 inch). 변환 시 `(row_size as f64 / 7200.0) * 25.4` 유지. size.rs 214행 부근 row_sizes 순회 시 누적이 아니라 `content_height`를 row_sizes 합으로 설정하는지 확인하고, 셀 height와 row_sizes 중 일치하는 소스 하나로 통일.

**Step 2: Run test**

Run: `bun run test:rust:snapshot`
Expected: table 스냅샷에서 셀 높이 25mm+25mm 반영 (필요 시 스냅샷 검토 `bun run test:rust:snapshot:review`).

**Step 3: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/table/size.rs
git commit -m "fix(core): table content height from row_sizes/cell height only"
```

---

## Task 3: SVG viewBox — content_size 전용, padding만 상수

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/position.rs:15-23` (view_box)
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs:171-177` (svg_width/svg_height 전달)
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/constants.rs` (SVG_PADDING_MM 유지, 스펙/문서 참조 주석)

**Step 1: viewBox 입력 검증**

- `view_box(htb_width, htb_height, padding)`에 넘기는 `svg_width`·`svg_height`가 Task 2의 `content_size`와 margin 제외한 값과 일치하는지 확인. render.rs 175-177: `svg_width = resolved_size.width - margin_left_mm - margin_right_mm`, `svg_height = content_size.height`. resolved_size가 container(htb) 크기이므로, 테이블 "콘텐츠" 폭은 이미 위와 같음. Fixture viewBox 46.99×56.99 → 콘텐츠 41.99×51.99 (padding 2.5*2). 현재 44.99×55 → 39.99×50. Task 2에서 content_height를 row_sizes 기반으로 맞추면 height가 51.99에 수렴하도록. width는 column/cell width 합이 fixture와 맞는지 JSON 스냅샷으로 확인.

**Step 2: round_to_2dp 일관성**

- view_box 내부에서 이미 round_to_2dp 사용 중. Fixture가 -2.50 -2.50 형식이면 포맷 출력 시 소수 2자리 고정 (이미 round_to_2dp로 가능). 추가 상수 없이 입력만 파싱값으로 유지.

**Step 3: Run test**

Run: `bun run test:rust:snapshot`
Expected: table SVG viewBox가 fixture에 가깝게 변경 (44.99 55 → 46.99 56.99 방향).

**Step 4: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/table/position.rs crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs crates/hwp-core/src/viewer/html/ctrl_header/table/constants.rs
git commit -m "fix(core): SVG viewBox dimensions from content_size only"
```

---

## Task 4: hls line-height·top — LineSegment/ParaShape 기반

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs:534-537, 736-738` (캡션 hls fallback 2.79, -0.18)
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/cells.rs:474-478` (빈 hls top -0.18, height 3.53)

**Step 1: 캡션 fallback (2.79, -0.18) 제거**

- `all_segments_with_info.is_empty()`일 때 `(2.79, -0.18, 0.0, caption_width_mm)` 대신, caption 문단의 첫 LineSegment가 있으면 그 segment의 `baseline_distance`→line_height_mm, `(line_height - text_height)/2`→top_offset_mm 사용. LineSegment가 정말 없으면 document 기본 CharShape/ParaShape에서 줄 간격·글자 크기 유도 (예: char_shape.base_size → pt → mm, line spacing 비율). 구체적으로: caption_paragraphs의 첫 paragraph에서 첫 LineSegment를 가져와 line_height_mm = int32_to_mm(segment.line_height) 또는 baseline_distance, top_offset_mm = (line_height_mm - int32_to_mm(segment.text_height))/2.0. segment가 없으면 해당 paragraph의 para_shape_id로 ParaShape 조회 후 줄간격 관련 필드로 계산하거나, 최소한 3.53 같은 값을 "문서 첫 CharShape base_size 기반"으로 계산하는 헬퍼 사용.

**Step 2: cells.rs 빈 hls (이미지 전용 셀) 상수 제거**

- `line-height:{:.2}mm;...;top:-0.18mm;height:3.53mm;`에서 -0.18과 3.53 제거. 해당 셀의 paragraph에서 LineSegment가 있으면 그 segment의 line_height·vertical_position 기반으로 top/height 계산. 이미지만 있는 문단이면 같은 셀 내 다른 paragraph의 LineSegment 또는 문서 기본 글자 높이(CharShape base_size → mm)를 사용. `img_h_mm`은 이미 사용 중이므로 height는 img_h_mm 또는 segment.line_height 기반으로 통일.

**Step 3: Run test**

Run: `bun run test:rust:snapshot`
Expected: hls 스타일이 line-height:2.79mm, top:-0.18mm 쪽으로 수렴 (fixture와 동일한 소스에서 유도).

**Step 4: Commit**

```bash
git add crates/hwp-core/src/viewer/html/ctrl_header/table/render.rs crates/hwp-core/src/viewer/html/ctrl_header/table/cells.rs
git commit -m "fix(core): hls line-height and top from LineSegment/ParaShape only"
```

---

## Task 5: borders/svg 기타 상수 점검

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/ctrl_header/table/svg/borders.rs:26` (13 => 3.00 등)
- Test: `bun run test:rust:snapshot`

**Step 1: borders 상수 출처 확인**

- borders.rs에서 숫자 3.00 등이 스펙 표(테두리 두께 등)에 대응하는지 확인. 스펙/JSON에서 유도 가능하면 파싱값으로 대체하고, 스펙 고정값이면 주석으로 표 번호·의미 명시.

**Step 2: Run test and commit**

Run: `bun run test:rust:snapshot`
Commit: `refactor(core): table border values from spec or parsed data`

---

## Task 6: document.rs hcd_position 전달 검증 (table left/top 31, 35.99)

**Files:**
- Modify: `crates/hwp-core/src/viewer/html/document.rs` (hcd_position 설정 구간 265-280)
- Test: table HTML 스냅샷

**Step 1: hcd_position 설정 조건 확인**

- Fixture table: left 31mm, top 35.99mm. 31 = left_margin + binding_margin, 35.99 = top_margin + header_margin + (첫 문단까지 오프셋?) 인지 table.hwp JSON의 PageDef·첫 문단 vertical_position으로 검증. document.rs에서 hcd_position = (left_margin_mm, top_margin_mm)만 넣고 있어서, 테이블이 "첫 문단 다음"에 있으면 테이블의 top은 base_top + offset_y 등으로 계산되어야 함. table_position()이 segment_position이 None일 때 base_left + offset_left_mm, base_top_for_obj + offset_top_mm을 쓰므로, hcd_position이 (31, 35.99)가 되려면 page_def의 left_margin+ binding_margin = 31, top_margin + header_margin = 35.99이거나, 테이블이 문단 내 객체로 offset이 더해져야 함. table.hwp가 "문단 안 테이블"이면 segment_position이 있어서 segment_left_mm/segment_top_mm이 쓰이고, 그 값이 31/35.99와 일치하도록 파싱되는지 확인. JSON 스냅샷에서 해당 테이블의 CtrlHeader offset_x/offset_y, segment 위치 확인 후, 필요 시 table_position 호출 시 전달 인자만 조정하거나 파서 쪽 수정은 별도 이슈로.

**Step 2: Run test**

Run: `bun run test:rust:snapshot`
Expected: table htb left/top이 fixture 31/35.99에 근접.

**Step 3: Commit**

```bash
git add crates/hwp-core/src/viewer/html/document.rs
git commit -m "fix(core): ensure table position from hcd_position/page_def/offset only"
```

---

## Task 7: 스냅샷 검토 및 정리

**Files:**
- Run: `bun run test:rust:snapshot:review`
- Modify: `crates/hwp-core/tests/snapshots/` (insta 승인 시)

**Step 1: 전체 스냅샷 실행 및 검토**

Run: `bun run test:rust:snapshot`
Run: `bun run test:rust:snapshot:review`
- table, table2, table-caption, table-position 등 Phase 1 fixture 대응 스냅샷 변경사항 승인. 의도한 수치만 바뀌었는지 확인.

**Step 2: Commit (필요 시)**

스냅샷 파일만 변경된 경우:
```bash
git add crates/hwp-core/tests/snapshots/
git commit -m "test(core): update HTML snapshots for parsed-values-only table/hls"
```

---

## 요약 체크리스트

- [ ] 테이블 left/top: hcd_position 또는 page_def·offset만 사용, fallback 문서화
- [ ] 캡션 width: 30.0 제거, resolved_size/htb_width 기반
- [ ] content_size height: row_sizes·cell height 우선, ctrl_header.height는 보조
- [ ] SVG viewBox: content_size 기반, padding만 상수
- [ ] hls line-height/top: LineSegment(baseline_distance, line_height, text_height) 또는 ParaShape/CharShape 유도
- [ ] cells 빈 hls: -0.18/3.53 제거, segment 또는 문서 기본값
- [ ] borders 등: 스펙/파싱 출처 명시 또는 대체
- [ ] 모든 변경 후 `bun run test:rust` 및 `bun run test:rust:snapshot:review` 통과
