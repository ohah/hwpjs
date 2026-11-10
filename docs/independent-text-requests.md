# 독립 텍스트 편집의 요청 모델

이 문서는 HWP5/HWPX 어댑터가 공유하는 내부 모델·참조 문법·JSON 요청 해석의 계약이다. 공개 편집 API나 전체 바꾸기 UI의 완료를 뜻하지 않는다. 실제 원문·권한·지원 owner·저장·이력 처리는 포맷 어댑터가 소유한다.

## 좌표와 기대값

`model/independent_text_edits.zig`의 `Edit`는 하나의 변경 전 문단에 대한 UTF-16 `start`/`end`, UTF-8 삽입 문자와 선택적 원문 기대값이다. 순서가 뒤집히거나 겹치는 범위, 같은 위치의 중복 zero-width 삽입과 잘못된 UTF-8을 거부한다. 삽입·기대값의 UTF-16 길이를 검사하고 전체 삭제량을 뺀 뒤 전체 삽입량을 더해 출력 예산을 계산한다. 중간 prefix 길이로 정상 요청을 거부하지 않는다.

구조 검사만으로 source scalar 경계·제어 부호·실제 기대값·쓰기 권한을 승인하지 않는다. wire의 `expectedOriginal`은 필수이며 현재 Native 원문과의 일치는 어댑터가 별도로 검사한다. 개행은 제거하거나 공백으로 바꾸지 않는다. 수용 여부는 포맷 어댑터 정책이다.

## 참조와 admission

`text_transaction_binding.zig`는 기존 `formatting_binding.State`의 세션 수명과 현재 History revision을 재사용한다. 별도 epoch·History를 발급하지 않는다. 문법상 유효한 좌표도 실제 대상의 존재나 권한을 뜻하지 않는다. 예약된 최대 revision·오래된 binding·중복 owner·alias 충돌을 거부하고 실제 source/기대값 검사는 resolver에 위임한다.

`text_transaction_admission.zig`는 요청 전체의 형태·크기·기대값·중복과 owner를 먼저 확인한다. `complete-current-paragraph-snapshot`의 coverage는 resolver가 Native inventory와 비교해야 한다. `totalParagraphs`와 구역별 수에는 pending 생성 셀 문단을 포함하며 `createdCellParagraphs`는 그 총수의 부분집합이다. 두 번 더하지 않는다. coverage 숫자와 참조 문자열을 실행 권한으로 해석하지 않는다.

## 해석·예산·수명

`wasm/text_transaction_request.zig`와 `text_transaction_query_request.zig`는 version 1 요청만 읽는다. 모르는 키·중복 키·중복 selector·잘못된 자료형과 초과 예산을 거부한다. JSON DOM 생성 전에 lexical 크기·깊이·구조 예산을 확인한다. 삽입 문자·기대값·참조는 요청 arena가 소유하고 `deinit`까지 유효하다. Native 호출 뒤에 이를 저장 모델이나 장기 캐시로 보관하지 않는다.

한도의 단일 출처는 `model/text_transaction.zig`다. 기본 요청은 16MiB, 깊이 16, 구조 262144, group/edit/section 각각 4096, snapshot 문단 20000, text code unit은 4×1024×1024개, 삽입 byte는 4MiB로 제한한다. 공통 character 삽입 intent 해석은 기존 sparse formatting decoder를 재사용하며 paragraph/reset intent와 분리한다. 해석 가능한 intent도 특정 어댑터의 쓰기 지원을 보장하지 않는다.

## 확인한 범위

자체 생성 데이터만 사용하는 `src/independent_text_transaction_probe.zig`로 ReleaseSafe·Debug에서 각각 19개 검사를 확인했다. 범위·Unicode·소유 request·잘못된 스키마·binding·coverage와 admission의 거부 경계를 포함한다. 실제 HWP 문서·포맷 어댑터 변경·WASM 공개 endpoint·UI·배포는 이 모델 검사의 완료 범위가 아니다.
