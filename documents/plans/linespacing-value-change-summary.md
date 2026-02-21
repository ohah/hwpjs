# 라인스페이싱 값 변경 정리 (스펙 기준 적용 후)

## 변환 공식 (HWPUNIT → mm)

- **1 HWPUNIT** = 1/7200 inch, 25.4 mm/inch → **value_mm = value × 25.4 / 7200** ≈ value × 0.003527…
- 예: **1000 HWPUNIT** → **3.53 mm** (소수 둘째자리 반올림)

JSON 예시 (linespacing): `line_height: 1000`, `vertical_position: 0 또는 1000, 2000, …`, `text_height: 1000`.

---

## 이전 (보정 있음)

| 항목 | 공식 | 예시 값 (line_height=1000, text_height=1000) |
|------|------|---------------------------------------------|
| **line-height** | 0.79 × (line_height → mm) | 0.79 × 3.53 = **2.79 mm** |
| **top (첫 줄)** | **-0.18 mm** (고정 오프셋) | **-0.18 mm** |
| **top (다른 줄)** | vertical_position → mm (+ baseline 등) | 3.53, 7.06, … mm |
| **height** | text_height → mm (표 62) | 3.53 mm |

※ 0.79, -0.18은 스펙에 없고 fixture/JSON 대조로 유추한 값.

---

## 현재 (스펙만 사용하는 경로, body_default_hls = None)

| 항목 | 공식 (HWP 5.0 표 62) | 예시 값 (line_height=1000, text_height=1000) |
|------|----------------------|---------------------------------------------|
| **line-height** | 표 62 "줄의 높이" = line_height → mm | **3.53 mm** |
| **top (첫 줄)** | "줄의 세로 위치" 0 → mm + (line_height - text_height)/2 | 0 + 0 = **0 mm** |
| **top (다른 줄)** | vertical_position → mm + (line_height - text_height)/2 | 3.53, 7.06, … mm |
| **height** | 표 62 "텍스트 부분의 높이" = text_height → mm | 3.53 mm (변경 없음) |

---

## 요약: 무엇이 바뀌었나

| 항목 | 이전 (보정) | 현재 (스펙만) |
|------|-------------|----------------|
| **line-height** | 2.79 mm | **3.53 mm** |
| **첫 줄 top** | -0.18 mm | **0 mm** |
| **height** | 3.53 mm | 3.53 mm (동일) |

즉, **보정을 제거한 뒤**에는  
- 줄 높이는 **스펙의 "줄의 높이"(line_height)** 그대로 mm로 나오고,  
- 첫 줄 top은 **"줄의 세로 위치" 0**에 줄 안에서의 세로 중앙 오프셋만 더해져 **0 mm**가 됨.

---

## 예외: body_default_hls (fixture 일치용)

현재 코드에는 **본문이 모두 빈 세그먼트**(줄 격자만, 테이블/이미지 없음)일 때  
`body_default_hls = Some((2.79, -0.18))` 로 두어 **linespacing fixture와 동일한 값**을 쓰는 분기가 남아 있음.

- 그 경우: line-height **2.79 mm**, 첫 줄 top **-0.18 mm** 유지 (fixture 일치).
- 그 외: 위의 스펙만 사용하는 값 (3.53 mm, 0 mm).

이 예외까지 제거하면 **모든 문서**에서 표 62 기준 스펙 값만 나오고, linespacing fixture와의 수치 일치는 포기하게 됨.

---

## 스펙만으로 fixture와 동일하게 할 수 있는가?

**결론: 스펙 문서만으로는 fixture(2.79mm, -0.18mm)와 동일한 값을 유도할 수 없습니다.**

### 스펙에 있는 것 (표 62·문단 모양)

- **표 62**: 줄의 세로 위치, **줄의 높이**, 텍스트 부분의 높이, **줄의 세로 위치에서 베이스라인까지 거리**, 줄간격
- **문단 모양**: 줄 간격 종류(글자에 따라/고정/여백만), 편집 용지 줄 격자 사용 여부, 글꼴에 맞는 줄 높이

### 2.79 (line-height)를 스펙에서 유도할 수 있는가?

- fixture 2.79mm = **0.79 × line_height_mm** (3.53) = 0.79 × 1000 HWPUNIT → mm.
- **baseline_distance** = 850 → mm 변환 시 **2.99mm** (2.79 아님).
- 표 62·표 46에 "줄의 높이의 79%" 또는 0.79 계수는 **없음**. "글자에 따라(%)"는 있으나, 그 비율로 line_height를 어떻게 쓰라는 수식은 **명시되어 있지 않음**.

→ **0.79는 스펙에 없는, 레이아웃 엔진 쪽 해석(또는 레거시 동작)으로 보는 수밖에 없음.**

### -0.18 (첫 줄 top)을 스펙에서 유도할 수 있는가?

