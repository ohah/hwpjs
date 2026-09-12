# Series v2 접두부 코어

## 계약과 SSOT

`src/hwp5/chart/series_prefix.zig`의 `readObservedV2`는 Series 객체 ID를 공통 사전에 등록하고 VtSeries v2 타입·raw66·공통 배열 헤더를 읽습니다. `object_ids`·`object_table`·`type_checks`·`array_header`를 재사용하며 타입 선언이나 배열 읽기를 복제하지 않습니다. 근거와 표본 분포는 [접두부 조사](hwp5-chart-series-prefix-evidence.md)에 둡니다.

반환 Prefix는 객체 ID·복사된 raw66·배열 Header·소비 end입니다. 두 배열 값은 독립적으로 보존하고 원소나 Series 나머지 본문은 읽지 않습니다. 사전 외의 별도 할당이나 빌린 반환 필드는 없습니다. 실패 시 Reader 위치는 유지되지만 타입·객체 사전은 변경될 수 있으므로 호출자가 폐기해야 합니다.

## 조립과 검증 책임

`series_prefix_test_fixture.zig`는 새/기존 타입 fixture 및 seed, 테스트 파일은 비교와 OOM·해제 회계를 소유합니다. `chart-post-line-prefix.zig`는 앞선 테스트 조립과 수명을 기존 mode 326에서 분리합니다. mode 326·327이 공통 조립을 사용하며, 사전 접근 함수를 통해 중첩 구조 경로를 새 소비자에 복제하지 않습니다. 제품 JS 공개 API나 전체 Chart 조립은 변경하지 않습니다.

mode 327의 기대 wire는 `chart-series-prefix-oracle.mjs`가 독립 JS 관측 결과에서 생성합니다. 실제 43개 첫 Series의 전체 선행 객체 사전을 유지하며 객체 ID·raw·배열 각 값·소비 끝·사전 수를 대조합니다.

## 네이티브·적대적 검증

offset 0/1/17/257, 새/기존 선언과 희소 타입 ID, Series v2/기반 v1, 객체 ID 0, raw 복사 수명, 배열 0/0·1/1·4/4·5/0·65535/65535, 정확한 객체 한도·문자열 예산 0, 모든 잘림, 각 클래스/버전, 두 ID의 null·선행 중복·서로 중복, 한도 및 모든 OOM 주입을 검사했습니다. 정상/후기 오류의 safety=true 해제 회계도 포함하며 세 모드 모두 관련 3/3(root 포함)으로 통과했습니다.

`/tmp/hwpjs-series-prefix-core-mutants.ZqRU7k`에서 Reader 조기 반영, raw 삭제, Series 기대 버전 1로 변경, 둘째 배열 값 덮기, Series 객체 등록 누락, 객체 사전 해제 누락의 6종을 세 모드에서 검사했습니다. 18회 모두 실제 런타임 FAIL·종료 코드 1로 검출했으며 컴파일 오류를 성공으로 세지 않았습니다. ReleaseFast 해제 누락도 MemoryLeakDetected로 검출했습니다.

## 실제 WASM 대조

Debug·ReleaseSafe·ReleaseFast에서 각각 차트 43개, 정상·변형 215건과 오류 4,988건을 통과했습니다. 모든 잘림, 두 ID의 null·선행 중복·서로 중복, 새 타입명/버전 오류, 입력/객체 한도, raw 전체 변조, 불일치 배열 값, 정확한 끝·뒤쪽 바이트 무관성을 검사하고 각 오류 후 원본을 재파싱합니다. 정확한 Error 생성자·오류명을 검사해 trap을 일반 파서 오류로 세지 않습니다.

공통 조립을 사용하는 기존 post-line 대조도 각각 43개/정상 215건/오류 9,718건으로 통과했습니다. 출력 변조와 동일 메시지 WebAssembly.RuntimeError 주입은 각각 AssertionError로 검출됐습니다.

## 전체 회귀

Debug·ReleaseSafe·ReleaseFast 전체 `zig build audit --summary all`(최적화 모드는 해당 `-Doptimize` 지정)이 각각 종료 코드 0, 27/27 단계, 네이티브 1,056/1,056 테스트, WASM 검사 8,489,240건으로 통과했습니다. mode 327은 정규 audit에 포함되며 로그는 `/tmp/hwpjs-series-prefix-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이전 파트의 성공을 이번 결과로 대신하지 않았습니다.

최종 `zig build test --summary all`도 1,056/1,056, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다. 변경 Zig 포맷·JS 구문·diff 공백 검사도 통과했습니다.

실파일 대조는 첫 Series 접두부에 한정하며 원소·나머지 계열·raw 의미·Series 전체 본문·Chart 조립·렌더링·저장은 미완료입니다.

## 다음 분기 후보

전체 회귀 대기 중 0/0 표본 41개에서 접두부의 정확한 끝 +66을 읽기 전용으로 조사했습니다. 모두 신규 String 객체 ID·알려진 VtString v1·길이 접두사·원문·trailer·VtValue v1/VtObject v1 이후 새 VtSeriesLabel v1 헤더 배치가 관측됐습니다. 이는 다음 단계의 경계 후보이며 두 번째 raw66이나 String의 API 의미를 확정하지 않습니다. 별도 잘림/변형 검증이 필요합니다. 1/1·4/4의 두 표본은 VtSeriesPoint v1부터 시작하므로 이 후보로 건너뛰지 않습니다.
