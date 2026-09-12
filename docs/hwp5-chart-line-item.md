# CLineItem v1 코어

## 계약과 책임

`src/hwp5/chart/line_item.zig`의 `readObservedV1`은 객체 ID, VtCLineItem v1 타입, raw52, VtObject v1 기반 타입 한 개를 읽습니다. 근거와 일반화 한계는 [경계 조사](hwp5-chart-line-item-evidence.md)가 소유합니다. 타입 이름·버전 검사는 공통 type_checks, 신규 객체와 한도 검사는 object_table, null ID 검사는 object_ids를 재사용합니다.

반환 Item은 object_id·복사된 raw52·소비 end만 포함합니다. 원시 바이트를 API 속성으로 추정하지 않고, 앞선 u16이나 항목 개수·소유 관계를 파서에 넣지 않습니다. 별도 메모리 할당은 하지 않지만 타입·객체 사전은 할당할 수 있습니다. 실패 시 Reader는 유지되며 변경될 수 있는 사전은 호출자가 폐기해야 합니다.

## SSOT와 테스트 조립

mode 325는 기존 nullable 축까지의 사전을 이어 받아 요청한 수만큼 단일 객체를 읽습니다. 앞의 u16은 반환만 하며 0xffff 변형도 보존합니다. 테스트 요청 개수 상한 32는 테스트 bridge의 제한이며 코어의 차트 항목 개수 규칙이 아닙니다.

`chart-nullable-title-prefix.zig`가 앞선 Grid/Legend/Plot/Light/축/Surface 후보 조립과 수명을 소유하도록 기존 mode 324에서 분리했습니다. mode 324·325가 이 경로를 공유하며 Surface 배치를 중복 구현하지 않습니다. 이는 여전히 테스트 전용 조립이고 전체 제품 Surface/Chart 파서가 아닙니다. 제품 JS 공개 API는 변경하지 않습니다.

JS `chart-line-items-oracle.mjs`는 독립 관측기의 타입·객체 사전을 이어 사용해 기대 wire를 만듭니다. 기대값을 제품 출력에서 생성하지 않습니다. mode 325의 항목 수 0/1/2, 전체 사전 수, 원시 prefix·raw52, 객체 ID와 정확한 소비 끝을 비교합니다.

## 네이티브와 적대적 검증

신규 네이티브 테스트는 offset 0/1/17/257, 희소 타입 ID와 새/기존 선언, 객체 ID 0 및 연속 객체, 정확한 객체 한도와 문자열 예산 0, raw 복사 수명, 모든 잘림, 클래스/버전 불일치, null/중복 ID와 한도 초과, 모든 OOM 주입 및 정상/후기 오류의 safety=true 해제 회계를 확인합니다. 세 모드 모두 관련 3/3(root 포함)으로 통과했습니다.

최초 테스트는 공통 타입 오류명을 잘못 예상해 실패했습니다. 실제 공통 계약인 UnsupportedChartClass와 UnsupportedChartTypeVersion을 구별하도록 기대값을 고친 뒤 재실행했습니다. 파서를 느슨하게 바꾸지 않았습니다.

`/tmp/hwpjs-line-item-core-mutants.WqRKiw`에서 Reader 조기 변경, raw 삭제, 기반 타입 소비 누락, 객체 등록 누락, 객체 사전 해제 누락의 5종을 각각 Debug/ReleaseSafe/ReleaseFast에서 검사했습니다. 15회 모두 실제 런타임 FAIL·종료 코드 1로 검출했으며 컴파일 실패를 성공으로 세지 않았습니다. ReleaseFast 해제 누락도 MemoryLeakDetected로 검출했습니다.

## 실제 WASM 대조

Debug·ReleaseSafe·ReleaseFast에서 각각 실제 차트 43개/CLineItem 86개, 정상·변형 301건, 오류 6,751건을 통과했습니다. 앞선 raw u16부터 두 항목 끝까지 모든 잘림, 타입명/버전 오류, 기반 클래스 불일치, null/선행 ID 중복, 객체/입력 한도, 정확한 끝과 이후 바이트 무관성, raw52 전체 변조를 검사합니다. 오류 뒤에는 원본을 다시 읽습니다. 정확한 Error 생성자와 기대 오류명을 요구하며 같은 메시지의 WebAssembly.RuntimeError도 실패시킵니다.

기존 nullable 축 대조도 각 43개/정상 301건/오류 12,298건으로 통과했습니다. 출력 바이트 변조와 동일 메시지 trap 주입이 각각 AssertionError로 검출됐습니다.

## 전체 회귀

Debug·ReleaseSafe·ReleaseFast 전체 `zig build audit --summary all`(최적화 모드는 해당 `-Doptimize` 지정)이 각각 종료 코드 0, 27/27 단계, 네이티브 1,052/1,052 테스트, WASM 검사 8,459,398건으로 통과했습니다. 로그는 `/tmp/hwpjs-line-items-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. mode 325는 정규 audit에 포함됩니다. 이전 파트의 audit 성공을 이번 검증으로 대신하지 않았습니다.

최종 `zig build test --summary all`도 1,052/1,052, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다. 변경 Zig 포맷·JS 구문·diff 공백 검사도 통과했습니다.

전체 Chart 조립·raw 의미 해석·렌더링·저장은 여전히 미완료입니다.

## 다음 경계 후보

전체 audit 대기 중 읽기 전용 추가 진단에서 두 CLineItem 뒤 +228에 VtSeries 이름이 43개 모두 관측됐습니다. 문자열 검색은 후보 조사에만 사용했으며 제품/독립 파서의 경계 선택에 넣지 않았습니다. 이어 고정 위치와 기존 타입 사전으로 +194 VtObject v1, +198 배열 ID, +202 VtArray v1, +206 첫 u16, +208 VtCollection v1, +212 둘째 u16, +214 VtObject v1, +218 다음 객체 ID를 확인했습니다. 배열의 두 값은 3/3 또는 5/5였습니다.

이는 raw194·기반 타입·배열 헤더를 다음에 검증할 근거이며, 해당 raw의 의미나 소유권·배열 원소 전체를 확정한 결과가 아닙니다. 별도 잘림/변형 조사 전에 제품 배치 규칙으로 사용하지 않습니다.
