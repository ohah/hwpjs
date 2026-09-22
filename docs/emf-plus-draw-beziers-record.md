# EMF+ DrawBeziers record

## 범위와 단일 출처

`emf_plus_point.zig`는 [EmfPlusPointR](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/c861a0d4-39f0-4f6c-bad9-e3f7bf63205e)의 Integer7/15 좌표와 Point·PointF·PointR 공용 iterator를 소유합니다. 기존 Path 객체와 drawing record가 이 구현을 함께 사용하며 상대 좌표 부호·폭을 다시 구현하지 않습니다. `emf_plus_point_data.zig`는 P와 C flags에 따른 세 배열 표현, point 한도와 정렬 padding 경계를 소유합니다.

`emf_plus_draw_beziers.zig`는 MS-EMFPLUS 2.3.4.3의 Type, Flags, Size/DataSize, Count와 PointData를 조립합니다. P `0x0800`이 set이면 C `0x4000`은 명세대로 무시하고 PointR를 선택합니다. P가 clear이면 C에 따라 signed i16 Point 또는 원비트 f32 PointF를 선택합니다. ObjectID와 P/C bit 해석은 `emf_plus_record_flags.zig`가 단일 출처입니다. 반환값의 `compressed_flag`는 무시된 경우까지 원문 C bit를 보존하고 실제 선택 형식은 `point_data.encoding`만 나타냅니다.

## 검증과 표현

Count는 명세의 최소값 4를 적용하며 기본 최대값은 16 Mi points입니다. 고정형 Point/PointF는 Count로 계산한 길이와 정확히 일치해야 합니다. PointR는 좌표마다 2~4바이트이므로 실제 Count개를 원자적으로 읽고, 32-bit record 정렬을 위한 남은 0~3바이트를 원문 padding으로 보존합니다. Count를 신뢰해 선할당하지 않으며 곱셈·덧셈과 stream 집계 overflow를 검사합니다.

명세는 최소 4 points만 요구하므로 문서에 없는 `(Count - 1) % 3 == 0` 제약을 wire parser가 추가하지 않습니다. 세 wire 표현은 tagged iterator로 노출하고, 상대 좌표 누적과 완전한 `1+3n` [연결 cubic topology](emf-plus-bezier-geometry.md)는 별도 geometry API가 담당합니다. reserved flags와 padding 값은 거부하지 않습니다.

stream은 해당 ObjectID 슬롯이 이미 존재하고 ObjectTypePen인지 확인합니다. 누락 슬롯, 다른 객체 타입, payload·한도·집계 오류는 comment 전체 상태를 원복합니다. 상위 EMF framing은 같은 stream 경로를 사용합니다.

## 미지원 경계와 검증 기록

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawBeziers 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed point iteration, [공용 상대좌표 누적](emf-plus-point-resolution.md), 연결 cubic segment 조립, [일반 world/page/device 변환](emf-plus-bezier-device-segments.md), [단일 parameter cubic 평가](emf-plus-cubic-evaluation.md), Object Table 참조와 stream/framing 연결입니다. flattening, clip, stroke·래스터화와 저장은 미구현입니다.

합성 fixture는 Point·PointF·혼합폭 PointR, P 우선순위, ObjectID 0~63 경계, reserved flags, Count 최소·한도, float 원비트, padding 0~3, 모든 prefix 잘림, 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

P mask·ObjectID 경계, P/C 우선순위, 고정 point 폭, padding 상한, point 한도·반복 수·borrowed slice, PointR 필드 전달, record type·Count 최소값·Pen ID·relative 반환값, stream routing·Pen 존재/타입·집계 대상을 각각 망가뜨린 17개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리해 Debug·ReleaseSafe·ReleaseFast 총 51/51회를 모두 검출했고 생존·컴파일 실패·무변경 치환은 없습니다. 유효 로그는 `/tmp/hwpjs-emfplus-draw-beziers-mutants.orF3w0`입니다.

최초 두 캠페인은 결과에서 제외했습니다. 첫 실행은 global cache를 공유해 같은 길이 mutation이 ReleaseFast에서 가려졌고 PointR 치환 하나가 무변경이었습니다. 두 번째 실행의 ObjectID 64 과수용은 ReleaseFast에서 범위를 벗어난 u6 cast를 발생시키는 정의되지 않은 변이였습니다. cache를 완전히 격리하고 정의된 범위에서 ID 63을 과거부하는 변이로 교체한 세 번째 실행만 위 51회에 포함했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,650/1,650 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-beziers-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
