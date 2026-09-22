# EMF+ DrawPath record

## 범위와 단일 출처

`emf_plus_draw_path.zig`는 MS-EMFPLUS 2.3.4.11의 Type, Flags, Size/DataSize와 PenId를 해석합니다. Flags 하위 ObjectID는 Path 슬롯이고 공용 `emf_plus_record_flags.zig`가 0–63 범위를 검사합니다. payload의 u32 PenId도 0–63만 허용합니다. 나머지 Flags는 MUST be ignored에 따라 원값으로 보존합니다.

이 레코드는 Path geometry를 내장하지 않습니다. Size 16, DataSize 4와 실제 4바이트 slice를 각각 정확히 검사하고 두 객체 ID만 노출합니다. Path payload와 point/type 규칙은 기존 [EMF+ Path 계층](emf-plus-path-object.md)이 소유하며 이 parser가 복제하지 않습니다.

## stream 연결과 미지원 경계

stream은 Flags의 Path ObjectID 슬롯이 존재하고 ObjectTypePath인지, payload의 PenId 슬롯이 존재하고 ObjectTypePen인지 순서대로 확인합니다. 누락·타입 불일치·payload·집계 오류는 comment 전체 상태를 원복하고 상위 EMF framing은 같은 경로를 사용합니다.

현재 로컬 HWP corpus에는 EMF+ signature가 없어 실제 한컴 DrawPath 표본과 렌더링 결과는 관측하지 못했습니다. 구현 범위는 고정 wire 구조, Path/Pen 참조와 stream/framing 연결입니다. 독립 Path 객체 API는 [stroke segment의 일반 world/page/device 변환](emf-plus-path-device-segments.md)을 제공하지만 Object Table이 Path payload를 장기 소유하지 않아 이 record replay에는 아직 연결되지 않았습니다. clipping·stroke·저장은 미구현입니다.

## 검증 기록

합성 fixture는 Path/Pen ID 0·63, reserved Flags 보존, PenId 64·u32 최대값, Path ObjectID 64, RecordType, 모든 payload 길이와 독립 Size/DataSize/slice 불일치, 두 객체의 존재·타입 불일치, stream 집계·overflow 원자성과 실제 EMF framing 연결을 검사합니다.

RecordType, Size/DataSize/실제 slice, PenId 범위, 반환 Flags·Path ID·Pen ID, stream routing, Path/Pen 조회 ID·존재·타입, report 대상과 overflow를 각각 망가뜨린 16개 유효 의미 변이를 독립 복사본에 주입했습니다. 변이·모드마다 local/global cache를 분리하고 120초 watchdog을 적용해 Debug·ReleaseSafe·ReleaseFast 총 48/48회를 모두 검출했습니다. 결과표뿐 아니라 48개 로그에서 test failure 표식이 있고 컴파일 오류·시간 초과가 없음을 재분류했습니다. 생존·컴파일 실패·무변경 치환·시간 초과는 없으며 유효 로그는 `/tmp/hwpjs-emfplus-draw-path-mutants.LsF2Mf`입니다.

첫 캠페인은 PenId 범위 검사만 제거하면서 뒤의 `@intCast(u32, u6)` 전제도 깨뜨려 ReleaseFast가 테스트 실패 대신 장기 실행했습니다. 이는 한 의미만 바꾸는 유효 변이가 아니며 하네스에도 시간 제한이 없었으므로 폐기했습니다. 두 번째 캠페인은 타입 조건을 `if (false)`로 바꿔 지역 변수가 미사용이 되면서 6회를 컴파일 오류인데도 KILLED로 잘못 분류해 폐기했습니다. 범위 변이는 `@truncate`를 함께 사용하고, 타입 변이는 조회값을 소비하면서 검사만 제거하며, 컴파일 오류 탐지와 watchdog을 적용한 뒤 위 세 번째 캠페인을 처음부터 수행했습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,692/1,692 테스트, HWP 감사 8,905,827 checks, WASM imports 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-draw-path-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
