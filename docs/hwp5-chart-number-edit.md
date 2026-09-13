# HWP5 차트 Double 선택 값 편집

## 범위와 SSOT

observed V6 고정 Contents의 69개 ValueBlock 중 Double 선택 값은 primary axis 1과 2의 두 곳이다. 둘 다 inline 정의이고 각 object ID의 wire 참조 수는 1이다. `value_object.Number`는 부동소수점 변환 없이 u64 bits와 u16 trailer, 원본 10바이트 payload의 시작·끝을 보존한다. grid에서 먼저 읽히는 Number도 `grid_cells.Cell`이 같은 payload span을 넘겨 초기 ObjectTable 등록과 일반 값 파서가 한 계약을 사용한다.

`contents_number_edit.replacement`는 ObjectTable의 등록 값·payload span·원본 bits/trailer를 모두 다시 대조하고 정확히 10바이트 replacement만 만든다. 객체 ID와 Contents 길이는 바꾸지 않는다. 이 함수는 객체 전역 편집이므로 파일의 의미 target adapter는 `requireUniqueReference`로 참조 수가 정확히 1인지 먼저 확인한다. 공유 값을 조용히 함께 변경하거나 숫자를 String으로 재해석하지 않는다.

## 파일 편집과 검증

`chart_edit_session.replacePrimaryAxisScaleNumber`와 batch variant는 axis·scale·선택 값·Number 종류를 순서대로 확인한다. 실제 두 축을 wire 역순 명령으로 편집하고 signed zero 및 NaN payload 비트, 서로 다른 trailer, 기존 object ID와 고정 Contents 길이를 바깥 HWP부터 다시 열어 확인한다. 기존 문자열·TextFormat 60개와 두 Number를 합친 62개 전체 batch도 모든 의미 위치를 재파싱한다.

직접 검증은 String 전달, 중복 payload patch, 손상된 원본 bits, 공유 참조를 거부한다. 새 payload 생성은 allocation-failure 전수 검사에도 포함한다. 이 계약은 raw bits 보존과 target-local 저장 범위이며 축척 계산·표시 형식·NaN 의미·차트 렌더링 동일성을 주장하지 않는다.

적대적 검증은 저장된 payload span을 1바이트 이동, bits 최하위 비트 반전, trailer 최하위 비트 반전, axis 1/2 오배선, 공유 참조 허용의 다섯 결함을 주입했다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회가 모두 컴파일 뒤 span·실제 파일 끝단·공유 계약 검사에서 실패했다.
