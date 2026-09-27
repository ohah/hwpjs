# HWP5 차트 Double 선택 값 편집

## 범위와 SSOT

observed V6 고정 Contents의 69개 ValueBlock 중 Double 선택 값은 primary axis 1과 2의 두 곳이다. 둘 다 inline 정의이고 각 object ID의 wire 참조 수는 1이다. `value_object.Number`는 부동소수점 변환 없이 u64 bits와 u16 trailer, 원본 10바이트 payload의 시작·끝을 보존한다. grid에서 먼저 읽히는 Number도 `grid_cells.Cell`이 같은 payload span을 넘겨 초기 ObjectTable 등록과 일반 값 파서가 한 계약을 사용한다.

`contents_number_edit.replacement`는 ObjectTable의 등록 값·payload span·원본 bits/trailer를 모두 다시 대조하고 정확히 10바이트 replacement만 만든다. 객체 ID와 Contents 길이는 바꾸지 않는다. 이 함수는 객체 전역 편집이므로 파일의 의미 target adapter는 `requireUniqueReference`로 참조 수가 정확히 1인지 먼저 확인한다. 공유 값을 조용히 함께 변경하거나 숫자를 String으로 재해석하지 않는다.

## 파일 편집과 검증

`chart_edit_session.replacePrimaryAxisScaleNumber`와 batch variant는 axis·scale·선택 값·Number 종류를 순서대로 확인한다. 실제 두 축을 wire 역순 명령으로 편집하고 signed zero 및 NaN payload 비트, 서로 다른 trailer, 기존 object ID와 고정 Contents 길이를 바깥 HWP부터 다시 열어 확인한다. 기존 문자열·TextFormat 60개와 두 Number를 합친 축 숫자 범위는 62개 batch로 검증했으며, 이후 [Grid 숫자 셀](hwp5-chart-grid-number-edit.md) 12개를 연결한 누적 완전 batch는 74개다.

직접 검증은 String 전달, 중복 payload patch, 손상된 원본 bits, 공유 참조를 거부한다. 새 payload 생성은 allocation-failure 전수 검사에도 포함한다. 이 계약은 raw bits 보존과 target-local 저장 범위이며 축척 계산·표시 형식·NaN 의미·차트 렌더링 동일성을 주장하지 않는다.

적대적 검증은 저장된 payload span을 1바이트 이동, bits 최하위 비트 반전, trailer 최하위 비트 반전, axis 1/2 오배선, 공유 참조 허용의 다섯 결함을 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회가 모두 컴파일 뒤 span·실제 파일 끝단·공유 계약 검사에서 실패했다.

## 현재 재검증

현재 `contents_number_edit.zig`는 등록된 Number의 ID·bits·trailer·10바이트 원본 span을 검증한 뒤 고정 길이 replacement를 만들고, `chart_edit_session.zig`의 축 adapter가 target-local 편집 전에 유일 참조를 확인합니다. 해시 고정 실제 Contents를 검증용 바깥 HWP 컨테이너에 넣는 `chart-ownership-audit`는 Debug·ReleaseSafe·ReleaseFast 각각 10/10 단계·31/31 테스트로 통과했습니다. 현재 같은 테스트에는 String·Format·Grid 편집까지 합친 82개 명령의 단일 저장·재파싱도 포함됩니다. 위 62/74개 batch는 당시 범위의 기록이며 임의 실제 HWP 원본 파일 전체의 편집 호환성을 뜻하지 않습니다. 과거 5종 결함 주입은 이번에 재실행하지 않았습니다.
