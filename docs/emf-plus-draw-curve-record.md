# EMF+ DrawCurve record

## 범위와 단일 출처

`emf_plus_draw_curve.zig`는 MS-EMFPLUS 2.3.4.5의 Type, Flags, Size/DataSize, Tension, Offset, NumSegments, Count와 PointData를 조립합니다. 이 record에는 P flag가 없으므로 `0x0800`을 포함한 reserved bits는 무시하고 C `0x4000`만으로 signed i16 Point 또는 원비트 f32 PointF를 선택합니다. C/ObjectID는 `emf_plus_record_flags.zig`, 두 절대 point 표현과 iterator는 `emf_plus_point_data.zig`·`emf_plus_point.zig`가 소유합니다.

Tension은 렌더링 값으로 정규화하지 않고 IEEE 754 원비트를 유지합니다. 명세에 MUST 유한성·부호 범위가 없으므로 음수 0과 NaN도 wire parser가 새로 거부하지 않습니다. Offset과 NumSegments도 원문 u32로 보존합니다. 명세가 Count와의 별도 MUST 관계를 두지 않으므로 범위 밖처럼 보이는 값을 parser가 추정으로 거부하거나 보정하지 않습니다.

## 크기·참조 검증

Count는 명세의 최소값 2를 적용하며 기본 최대값은 공용 PointData와 같은 16 Mi points입니다. record data는 16바이트 Tension/Offset/NumSegments/Count prefix와 `Count * 4` 또는 `Count * 8` point bytes가 정확히 일치해야 합니다. Size, DataSize와 실제 slice 세 축을 독립적으로 검사하고 모든 크기 계산과 stream 집계는 overflow를 검사합니다.

stream은 해당 ObjectID 슬롯이 이미 존재하고 ObjectTypePen인지 확인합니다. 누락 Pen, 다른 객체 타입, payload·한도·집계 오류는 comment 전체 상태를 원복합니다. 상위 EMF framing은 같은 stream 경로를 사용하고 payload 규칙을 복제하지 않습니다.

## 미지원 경계와 검증 기록

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawCurve 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed point iteration, [Offset·NumSegments span 선택](emf-plus-cardinal-spans.md), Object Table 참조와 stream/framing 연결입니다. Tension 기반 tangent/control point 계산, 곡선 평가, 변환·래스터화와 저장은 미구현입니다.

합성 fixture는 Point·PointF, reserved P bit 무시, Tension 원비트, Offset·NumSegments 극단값, ObjectID 0~63 경계, Count 최소·한도, 모든 prefix 잘림, 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

C mask·ObjectID 경계, reserved P 오인, 고정 point 폭·한도, record type·정렬·Tension·Count 최소값, Pen ID와 반환 C/Offset/NumSegments/Count, 크기 계산 point 폭, stream routing·Pen 존재/타입·집계 대상을 각각 망가뜨린 19개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 57/57회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 유효 로그는 `/tmp/hwpjs-emfplus-draw-curve-mutants.CwLIIa`입니다.

최초 캠페인의 Offset·NumSegments 교차 대입은 반대쪽 지역변수를 미사용으로 만들어 6회가 컴파일 실패했으므로 전체 결과를 폐기했습니다. 두 필드를 각각 정의된 wrapping 증가로 왜곡하는 변이로 교체해 처음부터 재실행한 두 번째 캠페인만 위 57회에 포함했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,660/1,660 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-curve-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
