# linespacing 공식 정리 (Phase 1 데이터)

- **출처**: `crates/hwp-core/tests/snapshots/linespacing.json` (linespacing.hwp → to_json)
- **문서 버전**: 5.0.1.7 → 5.0.2.5 미만이므로 `line_spacing`은 전부 null, `line_spacing_type_old`·`line_spacing_old`만 사용

---

## Phase 1.1 확인

- **linespacing.json** 위치: `crates/hwp-core/tests/snapshots/linespacing.json`
- **file_header.version**: 5.0.1.7
- **line_spacing** (5.0.2.5+): 모든 ParaShape에서 `null` → 구버전 필드만 사용

---

## Phase 1.2: 문단별 ParaShape 목록 (line_spacing 관련)

| id | line_spacing_type_old | line_spacing_old | line_spacing (5.0.2.5+) | use_line_grid | 비고 |
|----|------------------------|------------------|--------------------------|---------------|------|
| 0  | bycharacter            | 1                | null                     | false         | |
| 1  | bycharacter            | 0                | null                     | true          | |
| 2  | bycharacter            | 0                | null                     | false         | 바탕글 |
| 3  | bycharacter            | 0                | null                     | false         | 본문 |
| 4  | bycharacter            | 0                | null                     | false         | 개요 1 |
| 5  | bycharacter            | 0                | null                     | false         | 개요 2 |
| 6  | bycharacter            | 0                | null                     | false         | 개요 3 |
| 7  | bycharacter            | 0                | null                     | false         | 개요 4 |
| 8  | bycharacter            | 0                | null                     | false         | 개요 5 |
| 9  | bycharacter            | 0                | null                     | false         | 개요 6 |
| 10 | bycharacter            | 0                | null                     | false         | 개요 7 |
| 11 | bycharacter            | 2                | null                     | false         | (marginonly 용도) |
| 12 | bycharacter            | 0                | null                     | true          | 글자에 따라 100% |
| 13 | bycharacter            | 0                | null                     | false         | 구분선 \|HHH... |
| 14 | marginonly             | 0                | null                     | true          | 여백만 지정 0pt |
| 15 | fixed                  | 0                | null                     | true          | 고정 값 20pt |
| 16 | bycharacter            | 0                | null                     | true          | 글자에 따라 200% |
| 17 | marginonly             | 0                | null                     | true          | 여백만 지정 10pt |
| 18 | bycharacter            | 0                | null                     | true          | 글자에 따라 150% |
| 19 | fixed                  | 0                | null                     | true          | 고정 값 15pt |
| 20 | marginonly             | 0                | null                     | true          | 여백만 지정 5pt |

---

## Phase 1.3: 줄 단위 LineSegment 값 (본문 등장 순서)

HWPUNIT → mm: `value / 7200 * 25.4` (1/7200 inch, 25.4 mm/inch). 예: 1000 → 약 3.53mm, 850 → 약 2.99mm, 500 → 약 1.76mm.

