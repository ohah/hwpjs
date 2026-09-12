# String/Double 값 객체와 공통 사전

## 구현 계약

`chart/value_object.zig`는 inline String/Double v1의 ID·타입·원시 값·VtValue/VtObject 기반 참조를 읽습니다. String은 입력 바이트를 빌리고 Number는 ID·u64 bits·u16 trailer를 복사합니다. Float 산술·NaN 정규화·숫자 문자열 변환을 하지 않습니다. 실제 반례 근거는 [배율 선택 값 조사](hwp5-chart-value-number-evidence.md)에 있습니다.

원시 payload는 기존 cell_value가 소유합니다. payload 뒤 기반 참조 읽기는 value_object.readBody가 소유하며 grid_cells와 inline 값 객체에서 공유합니다. grid_cells는 자신의 버전 검사 순서·null 셀·중복 셀 ID·좌표/개수·합계 제한을 유지합니다. 기존 string_object는 같은 구현의 String 전용 진입점으로 위임하되 반환 String 형태와 클래스/버전 오류 계약을 유지합니다.

object_table은 String/Number/Other를 같은 ID 공간에서 구분합니다. registerNumber는 중복/null ID와 객체 수 한도를 검사하지만 문자열 바이트 예산을 차감하지 않습니다. readValueObservedV1은 알려진 String/Number를 ID 네 바이트만으로 재참조하고, 처음 보는 ID는 inline 정의를 읽습니다. String 길이 제한과 고유 저장량 계산은 기존 공통 경로를 사용합니다. readStringObservedV1은 알려진 Number/Other를 UnsupportedChartObjectReference로 거부하고, inline Double도 String으로 변환하지 않습니다.

읽기 실패 시 외부 Reader와 객체 사전의 논리 내용·문자열 회계는 유지됩니다. 타입 사전은 변할 수 있어 호출자가 폐기해야 합니다. 사전은 메모리만 소유하며 숫자는 복사값, String은 호출자가 유지하는 원본 버퍼를 참조합니다. null 선택 값·전방 참조·일반 객체 그래프·ValueBlock/Axis 조립은 별도 소비자 책임입니다.

## 현재 검증

Debug·ReleaseSafe·ReleaseFast의 `zig test src/root.zig --test-filter 'chart'`(각 최적화 옵션 포함)에서 **51/51 차트 테스트**가 통과했습니다. 새 숫자 테스트는 ±0·±무한대·signaling/quiet NaN payload·최소 subnormal·모든 비트 1, 100회 반복 참조, 문자열 예산 0, 객체 수 상한, 숫자/String/Other 충돌, String 전용 경로의 종류 거부, 모든 잘림·타입/버전 변형을 검사합니다.

정상/후기 오류 경로에 전체 OOM 주입과 safety=true 할당자의 해제 회계 검사를 수행했습니다. 타입 사전은 정상 할당하고 마지막 객체 사전 삽입만 실패시키는 별도 테스트에서 Reader 위치·빈 객체 사전·문자열 회계가 유지되는지 확인했습니다. 공통 payload 읽기와 inline 값 읽기의 직접 Reader 경계도 검사해 상위 래퍼의 롤백에만 의존하지 않습니다.

## 실제 WASM 대조

테스트 전용 mode 320은 기존 그리드 prelude 뒤 셀 스트림을 공통 값 resolver로 읽고, 각 비-null 객체를 ID 네 바이트만으로 즉시 다시 읽습니다. 두 결과의 원시 값·끝 위치·정의 여부와 타입/객체 수·고유 문자열 저장량을 대조합니다. null 셀은 객체로 등록하지 않습니다. 이 테스트용 셀 순회가 제품 grid_cells의 중복 셀 정책이나 공개 ABI를 대체하는 것은 아닙니다.

`chart-value-objects-oracle.mjs`가 기존 독립 그리드 관측값으로 기대 응답을 조립하고 `chart-value-objects.mjs`가 corpus·변형 검증을 담당합니다. 제품 serializer로 기대 응답을 생성하지 않습니다. 실제 43개 차트에서 **String 272개, Double 427개**와 각각의 재참조를 Debug·ReleaseSafe·ReleaseFast WASM에서 대조했습니다. 각 모드 **정상/변형 137건, 거부 23,272건**이 통과했습니다.

전체 셀 구간 잘림, 개별/누적 문자열 및 객체/입력 제한, 마지막 기반 타입 오류, 원시 값 FF 변형, 정확한 끝 잘림을 검사했습니다. 별도 숫자 전용 입력 8개에는 문자열 예산 0으로 ±0·±무한대·NaN payload·최소 subnormal·모든 비트 1을 넣고 원본/재참조 비트를 대조했습니다. 거부 후에는 원본 응답도 다시 확인합니다.

세 모드에서 응답 첫 바이트 변조와 예상 파서 오류를 동일 메시지의 WebAssembly.RuntimeError로 치환하는 변형 모두 테스트 실패로 검출했습니다. trap은 정상 거부 통계에 넣지 않습니다. 새 검사는 정규 audit에도 연결했습니다.

## 고의 코드 오류 검출

`/tmp/hwpjs-value-object-mutants.XnJiIr`에서 숫자 비트 삭제, 숫자를 문자열 저장량으로 잘못 계산, 사전 조회 생략, String 전용 참조의 오류 종류 변경, 숫자 등록의 중복/상한 검사 생략, 사전 삽입 전 Reader 반영, 마지막 기반 타입 소비 생략, 사전 해제 제거의 **8종**을 확인했습니다. 각 모드에서 실제 런타임 FAIL과 종료 코드 1로 검출했습니다(**24회**). 컴파일 오류를 검출로 세지 않았습니다. 해제 제거는 ReleaseFast에서도 MemoryLeakDetected로 실패했습니다.

정규 Debug·ReleaseSafe·ReleaseFast audit는 각 종료 코드 0, **27/27 steps, 1,040/1,040 native tests, 8,148,588 HWP/WASM checks**로 통과했습니다. 로그: `/tmp/hwpjs-value-objects-{Debug,ReleaseSafe,ReleaseFast}-audit.log`.

최종 `zig build test --summary all`도 1,040/1,040 테스트, 5/5 steps로 통과했고, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 steps로 통과했습니다. 변경 Zig 포맷·JS 문법 및 `git diff --check`도 확인했습니다.

관련 테스트 통과를 전체 구현 완료로 해석하지 않습니다. 다음 범위는 ValueBlock/TextFormat 및 Axis 조립이며, 전체 차트·HWP/HWPX 편집·저장 완료를 의미하지 않습니다.
