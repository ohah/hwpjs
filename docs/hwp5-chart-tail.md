# List 접두부·Window 타입 구간 코어

## 지원 계약

[독립 조사](hwp5-chart-tail-evidence.md)에서 확인한 선택 배치만 읽습니다. List 요소 수나 Window 전체 객체의 시작을 추정하지 않습니다.

- `chart/collection_header.zig`: Collection v1 타입·원시 u16·Object v1. Array와 List 접두부가 공유하는 필드 순서의 단일 출처입니다.
- `chart/list_header.zig`: inline ID 등록·List v1·Collection 접두부. 요소는 소비하지 않습니다.
- `chart/window_type_body.zig`: 이미 확정된 타입 위치부터 Window v2·Object v1·원시 u16. 앞쪽 ID 후보를 읽거나 등록하지 않습니다.
- `chart/tail.zig`: 요소 없는 선택 배치의 List 접두부·원시 26바이트·Window 타입 구간을 조립합니다.

원시 26바이트는 복사하고 두 word는 0으로 제한하지 않습니다. 원시 필드의 의미나 소유 관계는 미확정입니다. 실패 시 각 진입점의 Reader는 그대로 유지되지만, 변경됐을 수 있는 타입·객체 테이블은 폐기해야 합니다. EOF는 호출자가 검사하며 이 부분 파서는 뒤쪽 바이트를 요구하거나 소비하지 않습니다.

Array의 기존 반환 형태와 오류 순서는 유지합니다. Collection의 word를 요소 개수로 승격하지 않고 기존 `second_word`에 전달합니다.

## 검증과 진행 상태

`tail_tests.zig`는 신규·기존 타입, 객체 ID 0, 타입 ID 0xffffffff, 원시 word 0/1/2/65535, 오프셋 0/1/17/257, 모든 잘림, 하위 진입점별 Reader 보존, 클래스·버전·ID·테이블 제한, 결과 바이트 수명, OOM 주입을 검사합니다. 실패 할당 해제는 ReleaseFast에서도 safety=true 할당자로 검사합니다.

probe mode 333과 `chart-tails.mjs`를 정규 audit에 연결했습니다. 입력은 기존 SeriesCollection·Title 경로를 공유하고, 기대값은 독립 JS 조사기에서 만듭니다. 실제 43개 차트의 Debug·ReleaseSafe·ReleaseFast WASM 대조에서 각각 성공 129건·거부 3,870건이 통과했습니다. 거부마다 원본을 다시 파싱하며 Error 생성자와 기대 오류명을 함께 확인합니다.

기대 오류를 같은 메시지의 RuntimeError·TypeError·RangeError로 바꾼 실행과 정상 출력의 첫 바이트를 훼손한 실행은 모두 AssertionError로 실패했습니다. 호스트 오류를 정상 거부 건수로 합산하지 않습니다.

읽기 위치 복원 누락 4종, List 등록 누락, 두 word 강제 0, Window 버전 검사 누락, raw26 강제 0, Collection 기반 타입 소비 누락의 10종 결함을 별도 복사본에 주입했습니다. 각 결함은 Debug·ReleaseSafe·ReleaseFast에서 모두 컴파일에 성공하고 실제 테스트 실패(종료 코드 1)로 검출됐습니다. 30개 컴파일 로그는 비어 있고 실행 로그 모두 FAIL을 확인했습니다. 로그: `/tmp/hwpjs-tail-core-mutants.FVVLEB`.

Debug·ReleaseSafe·ReleaseFast 전체 audit는 각각 종료 코드 0으로 완료됐습니다. 각 모드에서 27/27 단계, native 1,078/1,078개, WASM 검사 8,872,188회, imports 0입니다. 로그는 `/tmp/hwpjs-tail-{Debug,ReleaseSafe,ReleaseFast}-audit.log`이며 소스·probe를 고정하고 순차 실행했습니다. 이 결과는 선택된 코어와 기존 전체 회귀의 통과이지, 아래 미지원 범위의 완료 증거가 아닙니다.

마지막으로 `zig build test --summary all`의 native 1,078/1,078개와 `zig build -Doptimize=ReleaseSafe --summary all`의 5/5 단계 성공을 다시 확인했습니다.

## 남은 범위

Window 직전 4바이트의 ID 여부, 원시 필드 의미, 임의 List 요소·버전, 전체 객체 그래프·모델·렌더링·편집·저장은 별도입니다. 43개 표본의 끝 위치 일치는 전체 포맷 지원 증거가 아닙니다.

다음 연결 공백도 남아 있습니다. `tests/hwp5/chart-light-prefix.zig`는 Plot ID·v4·초기 배열·raw136을 테스트 전용 코드에서 읽고, `chart-nullable-title-prefix.zig`는 네 축 다음 raw30·SurfaceDesc ID/v1·raw46·초기 배열을 직접 소비합니다. 따라서 tail까지 WASM 검증을 연결한 것만으로 전체 Contents 제품 파서가 조립된 것은 아닙니다. 후속 작업은 이 Plot·Surface 접두부를 독립 코어로 분리하고, 선택된 배열 배치와 미확정 원시 필드를 명시적으로 보존하는 것입니다. 배열 개수·축 개수의 자동 판정은 별도 근거가 필요합니다.
