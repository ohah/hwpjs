# EMF+ DrawPie record

## 범위와 단일 출처

`emf_plus_draw_pie.zig`는 MS-EMFPLUS 2.3.4.12의 Type, Flags, Size/DataSize와 pie payload를 조립합니다. C와 Pen ObjectID는 `emf_plus_record_flags.zig`, Rect/RectF 선택은 `emf_plus_rect_data.zig`가 소유합니다. DrawArc와 동일한 StartAngle·SweepAngle·RectData 순서 및 C별 byte length는 `emf_plus_arc_data.zig`가 단일 출처이며 두 record parser가 이를 재사용합니다.

C가 set이면 Size 28/DataSize 16/실제 data 16바이트, clear이면 Size 36/DataSize 24/실제 data 24바이트여야 합니다. 세 크기 축은 독립적으로 검사하고 ObjectID는 0–63만 허용합니다. reserved Flags는 MUST be ignored에 따라 원값으로 보존합니다.

StartAngle과 SweepAngle은 IEEE 754 wire 값을 보존합니다. 명세의 StartAngle modulo 360과 SweepAngle -360~360 clamp는 재생 규칙이므로 parser가 값을 덮어쓰지 않습니다. Rect/RectF 좌표도 정규화하지 않습니다.

## stream 연결과 미지원 경계

stream은 Pen ObjectID 슬롯이 존재하고 ObjectTypePen인지 확인합니다. 누락 Pen, 다른 객체 타입, payload·집계 오류는 comment 전체 상태를 원복하고 상위 EMF framing은 같은 경로를 사용합니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawPie 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, Pen 참조, stream/framing, [공개 device-corner 연결](emf-plus-rect-record-device-corners.md)과 [affine arc geometry](emf-plus-arc-device-geometry.md)입니다. radial edges·닫힘, clipping·stroke·rasterization과 저장은 미구현입니다.

## 검증 기록

합성 fixture는 C 양쪽, Pen ID 0·63·64, reserved Flags, signed i16 양 끝, 비유한 float 원비트, 모든 payload 길이와 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다. 공용 ArcData 자체도 angle 선행 순서, 두 Rect 형식, 소비 길이를 독립적으로 검사합니다.

RecordType, C 해석, Size/DataSize/실제 slice, ObjectID 범위, 반환 Flags·Pen ID·C·두 각도, 공용 ArcData 길이·각도 순서·Rect 선택, stream routing·Pen 존재/타입·report 대상·overflow를 각각 망가뜨린 19개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리하고 120초 watchdog을 적용해 Debug·ReleaseSafe·ReleaseFast 총 57/57회를 모두 검출했습니다. 결과표와 별도로 57개 로그 모두 assertion 또는 expected-error 실패이며 컴파일 오류·시간 초과가 없음을 재분류했습니다. 생존·컴파일 실패·무변경 치환·시간 초과는 없으며 유효 로그는 `/tmp/hwpjs-emfplus-draw-pie-mutants.iUZcyn`입니다.

첫 캠페인의 Pen ID 반환 변이는 기존 지역 변수를 미사용으로 만들어 3회 컴파일 오류였고, 두 번째 캠페인의 Rect 선택 변이도 `compressed` 매개변수를 미사용으로 만들어 3회 컴파일 오류였으므로 두 캠페인을 폐기했습니다. 반환 변이는 원래 ID를 소비한 XOR로, Rect 변이는 `compressed and false`로 입력을 소비하면서 의미만 훼손하도록 바꾼 뒤 위 세 번째 캠페인을 처음부터 수행했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,698/1,698 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-pie-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
