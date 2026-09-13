# HWP5 차트 Grid 문자열 셀 편집

## 범위와 SSOT

`grid_string_target.resolve`는 null을 포함한 `row * columns + column` 위치에서 기존 `VtString` 셀의 object ID, 원문 bytes, trailer와 전체 inline 정의 span을 반환한다. 행·열·값 종류 선택만 이 모듈이 소유하며 공유 객체 격리·새 ID 예약·직렬화는 기존 `contents_inline_fork`와 batch compositor가 담당한다.

고정 실제 Contents의 5×4 Grid에는 String 7개가 있으며 0-based 좌표는 헤더 `(0,1..3)`과 첫 열 `(1..4,0)`이다. 모든 대상은 inline 정의다. object ID에서 좌표를 역산하거나 null 셀을 제거하지 않는다.

## 파일 편집과 검증

`chart_edit_session.grid_cell_string`과 `replaceGridCellString`은 좌표 resolver를 원자적 HWP 편집에 연결한다. 행·열 범위 밖과 Number 셀을 각각 거부한다. 전체 7개를 wire 역순 명령으로 서로 같은 새 문자열에 격리하고, 기존 문자열·형식 60개·축 Number 2개·Grid Number 12개와 합친 81개 batch를 바깥 HWP부터 다시 열어 모든 셀을 확인한다.

null/Number 셀의 String materialization, 행·열 추가, 문자열 인코딩 의미, 계열 캐시·OOXML 동기화와 렌더링 동일성은 이 범위가 아니다.

## 적대적 검증

행·열 전치, 행 범위를 columns로 검사, 열 범위를 rows로 검사, inline 정의를 alias로 오표기, 정의 시작 위치를 1바이트 이동하는 다섯 결함을 각각 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회 모두 컴파일 성공 후 좌표·종류·span 또는 실제 HWP 재파싱 assertion에서 검출됐다.
