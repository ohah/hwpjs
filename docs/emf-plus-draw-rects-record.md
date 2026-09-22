# EMF+ DrawRects record

## 범위와 단일 출처

`emf_plus_draw_rects.zig`는 MS-EMFPLUS 2.3.4.13의 Type, Flags, Size/DataSize, Count와 RectData 배열을 조립합니다. C와 Pen ObjectID는 `emf_plus_record_flags.zig`, Rect/RectF 선택은 `emf_plus_rect_data.zig`가 소유합니다. Count 최소값·한도, C별 원소 폭, 정확한 배열 길이와 borrowed iterator는 `emf_plus_rect_array.zig`가 단일 출처이며 후속 FillRects도 재사용할 수 있습니다.

Count는 명세의 MUST에 따라 1 이상이어야 합니다. C가 set이면 `DataSize = 4 + Count * 8`, clear이면 `DataSize = 4 + Count * 16`이고 `Size = DataSize + 12`여야 합니다. Size의 DWORD 정렬, Size/DataSize 관계와 실제 slice를 독립적으로 검사하고 모든 곱셈과 count 한도를 검사합니다. 기본 최대값은 16 Mi rectangles입니다.

reserved Flags는 MUST be ignored에 따라 원값으로 보존합니다. RectF에는 별도 유한성·양수 제약이 없으므로 음수 0, NaN과 무한대의 원비트를 정규화하지 않습니다. Rect/RectF 좌표 의미와 사각형 stroke 재생은 parser가 추정하지 않습니다.

## stream 연결과 미지원 경계

stream은 Pen ObjectID 슬롯이 존재하고 ObjectTypePen인지 확인합니다. 누락 Pen, 다른 객체 타입, payload·한도·집계 오류는 comment 전체 상태를 원복하고 상위 EMF framing은 같은 경로를 사용합니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawRects 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 wire 구조, borrowed rectangle iteration, Pen 참조, stream/framing과 [공개 device-corner iterator 연결](emf-plus-rect-record-device-corners.md)입니다. clipping·stroke 재생과 저장은 미구현입니다.

## 검증 기록

합성 fixture는 C 양쪽, Count 1·2·0과 한도, Pen ID 0·63·64, reserved Flags, signed i16 양 끝, 비유한 RectF 원비트, 두 C 상태의 모든 payload 길이, 독립 Size/DataSize/slice 불일치, Pen 존재·누락·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다. 공용 RectArray도 두 표현의 순서·iterator 종료, count·길이·한도를 독립적으로 검사합니다.

RecordType, 최소 envelope, Size/DataSize 관계·실제 slice, C 해석, RectArray에 전달하는 Count·C·한도, 공용 오류 mapping, 반환 Flags·Pen ID·C·Count, 공용 RectArray count 최소값·한도·원소 폭·정확한 길이·iterator 종료, stream routing·Pen 존재/타입·report 대상·overflow를 각각 망가뜨린 24개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리하고 120초 watchdog을 적용해 Debug·ReleaseSafe·ReleaseFast 총 72/72회를 모두 검출했습니다. 결과표와 별도로 72개 로그 모두 assertion 또는 expected-error 실패이며 컴파일 오류·시간 초과가 없음을 재분류했습니다. 생존·컴파일 실패·무변경 치환·시간 초과는 없으며 유효 로그는 `/tmp/hwpjs-emfplus-draw-rects-mutants.srrRWm`입니다.

첫 캠페인에서는 실제 slice 검사를 제거한 변이가 생존했습니다. 기존 fixture가 downstream RectArray 길이 검사에서도 실패해 envelope 축을 독립 증명하지 못한 테스트 위치 편향이었습니다. 선언 DataSize는 한 rectangle이지만 실제 slice는 완전한 두 rectangle인 fixture를 추가했습니다. options 무시 변이도 미사용 매개변수 컴파일 오류라 원래 한도를 소비하면서 1만 늘리도록 교체했습니다. 두 번째 캠페인의 count 최소값·배열 길이 제거는 Zig의 추론 error set을 바꿔 6회 컴파일 오류였으므로, 오류 경로는 유지하면서 정상 조건만 우회하는 변이로 교체했습니다. 앞선 두 캠페인을 폐기하고 위 세 번째 캠페인을 처음부터 수행했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,705/1,705 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-rects-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
