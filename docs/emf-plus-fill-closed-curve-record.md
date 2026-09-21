# EMF+ FillClosedCurve record

## 범위와 단일 출처

`emf_plus_fill_closed_curve.zig`는 MS-EMFPLUS 2.3.4.15의 Type, record envelope, BrushId와 W fill mode를 조립합니다. FillClosedCurve와 DrawClosedCurve가 공유하는 Tension·Count·PointData는 `emf_plus_closed_curve_data.zig`가 단일 소유합니다. S/C/W/P 해석은 `emf_plus_record_flags.zig`, Brush ObjectID/literal ARGB 선택은 `emf_plus_brush_id.zig`, 세 point 표현과 정렬 padding은 `emf_plus_point_data.zig`가 소유합니다.

P `0x0800`이 set이면 C `0x4000`을 무시하고 PointR를 선택하며, P가 clear이면 C에 따라 signed i16 Point 또는 원비트 f32 PointF를 선택합니다. 반환 `compressed_flag`는 P 때문에 무시된 경우에도 원문 C를 보존하고 실제 wire 형식은 `point_data.encoding`이 나타냅니다. W `0x2000`은 set일 때 winding(non-zero), clear일 때 alternate(even-odd) fill입니다. Tension은 정규화하지 않고 IEEE 754 원비트를 보존합니다.

## 크기·참조 검증

Count는 최소 3이고 기본 최대값은 공용 PointData와 같은 16 Mi points입니다. 고정형 DataSize는 12바이트 BrushId/Tension/Count prefix와 Count별 Point/PointF 길이가 정확히 일치해야 합니다. 상대형은 `align4(12 + PointR bytes)`이며 실제 Count개의 가변 PointR를 읽고 남은 0~3바이트를 alignment padding으로 보존합니다. 독립 Size/DataSize/slice 일치와 4바이트 record 정렬을 확인합니다.

stream은 S가 clear일 때만 Brush 슬롯 존재와 ObjectTypeBrush를 검사합니다. literal ARGB에는 객체 참조를 요구하지 않습니다. 누락·다른 객체 타입·payload·한도·집계 오류에서는 comment 전체 상태를 원복합니다. 상위 EMF framing은 같은 stream 경로를 사용합니다.

## 공식 근거와 미지원 경계

- [MS-EMFPLUS EmfPlusFillClosedCurve](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d7b561b0-3dc7-4444-b7ac-55492b5af0f4)
- [MS-WINERRATA FillClosedCurve fill-rule 정정](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-winerrata/a4fc60b3-edd1-4fde-a639-74ed85e5d0eb)

현재 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 FillClosedCurve 출력과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed point iteration, [공용 상대좌표 누적](emf-plus-point-resolution.md), [마지막→첫 span 조립](emf-plus-cardinal-spans.md), 조건부 Brush 참조와 stream/framing 연결입니다. Tension 기반 tangent/control point 계산, 곡선 평가, alternate/winding rasterization, transform·clip 적용, 재생·렌더링과 저장은 미구현입니다.

## 검증 기록

합성 fixture는 Point·PointF·혼합폭 PointR, P 우선순위, S/C/W/P 독립성, Brush ID 0·63·64와 literal ARGB, Tension 원비트, Count 최소·한도, padding과 과잉 padding, prefix 잘림, Size/DataSize/slice 불일치, Brush 존재·누락·타입, stream 집계·overflow 원자성과 실제 EMF framing을 검사합니다. 기존 DrawClosedCurve 집중 테스트도 공통화 회귀로 실행했습니다.

다섯 관점의 적대적 검토로 (1) 공식 BrushId/Tension/Count/PointData 순서와 크기, (2) S/C/W/P 독립 의미와 P의 C 우선 무시, (3) Fill/Draw 공통 curve-data 및 point/brush SSOT, (4) 조건부 Brush 참조·집계·rollback·상위 framing, (5) spline/fill-rule 재생·실파일 표본·저장 미지원 경계를 대조합니다.

W/P/C mask, Count 최소·전달, point slice·count, record type·정렬, Brush endian·S, 반환 flags/W/P/C/Tension/Count, 공통 오류 매핑, stream routing·Brush 존재/타입·집계 값·집계 대상과 Fill payload offset을 각각 훼손한 24종 의미 변이를 독립 복사본과 모드별 새 cache에서 실행했습니다. Debug, ReleaseSafe, ReleaseFast의 72/72 실행이 모두 컴파일 오류·panic·timeout이 아닌 실제 테스트 실패로 검출됐고 임시 복사본·cache·실행기는 제거했습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 step과 1882/1882 test를 통과했습니다. 모드별 구성은 native 1843, chart ownership 31, WMF contents 8이며, 각 실행은 8,905,827 checks, imports 0과 CFB 12,000 mutation의 traps 0을 기록했습니다.
