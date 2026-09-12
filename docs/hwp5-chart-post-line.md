# Post-CLineItem raw·배열 코어

## 계약과 SSOT

`src/hwp5/chart/post_line.zig`의 `readObserved`는 raw194와 VtObject v1 기반 타입을 읽은 뒤 공통 `array_header.readObservedV1`을 호출합니다. 배열 객체 ID·각 타입·두 u16을 다시 구현하지 않습니다. 근거와 일반화 한계는 [경계 조사](hwp5-chart-post-line-evidence.md)를 참조합니다.

반환 Block은 복사된 raw194, 공통 배열 Header, 소비 end를 포함합니다. 두 배열 값은 독립적으로 보존하며 원소는 소비하지 않습니다. 필드 의미·상위 소유권을 추정하지 않습니다. 실패 시 Reader 위치는 유지되며 변경될 수 있는 타입·객체 사전은 호출자가 폐기해야 합니다. 사전 외의 별도 할당이나 빌린 반환 필드는 없습니다.

기존 참조만 다룬 JS 경계 조사와 달리, 코어는 공통 타입 사전의 새 선언과 기존 참조를 모두 지원합니다. 실제 표본은 기존 참조 경로로, 새 선언은 독립 네이티브 fixture로 검증합니다. 미지원 클래스·버전은 공통 오류를 그대로 반환합니다.

## 테스트 조립의 책임

mode 326은 기존 nullable 축·CLineItem 객체 사전을 유지하고 그 뒤에서 코어를 실행합니다. `chart-line-items-prefix.zig`가 nullable 축 다음 raw u16까지의 조립과 수명을 소유하도록 mode 325에서 분리했습니다. 기존 mode 325와 새 mode 326이 이를 공유합니다. 앞의 u16을 항목 개수로 해석하지 않으며, mode 326의 두 CLineItem 반복은 선택된 corpus 연결에만 존재합니다.

`chart-post-line-oracle.mjs`는 독립 JS 관측 결과에서 기대 wire를 생성합니다. raw194·객체 ID·각 u16·소비 끝·사전 수를 제품 출력과 대조합니다. 이 조립은 테스트 전용이며 제품 JS 공개 API나 전체 Chart 조립을 추가하지 않습니다.

## 네이티브·적대적 검증

Fixture 파일은 생성과 사전 seed, 테스트 파일은 검증·소유권 회계를 맡습니다. offset 0/1/17/257, 새/기존 선언, 희소 타입 ID, 객체 ID 0, 0/0·3/3·5/0·65535/65535 값, 정확한 객체 한도 및 문자열 예산 0, raw 복사 수명, 모든 잘림, 각 클래스/버전·null/중복·한도 오류, 모든 OOM 주입과 정상/후기 오류의 safety=true 해제 회계를 확인했습니다. 세 모드에서 관련 3/3(root 포함)으로 통과했습니다.

`/tmp/hwpjs-post-line-core-mutants.LcLF4D`에서 배열 전에 Reader 조기 반영, raw 삭제, 기반 타입 소비 누락, 둘째 배열 값을 첫째 값으로 덮기, 배열 객체 등록 누락, 객체 사전 해제 누락의 6종을 만들었습니다. 각 Debug/ReleaseSafe/ReleaseFast에서 실제 런타임 FAIL·종료 코드 1로 검출했습니다(18회). 컴파일 실패를 검출로 세지 않았고 ReleaseFast 해제 누락도 MemoryLeakDetected로 실패했습니다.

## 실제 WASM 대조

Debug·ReleaseSafe·ReleaseFast에서 각각 실제 차트 43개에 대해 정상·변형 215건과 오류 9,718건을 통과했습니다. 모든 잘림, 전체 선행 ID 중복·null, 입력/객체 한도, 각 타입 참조 위치의 클래스 불일치, raw 전체 변조, 두 배열 값 65535/0, 정확한 소비 끝·뒤쪽 바이트 무관성을 대조합니다. 오류마다 원본을 재파싱하며 정확한 Error 생성자와 오류명을 검사합니다.

공유 prefix의 기존 CLineItem 경로도 각각 43개/객체 86개/정상 301건/오류 6,751건으로 통과했습니다. 출력 변조와 동일 메시지의 WebAssembly.RuntimeError 주입은 각각 AssertionError로 검출했습니다.

## 전체 회귀 결과

Debug·ReleaseSafe·ReleaseFast 전체 `zig build audit --summary all`(최적화 모드는 해당 `-Doptimize` 지정)이 각각 종료 코드 0, 27/27 단계, 네이티브 1,054/1,054 테스트, WASM 검사 8,479,049건으로 통과했습니다. mode 326은 정규 audit에 포함됩니다. 로그는 `/tmp/hwpjs-post-line-{Debug,ReleaseSafe,ReleaseFast}-audit.log`이며 이전 파트의 성공을 이번 결과로 대신하지 않았습니다.

최종 `zig build test --summary all`도 1,054/1,054, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다. 변경 Zig 포맷·JS 구문·diff 공백 검사도 통과했습니다.

Series 원소·배열 소유권·raw 의미·전체 Chart 조립·렌더링·저장은 여전히 미완료입니다.

## 다음 Series 후보

전체 회귀 대기 중 코어 대상 뒤의 정확한 소비 위치에서 읽기 전용 헤더 진단을 수행했습니다. 43개 모두 선행 사전에 없는 객체 ID·새 타입 ID·VtSeries v2 선언이었고 해당 헤더는 21바이트였습니다. 이름 검색으로 시작 위치를 정하지 않았습니다. Series 본문·버전별 필드·배열 원소 전체는 아직 읽지 않았으므로 다음 단계에서 별도 경계 검증이 필요합니다.
