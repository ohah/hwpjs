# HWP5 차트 타입 참조 span

## 범위와 SSOT

`chart/type_table.zig`의 `Table.references`가 타입 ID를 읽은 모든 위치의 ID, 최초 선언 여부, 원본 시작·끝 offset을 파싱 순서대로 소유한다. 최초 선언 span은 `u32 ID + u16 이름 길이 + 원시 이름 + u16 버전` 전체이고, 이후 참조 span은 u32 ID 네 바이트다. 타입 정의 이름과 버전의 SSOT는 기존 `definitions`이며 참조 목록에는 이를 복제하지 않는다.

참조 append를 위한 용량을 먼저 확보한 뒤에만 reader와 테이블을 확정한다. 잘림, 제한 초과, 잘못된 이름 또는 메모리 할당 실패 시 reader offset, 정의 수, 이름 바이트 수와 참조 수를 모두 보존한다. 이름 바이트와 참조 저장소는 `Table.deinit`이 함께 해제한다.

이 단계는 참조 위치를 기록할 뿐 타입 선언을 이동하거나 wire를 수정하지 않는다. 최초 Grid 셀 null화는 이 좌표를 사용해 삭제될 선언의 다음 참조를 찾는 별도 편집 단계에서 제공한다.

## 검증

최초 선언과 반복 참조의 정확한 span·순서·introduced 값을 검사한다. 모든 입력 절단, 독립 제한, malformed 선언, 32개 성장과 allocation-failure 전수 검사에서 실패 전 상태가 보존되는지 확인한다. 실제 차트 파서의 전체 회귀는 타입 참조 기록 추가 전후의 파싱 결과가 동일한지도 함께 검증한다.

이전 변이 실험에서는 시작 offset을 ID 뒤로 이동, 최초 선언을 반복 참조로 오분류, 반복 참조를 최초 선언으로 오분류, 반복 참조를 0바이트 span으로 기록, 참조 저장소 해제를 제거하는 다섯 결함을 각각 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 15개 조합 모두 컴파일 후 정확한 span·분류 assertion 또는 누수 검사 실패로 검출됐다. 이 변이 사본은 아래 재검증에서 다시 실행하지 않았다.

2026-09-28 재검증에서는 `Table.readObserved16`의 `start`/`end`가 Reader의 실제 ID 전 위치와 선언 또는 반복 ID 소비 후 위치를 기록하고, 참조 용량 확보 후에만 논리 상태를 확정하는지 소스와 직접 테스트로 확인했다. Debug·ReleaseSafe·ReleaseFast의 `chart type table` 집중 테스트는 각각 root 포함 6/6 통과했고, ReleaseSafe `chart-ownership-audit`는 실제 추출 Contents를 포함해 10/10 단계·31/31 테스트를 통과했다. 현재 corpus의 범위 밖 차트나 모든 편집 후 재열기의 동등성은 이 결과로 주장하지 않는다.
