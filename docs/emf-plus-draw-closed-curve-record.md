# EMF+ DrawClosedCurve record

## 범위와 단일 출처

`emf_plus_draw_closed_curve.zig`는 MS-EMFPLUS 2.3.4.4의 Type, record envelope와 Pen ObjectID를 조립합니다. FillClosedCurve와 공유하는 Tension, Count와 PointData는 `emf_plus_closed_curve_data.zig`가 단일 소유합니다. P `0x0800`이 set이면 C `0x4000`을 무시하고 PointR를 선택하며, P가 clear이면 C에 따라 signed i16 Point 또는 원비트 f32 PointF를 선택합니다. P/C/ObjectID는 `emf_plus_record_flags.zig`, 세 point 표현과 0~3바이트 padding은 `emf_plus_point_data.zig`, Integer7/15와 iterator는 `emf_plus_point.zig`가 소유합니다.

반환값의 `compressed_flag`는 P 때문에 무시된 경우에도 원문 C bit를 보존하고, 실제 선택된 wire 형식은 `point_data.encoding`만 나타냅니다. Tension은 렌더링 값으로 해석하거나 정규화하지 않고 IEEE 754 원비트를 유지합니다. 명세에 MUST 유한성·부호 범위가 없으므로 음수 0과 NaN도 wire parser가 새로 거부하지 않습니다.

## 크기·참조 검증

Count는 명세의 최소값 3을 적용하며 기본 최대값은 공용 PointData와 같은 16 Mi points입니다. 고정형은 8바이트 Tension/Count prefix와 Count별 Point/PointF 길이가 정확히 일치해야 합니다. 상대형 최소 DataSize는 `align4(8 + Count * 2)`로 계산하고 실제 Count개의 가변 PointR를 읽은 뒤 남는 0~3바이트만 alignment padding으로 보존합니다. 모든 크기 계산과 stream 집계는 overflow를 검사합니다.

stream은 해당 ObjectID 슬롯이 이미 존재하고 ObjectTypePen인지 확인합니다. 누락 Pen, 다른 객체 타입, payload·한도·집계 오류는 comment 전체 상태를 원복합니다. 상위 EMF framing은 같은 stream 경로를 사용하고 payload 규칙을 복제하지 않습니다.

## 미지원 경계와 검증 기록

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawClosedCurve 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed point iteration, [공용 상대좌표 누적](emf-plus-point-resolution.md), [마지막→첫 span 조립](emf-plus-cardinal-spans.md), [span 통과점의 일반 world/page/device 변환](emf-plus-cardinal-device-spans.md), Object Table 참조와 stream/framing 연결입니다. Tension 기반 tangent/control point 계산, 곡선 평가, clip·재생·래스터화와 저장은 미구현입니다.

합성 fixture는 Point·PointF·혼합폭 PointR, P 우선순위, Tension 원비트, ObjectID 0~63 경계, reserved flags, Count 최소·한도, padding과 과잉 padding, 모든 prefix 잘림, 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

P mask·ObjectID 경계, P/C 우선순위, 고정 point 폭, padding 상한, point 한도, PointR 필드 전달, record type·정렬·Tension·Count 최소값, Pen ID와 반환 flags/count, stream routing·Pen 존재/타입·집계 대상을 각각 망가뜨린 19개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 57/57회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 로그는 `/tmp/hwpjs-emfplus-draw-closed-curve-mutants.WanAO8`입니다.

FillClosedCurve와 공통 curve-data 계층으로 합친 뒤 세 모드 전체 audit를 다시 실행한 최신 결과는 [FillClosedCurve 검증 기록](emf-plus-fill-closed-curve-record.md)에 둡니다. 위 19종 변이 기록은 최초 DrawClosedCurve 구현 당시의 독립 검증 이력입니다.