- 표 62 "줄의 세로 위치에서 베이스라인까지 거리"를 쓰면:  
  첫 줄 top = vertical_position + (line_height - text_height)/2 = 0 + 0 = **0mm** (또는 베이스라인 정렬 시 0 + baseline_distance - 0.85×text_height = 0).
- **-0.18mm**에 해당하는 오프셋은 표 62·문단 모양 어디에도 **나오지 않음**.

→ **첫 줄 -0.18mm 역시 스펙에 없는 보정값.**

### 요약

| 목표 | 가능 여부 |
|------|-----------|
| **스펙만 따른다** (표 62 그대로 사용) | 가능 → line-height 3.53mm, 첫 줄 top 0mm |
| **fixture와 동일한 수치** (2.79mm, -0.18mm) | 스펙만으로는 불가 → 0.79·-0.18은 스펙에 없음 |
| **스펙과 HTML fixture를 동시에 동일하게** | **불가** — 스펙과 fixture가 서로 다른 해석(스펙 직역 vs 레거시 보정)을 쓰고 있음 |

따라서 "문서 스펙과 HTML을 동일하게" 맞추려면, **스펙에 명시된 필드와 단위만 사용**하는 쪽(지금의 스펙 기준 구현)을 선택하거나, **fixture와의 시각 일치**를 우선해 스펙에 없는 보정(2.79, -0.18)을 유지하는 둘 중 하나를 택해야 합니다. 스펙만으로 두 가지를 동시에 만족하는 공식은 없습니다.

---

## 다른 속성이 영향을 미치는지 확인

표 62·문단 모양의 **다른 필드**로 2.79 / -0.18이 나오는지 검토함.

### 사용 가능한 필드 (표 62 + 문단 모양)

- **LineSegmentInfo (표 62)**: vertical_position, line_height, text_height, **baseline_distance**, line_spacing, column_start_position, segment_width, tag
- **ParaShape**: line_spacing_type_old, use_line_grid, vertical_align, line_height_matches_font, line_spacing_old, indent, outdent, top_spacing, bottom_spacing 등

현재 렌더링에서 **line-height/top 계산에 쓰이지 않는** 필드: `baseline_distance`, `line_spacing`(표 62), 문단 모양의 `vertical_align`, `line_height_matches_font`, `use_line_grid` 등.

### -0.18 (첫 줄 top): **다른 속성으로 유도 가능**

표 62 **"줄의 세로 위치에서 베이스라인까지 거리"** `baseline_distance`를 쓰면:

- `(line_height - baseline_distance) / 3` (HWPUNIT) → mm 변환 시 **약 0.176 → 0.18**
- fixture: 첫 줄 top **-0.18mm**, 둘째 줄 **3.35mm** = 3.53 − 0.18 → **모든 줄에 동일 오프셋 -0.18** 적용된 형태
- 따라서 **top = vertical_pos_mm − int32_to_mm((line_height − baseline_distance) / 3)** 로 두면 스펙 필드만으로 fixture의 -0.18과 동일한 결과를 낼 수 있음. (나눗셈 3은 스펙에 명시된 상수는 아니나, 표 62 필드 조합으로 값이 유도됨.)

→ **첫 줄 top -0.18은 `baseline_distance`를 쓰는 공식으로 스펙과 동시 만족 가능.**

### 2.79 (line-height): **다른 속성으로는 유도 불가**

- **baseline_distance** → mm: 850 × 25.4/7200 ≈ **2.99mm** (2.79 아님).
- **line_spacing** (표 62): 첫 줄 세그먼트는 0 → 0mm.
- **line_height_matches_font**, **use_line_grid**, **vertical_align** (문단 모양): linespacing fixture에서 ps13은 모두 baseline / false / false. 이 조합으로 0.79나 2.79를 만드는 수식은 스펙·데이터에서 찾지 못함.
- 2.79 = 0.79 × line_height_mm 이므로, **0.79 계수**를 스펙 필드 조합으로 설명할 수 없음.

→ **line-height 2.79는 표 62·문단 모양의 다른 속성만으로는 동일하게 만들 수 없음.**

### 정리

| 값 | 다른 속성으로 유도 | 비고 |
|----|-------------------|------|
| **첫 줄 top -0.18mm** | **가능** | `top = vertical_pos_mm − (line_height − baseline_distance)/3` → mm (표 62 baseline_distance 사용) |
| **line-height 2.79mm** | **불가** | baseline_distance·line_spacing·문단 모양 조합으로는 2.79/0.79를 만들 수 없음 |

구현 시 **top만** `baseline_distance` 기반 공식으로 바꾸면, 스펙과 fixture가 **top -0.18**에서는 일치하고, **line-height**는 스펙대로 3.53mm를 쓰거나 fixture용 2.79를 별도 보정해야 하는 상태로 정리됨.