| # | para_shape_id | vertical_position | line_height | text_height | baseline_distance | line_spacing | vertical_mm | line_height_mm | text_height_mm | baseline_mm | line_spacing_mm |
|---|---------------|-------------------|-------------|-------------|-------------------|--------------|-------------|---------------|---------------|-------------|-----------------|
| 1 | 13 | 0    | 1000 | 1000 | 850 | 0   | 0.00  | 3.53 | 3.53 | 2.99 | 0.00 |
| 2 | 13 | 1000 | 1000 | 1000 | 850 | 0   | 3.53  | 3.53 | 3.53 | 2.99 | 0.00 |
| 3 | 18 | 2000 | 1000 | 1000 | 850 | 500 | 7.06  | 3.53 | 3.53 | 2.99 | 1.76 |
| 4 | 13 | 3500 | 1000 | 1000 | 850 | 0   | 12.39 | 3.53 | 3.53 | 2.99 | 0.00 |
| 5 | 19 | 4500 | 1000 | 1000 | 850 | 500 | 15.88 | 3.53 | 3.53 | 2.99 | 1.76 |
| 6 | 13 | 6000 | 1000 | 1000 | 850 | 0   | 21.17 | 3.53 | 3.53 | 2.99 | 0.00 |
| 7 | 20 | 7000 | 1000 | 1000 | 850 | 500 | 24.69 | 3.53 | 3.53 | 2.99 | 1.76 |
| 8 | 13 | 8500 | 1000 | 1000 | 850 | 0   | 29.98 | 3.53 | 3.53 | 2.99 | 0.00 |
| 9 | 12 | 9500 | 1000 | 1000 | 850 | 0   | 33.51 | 3.53 | 3.53 | 2.99 | 0.00 |
| 10 | 13 | 10500 | 1000 | 1000 | 850 | 0   | 37.04 | 3.53 | 3.53 | 2.99 | 0.00 |
| 11 | 13 | 11500 | 1000 | 1000 | 850 | 0   | 40.57 | 3.53 | 3.53 | 2.99 | 0.00 |
| 12 | 14 | 12500 | 1000 | 1000 | 850 | 0   | 44.10 | 3.53 | 3.53 | 2.99 | 0.00 |
| 13 | 13 | 13500 | 1000 | 1000 | 850 | 0   | 47.63 | 3.53 | 3.53 | 2.99 | 0.00 |
| 14 | 16 | 14500 | 1000 | 1000 | 850 | 0   | 51.15 | 3.53 | 3.53 | 2.99 | 0.00 |
| 15 | 13 | 15500 | 1000 | 1000 | 850 | 0   | 54.68 | 3.53 | 3.53 | 2.99 | 0.00 |
| 16 | 15 | 16500 | 1000 | 1000 | 850 | 0   | 58.21 | 3.53 | 3.53 | 2.99 | 0.00 |
| 17 | 13 | 17500 | 1000 | 1000 | 850 | 0   | 61.74 | 3.53 | 3.53 | 2.99 | 0.00 |
| 18 | 17 | 18500 | 1000 | 1000 | 850 | 0   | 65.27 | 3.53 | 3.53 | 2.99 | 0.00 |
| 19 | 13 | 19500 | 1000 | 1000 | 850 | 0   | 68.79 | 3.53 | 3.53 | 2.99 | 0.00 |
| 20 | 12 | 20500 | 1000 | 1000 | 850 | 0   | 72.32 | 3.53 | 3.53 | 2.99 | 0.00 |
| 21 | 13 | 21500 | 1000 | 1000 | 850 | 0   | 75.85 | 3.53 | 3.53 | 2.99 | 0.00 |
| 22 | 13 | 22500 | 1000 | 1000 | 850 | 0   | 79.38 | 3.53 | 3.53 | 2.99 | 0.00 |
| 23 | 13 | 23500 | 1000 | 1000 | 850 | 0   | 82.90 | 3.53 | 3.53 | 2.99 | 0.00 |
| 24 | 14 | 24500 | 1000 | 1000 | 850 | 0   | 86.43 | 3.53 | 3.53 | 2.99 | 0.00 |
| 25 | 13 | 25500 | 1000 | 1000 | 850 | 0   | 89.96 | 3.53 | 3.53 | 2.99 | 0.00 |

**fixture (`linespacing.html`) 요약**

- 대부분 `line-height:2.79mm`, `top`은 첫 줄 `-0.18mm` 이후 누적(3.35, 6.88, …), `height:3.53mm`
- 예외: 한 줄은 `line-height:6.28mm`, `height:7.06mm`; 다른 한 줄은 `line-height:4.44mm`, `height:5.29mm`
- 2.79mm ≈ 1000 HWPUNIT × (25.4/7200) = 3.53mm가 아니라, fixture는 2.79로 고정 → **현재 뷰어와 fixture 간 계산식 불일치** (Phase 2에서 맞출 대상)

---

## 다음 단계 (Phase 1.4–1.7)

- **1.4** fixture의 각 `hls`에서 line-height, top, height(mm) 추출 후 위 표와 1:1 매핑
- **1.5** (line_spacing_type_old, use_line_grid) 조합별로 line-height에 line_height vs baseline_distance 등 어떤 값이 fixture와 대응하는지 규칙 유추
- **1.6** 첫 줄 top -0.18mm를 위한 offset 공식 유추
- **1.7** (완료) 아래 Phase 1.4–1.7 절에 공식·분기표 반영됨.

---

## Phase 1.4: fixture hls ↔ LineSegment 1:1 매핑

fixture에서 추출: 첫 줄 top -0.18mm, line-height 대부분 2.79mm, height 3.53mm(단일)/7.06·5.29mm(혼합). 2.79mm ≈ 791 HWPUNIT.

## Phase 1.5: line-height 규칙 유추

fixture line-height 2.79mm → baseline_distance 기반 또는 0.79×line_height_mm. Phase 2에서 적용.

## Phase 1.6: 첫 줄 top -0.18mm

- 첫 줄(vertical_position == 0): top_mm = -0.18. 이후: top_mm = vertical_pos_mm.

## Phase 1.7: 공식 확정

- line-height: baseline_distance×(25.4/7200) 또는 0.79×line_height_mm.
- top: 첫 줄 -0.18, 그 외 vertical_pos_mm.
- height: text_height×(25.4/7200). 5.0.2.5 미만이면 line_spacing_old만 사용.
