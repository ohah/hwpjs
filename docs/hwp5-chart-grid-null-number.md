# HWP5 차트 Grid null Double materialization

## 범위와 SSOT

`grid_number_materialize.replacement`는 `grid_null_target`이 선택한 정확한 4바이트 null 셀을 새 inline `VtDouble` 객체로 바꾼다. 새 object ID, 새 `VtDouble` v1 타입 선언, u64 bits와 u16 trailer, 새 `VtValue` v1 타입 선언, 앞서 정의된 `VtObject` 참조를 51바이트로 직렬화한다. 숫자를 host 부동소수점으로 변환하지 않는다.

고정 Contents의 `(0,0)`에서는 `VtDouble`과 `VtValue`도 아직 선언 전이므로 기존 뒤쪽 선언을 이동하지 않고 서로 다른 새 타입 ID 두 개를 사용한다. ID 선택과 batch 충돌 회피는 String 대안과 같은 chart edit session allocator를 공유한다.

## 파일 편집과 검증

`null_grid_cell_number`와 `materializeGridCellNumber`는 행·열 범위 밖과 비-null 셀을 거부한다. 실제 HWP의 `(0,0)`을 NaN payload bits와 비기본 trailer로 바꾸고 바깥 HWP·압축 BinData·내부 OLE·Contents를 다시 열어 값, 타입 수 +2, 객체 수 +1을 확인한다. 51바이트 wire의 object/type ID, 타입명, raw bits, trailer, 버전과 기반 타입도 직접 대조한다.

String과 Double materialization은 같은 null 좌표의 상호배타적 대안이다. 따라서 [82개 누적 batch](hwp5-chart-file-edit.md)에 둘을 동시에 더해 83개라고 계산하지 않는다. 해당 batch는 String 대안을 사용하며 Double 대안은 별도 실제 HWP 왕복으로 검증한다. 행·열 확장, 수식·계열 캐시 및 OOXML 동기화, 숫자 표시·렌더링 의미는 범위 밖이다.

## 적대적 검증

object ID 변경, bits 최하위 비트 반전, trailer 최하위 비트 반전, `VtValue` 버전을 2로 변경, 원본 null sentinel 검증 제거의 다섯 결함을 각각 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회 모두 컴파일 성공 후 직접 wire 또는 실제 HWP 재파싱 assertion에서 검출됐다.
