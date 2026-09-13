# HWP5 차트 Grid null String materialization

## 범위와 SSOT

`grid_null_target.resolve`는 null을 포함한 배열 좌표를 사용해 정확한 empty 셀만 선택한다. `grid_string_materialize.replacement`는 원본 4바이트 `0xffffffff` span을 검증하고 새 object ID, 새 `VtString` v1 타입 선언, 문자열 payload, 새 `VtValue` v1 타입 선언과 앞서 알려진 `VtObject` 참조를 직렬화한다.

고정 Contents의 유일한 null은 `(0,0)`이며 이 위치에서는 기존 `VtString`과 `VtValue` 타입이 아직 선언되지 않았다. 뒤쪽 최초 선언을 앞당겨 수정하지 않고 서로 다른 새 타입 ID 두 개를 현 위치에서 선언하므로 기존 타입 wire와 사전을 보존한다. object ID 선택은 공통 object allocator, 여러 materialization의 type ID 충돌 회피는 chart edit session의 단일 type 예약 함수가 소유한다.

## 파일 편집과 검증

`null_grid_cell_string`과 `materializeGridCellString`은 행·열 범위 밖 및 이미 값이 있는 셀을 거부한다. 실제 `(0,0)`을 비기본 문자열과 trailer로 바꾸고 바깥 HWP·압축 BinData·내부 OLE·Contents를 다시 열어 확인한다. 기존 지원 대상 81개와 함께 적용한 82개 batch에서도 새 타입 선언 이후의 기존 7개 String과 12개 Double을 모두 재파싱한다.

직접 검사는 비-null 셀, sentinel object ID, 기존 object ID, 동일·기존 type ID와 손상된 null source를 거부한다. null을 Double로 만드는 기능, 여러 셀을 추가해 행·열을 확장하는 기능, 문자열 인코딩 의미와 계열 캐시·OOXML 동기화는 아직 포함하지 않는다.

## 적대적 검증

행 범위를 columns로 검사, 열 범위를 rows로 검사, object ID 직렬화 변경, `VtValue` 버전을 2로 변경, 원본 null sentinel 검증 제거의 다섯 결함을 각각 주입했다. object ID는 반환 wire 자체를 직접 대조하도록 검사를 보강했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회 모두 컴파일 성공 후 경계·wire·타입 버전·실제 HWP 재파싱 assertion에서 검출됐다.
