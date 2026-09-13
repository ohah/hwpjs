# 차트 object ID 선택

## 계약

`chart/object_id_allocator.zig`의 `findLowestAvailable`은 파싱된 `object_table.Table` 범위와 caller가 추가로 금지한 ID를 합쳐 사용 가능한 가장 작은 u32 ID를 결정적으로 반환합니다. ID 유효성에서 `0`은 정상이고 `0xffffffff`만 null sentinel이므로 sentinel은 반환하지 않습니다.

점유 상태의 SSOT는 `object_table.Table.entries`입니다. allocator는 별도 ID 사본이나 전역 counter를 유지하지 않으며 String fork 직렬화도 소유하지 않습니다. 추가 금지 목록은 아직 객체 테이블에 등록되지 않았지만 새 ID와 충돌하면 안 되는 enclosing object ID 등에 사용합니다.

함수는 ID를 예약하지 않습니다. 같은 테이블을 바꾸지 않고 반복 호출하면 같은 ID를 반환합니다. 여러 ID가 필요하면 각 결과를 직렬화·재파싱하거나 테이블에 등록한 뒤 다음 ID를 선택해야 합니다. 이 규칙으로 선택과 예약 사이의 숨은 상태를 만들지 않습니다.

## 검증

네이티브 테스트는 빈 범위의 ID 0, 연속 점유, 중간 구멍, 추가 금지 ID, 중복 금지 값과 sentinel, 반복 호출 비예약 계약, 등록 후 다음 ID 이동을 검사합니다.

SHA-256 고정 9,876바이트 Contents에서는 실제 객체 테이블과 대상 Font object ID를 입력해 새 ID를 선택하고 기존 String fork writer로 전달합니다. 전체 Contents를 재파싱하여 선택된 ID와 새 문자열이 대상 위치에 연결되는지 확인합니다. allocator 자체는 할당하지 않습니다.

시작값을 1로 변경, 증가폭을 2로 변경, 점유 검사 제거, 추가 금지 검사 제거, 반환 ID의 하위 비트 반전의 다섯 소스 변형을 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 15개 조합 모두 컴파일 성공 후 단위 계약의 실제 assertion 실패와 종료 코드 1로 검출했습니다. 컴파일 실패나 trap은 검출로 세지 않았습니다. 격리 로그는 `/tmp/hwpjs-chart-object-id-mutants.xAKKr2`에 남겼습니다.

## 남은 범위

현재 정책은 호출자가 전달한 하나의 완전한 객체 범위 안에서만 유일성을 보장합니다. CFB의 다른 차트 스트림이나 아직 파싱하지 않은 뒤쪽 객체를 전역 검색하지 않습니다. ID 예약형 편집 세션, 여러 patch의 트랜잭션, type ID 할당, CFB 스트림 저장은 별도 범위입니다.
