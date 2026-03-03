# ParaShape indent → padding-left 변환 분석

- **출처**: `crates/hwp-core/tests/snapshots/parashape.json`, `crates/hwp-core/tests/snapshots/noori.json`
- **fixture**: `crates/hwp-core/tests/fixtures/parashape.HTML`, `crates/hwp-core/tests/fixtures/noori.html`
- **코드**: `crates/hwp-core/src/viewer/html/line_segment.rs` (`render_line_segment()`)

---

## 요약

HWP ParaShape의 `indent` 필드 값을 HTML `padding-left`로 변환할 때, 표준 HWPUNIT 변환(`value * 25.4 / 7200`)에 추가로 `/2.0` 보정이 필요하다.

```
padding-left(mm) = int32_to_mm(abs(indent)) / 2.0
                 = abs(indent) * 25.4 / 7200.0 / 2.0
```

**이 `/2.0` 보정은 fixture 역산으로 도출한 것이며, HWP 5.0 스펙 문서에서 근거를 확인하지 못했다.**

---

## 스펙 정의 (표 43: 문단 모양)

HWP 5.0 스펙 `documents/docs/spec/hwp-5.0.md` 표 43:

| 자료형 | 길이 | 설명 |
|--------|------|------|
| INT32  | 4    | 들여쓰기 |
| INT32  | 4    | 내어쓰기 |

LineSegment 태그 (표 62):
- bit 20: `has_indentation` — indentation 적용 여부

---

## indent 필드의 의미

- **양수** → 들여쓰기: 첫 줄에 `has_indentation=true`, 이후 줄은 false
- **음수** → 내어쓰기: 첫 줄은 `has_indentation=false`, 이후 줄에 true

`outdent` 필드는 `padding-left` 계산에 사용되지 않는다 (검증된 모든 케이스에서).

---

## 검증 데이터

### parashape.hwp

| ParaShape | indent | outdent | has_indentation 위치 | fixture padding-left | 계산값 (`abs(indent)/2 → mm`) |
|-----------|--------|---------|---------------------|---------------------|-------------------------------|
| ps12 (문단3 들여쓰기) | 2000 | 0 | 첫째 줄 | 3.53mm | `abs(2000)*25.4/7200/2 = 3.53mm` ✓ |
| ps13 (문단4 내어쓰기) | -2000 | 0 | 둘째 줄 | 3.53mm | `abs(-2000)*25.4/7200/2 = 3.53mm` ✓ |

### noori.hwp

| ParaShape | indent | outdent | fixture padding-left | 계산값 |
|-----------|--------|---------|---------------------|--------|
| ps35 | -4776 | 2600 | 8.42mm | `4776*25.4/7200/2 = 8.42mm` ✓ |
| ps29 | -6550 | 2000 | 11.55mm | `6550*25.4/7200/2 = 11.55mm` ✓ |
| ps30 | -6168 | 2000 | 10.88mm | `6168*25.4/7200/2 = 10.88mm` ✓ |
| ps37 | -4688 | 2600 | (ps35와 동일 패턴) | `4688*25.4/7200/2 = 8.27mm` ✓ |
| ps34 | -4776 | 2600 | 7.06mm 아님 | (ps35와 동일 indent) |
| ps32 | -4776 | 2600 | 7.06mm 아님 | (ps35와 동일 indent) |

**참고**: noori의 `outdent` 값(2600, 2000 등)은 `int32_to_mm(outdent)` 변환 시 fixture와 불일치:
- ps35: `int32_to_mm(2600) = 9.17mm` ≠ fixture `8.42mm`
- ps29: `int32_to_mm(2000) = 7.06mm` ≠ fixture `11.55mm`

→ `outdent`를 사용한 이전 코드는 noori에서도 잘못된 값을 생성하고 있었다.

---

## 미해결 사항

1. **`/2.0` 보정의 스펙 근거**: HWP 5.0 스펙에서 indent/outdent 필드의 단위가 HWPUNIT(1/7200인치)이라고 명시되어 있으나, 실제 저장 값은 기대값의 2배이다. 가능한 원인:
   - indent 필드가 다른 단위(1/14400인치 등)를 사용할 수 있음
   - 한글 프로그램 내부에서 2배 스케일로 저장하는 관례가 있을 수 있음
   - 스펙 문서와 실제 구현 사이의 차이일 수 있음

2. **`outdent` 필드의 용도**: 검증된 모든 케이스에서 `padding-left`에 `outdent`는 사용되지 않았다. `outdent` 필드가 레이아웃 계산의 다른 부분(예: `column_start_position`, `segment_width` 산출)에 간접적으로 반영되는지는 미확인.

3. **`indent=0, outdent>0`인 경우**: parashape.hwp의 ps14(`indent=0, outdent=2600`)가 이 케이스이나, 해당 문단에 `has_indentation=true`인 라인이 없어 padding-left 동작을 검증할 수 없었다.
