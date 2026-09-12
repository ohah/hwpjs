# 관측 VtArray 헤더

`src/hwp5/chart/array_header.zig`는 inline 객체 ID, VtArray v1 타입, 첫 u16, VtCollection v1 기반 타입, 둘째 u16, VtObject v1 기반 타입까지만 읽습니다. 원소나 그 뒤 객체를 소비하지 않습니다. [Plot·광원 실측](hwp5-chart-plot-evidence.md)이 배치 근거입니다.

Header는 object_id·first_word·second_word·end를 값으로 보존합니다. 두 word가 다르더라도 헤더 자체는 읽을 수 있습니다. 둘을 capacity/count라고 단정하거나 하나를 버리지 않습니다. 선택된 소비자가 `observedEqualCount(max_count)`를 호출한 경우에만 동일성 조건(UnsupportedChartArrayLayout)과 개수 상한(LimitExceeded)을 적용합니다. 이 메서드는 다른 버전 또는 모든 배열의 유효성 규칙이 아닙니다.

객체 등록·중복/null·전체 객체 수는 [객체 목록](hwp5-chart-object-table.md)을, 클래스/버전 읽기는 기존 type_checks를 재사용합니다. 타입 ID 재등장 시 이름/버전을 다시 읽지 않습니다. 실패 시 reader는 유지하지만 두 목록이 갱신됐을 수 있어 호출자가 폐기해야 합니다. 원본 버퍼에 대한 대여나 별도 소유 배열은 없습니다.

현재 소비자는 [Light 파서](hwp5-chart-light.md)와 비공개 Plot 전처리 probe입니다. 헤더의 서로 다른 word·65,535 경계·모든 잘림·원소 reader의 상태 검증은 light_tests.zig가 소유하며 실행 결과는 Light 문서에 기록합니다.
