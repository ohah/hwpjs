# HWPX 계산 결과 조회 후보 최적화

## 문제와 설계

현재 `formula_result_targets`는 문단마다 구역 전체의 현재 계산 결과를 준비합니다. aift.hwpx의 조회 프로파일에서 정밀 조회111회가 로딩·편집 활성화 각각 약92초를 차지했습니다.

`/tmp/hwpjs-formula-paragraphs.p5JzbK`에서 main 3ede84f4를 기준으로 검증한 변경을 본 코드 작업 트리에 반영했습니다. 기본 WASM·외부 데모는 교체하지 않았습니다. 기존 사용자 변경과 출판 소스의 검증은 분리합니다.

- `formula_result_paragraphs.zig`는 기존 `formula_current_snapshot.readFlat`을 한 번 실행하고 준비된 result site의 원본 소속에서 현재 전역 문단 번호를 얻습니다. 연결·현재값 오류를 먼저 검사하며 source/current 문단 이동을 구분합니다.
- 새 optional `hwpx_edit_manual_formula_result_paragraphs`는 정렬·중복 제거된 one-based 번호를 반환합니다. JS decoder는 양의 uint32·정렬·중복을 검사합니다.
- Worker의 filter는 표시 요청 하나에만 존재하며 구역당 한 번 조회합니다. 없는 ABI는 기존 정밀 조회로 돌아갑니다. 수정 뒤에도 남는 계산 결과 캐시를 만들지 않습니다.
- 목록은 조회 후보의 상위집합일 뿐 편집 권한이 아닙니다. 기존 target/display/range 명령과 중첩·제어·UTF-16 검증은 유지합니다. 빈 결과 문자열도 site 소속을 통해 후보에 남습니다.

## 현재 증거

제품 후보 e298cf28c350da7e797a229dceb01705eb7e8595f6d295530da3eb334d91ed4c는 ReleaseSafe 빌드 재시도 exit0입니다. 첫 빌드는 디스크 부족으로 exit1이었고 완료 로그가 없어 통과로 세지 않습니다. 기존8fa 후보의 export334개는 유지하고 optional 함수1개를 추가했습니다. 이름·종류 호환 검사이며 signature/전체 동치 증거가 아닙니다.

native 집중 바이너리 f237e8421e9c47efe6c22e6dc4c967b6d325bd2eb4e40fcfad10b4fb3eeb178c는4/4·fail/skip/log/leak0·exit0입니다(root 등록1개+assertion3개). 현재 override·전체 부분 할당 실패·원문/저장 불변·source/current 이동·깨진 연결의 기존 오류 유지를 확인했습니다(`native-negative-guard.jsonl`). 너무 짧아 footprint 표본이0인 것을 실제 메모리 사용0으로 해석하지 않습니다. 첫 guard 실행은 도구 경로가 없어 native를 실행하지 못했으며 별도 실패로 남겼습니다.

순수 decoder/filter와 실제 chart13개 필드의 공개 API·현재 폭·빈 문자열/공백/emoji·undo/redo·조회 불변 검사는4/4·fail/skip/cancel0·exit0입니다(`formula-candidate-focused.log`). 기존 계산 결과 회귀는33/33·fail/skip/cancel0·exit0입니다(`formula-regressions.log`,58,651ms).

오류를 검사하지 않고 항상 빈 목록을 반환하는 별도 변이 모듈의 음성 대조는 `never conceal broken links` assertion에서 expected InvalidFieldLinks/found empty로 exit1이었습니다(`mutation-empty-list.log`). 정상 모듈이나 제품 WASM은 변이하지 않았습니다. 이 실패는 회귀 검사의 오류 은폐 탐지 증거이며 제품 실패나 전체 변이 캠페인 결과가 아닙니다.

별도 프로파일은1/1·exit0이며 로딩23,679ms·활성화21,817ms, 각 정밀 조회1회·후보 조회1회입니다(`formula-candidate-profile.log`). 이전00c5 측정의113,762ms·111,770ms 및 각 정밀 조회111회와 비교한 예비 관측입니다. 이전 실행과 환경 전체를 통제한 단일 변수 벤치마크나 실제 브라우저 수치로 주장하지 않습니다.

## 전체 응답·읽기 대조와 남은 제한

본 작업 트리 반영 후 공개 API/decoder 집중 검사도4/4·fail/skip/cancel0·exit0입니다(`main-focused.log`,1,349ms). 반영된 전체 작업 트리에서 별도 컴파일한 native 집중 바이너리0ee90251f65ac96364c3ef8efacb4888752da76bf203c52e88b60181c3913b76은6/6·fail/skip/log/leak0·exit0입니다(`main-native-guard.jsonl`; assertion3개+root/XML 등록3개). 출판 소스4개와 합산하지 않습니다. 최종 build 설정에서 별도 parity step을 확인했고 ReleaseSafe 재빌드도 exit0입니다(`product-build-final.log`).

최종 재빌드는 c10f3382b7a8872c0305f4b8e7537ff1359e3f2e1e93875681668f3b782757fd로 파일 hash가 달라졌습니다. 두 모듈을 컴파일해 유효성을 확인하고 custom section 이외9개 section(type/function/table/memory/global/export/element/code/data)의 전체 바이트 hash가 각각 같음을 별도로 확인했습니다. 실행 코드·데이터·export는 동일하며 파일 전체 동치로 주장하지 않습니다. `candidate-e298cf28.wasm`과 `candidate-c10f3382.wasm`을 모두 보존합니다. e298의 읽기975개·Worker 대조 결과를 c10에서 새로 실행한 결과로 바꾸어 기록하지 않습니다.

최종 c10 후보 자체의 decoder/API 집중 검사와 기존 계산 결과 회귀도37/37·fail/skip/cancel0·exit0입니다(`formula-final-c10-focused.log`,59,664ms). 아래 Git 추적 HWPX46개 Worker의 편집·이력·재열기 결과와 범위가 다르며 합산하지 않습니다.

같은 Worker JS와 old/new WASM을 한 프로세스에서 비교하는 `formula-result-worker-parity.test.mjs`는3/3·fail/skip/cancel0·exit0입니다(`formula-worker-parity.log`,297,220ms; 상위1개+후보/기존 하위2개). 전체 load/enable/window 응답·권한·원문 저장을 대조했습니다. 후보57,537ms·기존239,639ms는 이 검사 시나리오의 실행 시간이며 실제 브라우저 성능이나 한글 조판 동치를 뜻하지 않습니다.

읽기975개 대조도 exit0이며977행(start+고유 경로975+summary), 응답 동일944·동일 거부5·HWP3 범위 제외26입니다(`formula-reader-parity.jsonl`,stderr0). 최종 counts·경로 유일성·두 artifact SHA-256을 별도로 재검산했습니다. 동일 거부는 지원 성공이 아니고, 읽기 응답 대조가 편집·저장·브라우저 검증을 대신하지 않습니다.

Canvas 입력·독립 저장 oracle 재검사는1/1·fail/skip/cancel0·exit0입니다(`formula-candidate-memo-canvas-retry.log`,101,934ms). 첫 Canvas 후보 검사는 oracle 임시 입력 쓰기의 ENOSPC로 실패했으며 재시도와 합산하지 않습니다. 이 검사는 실제 Worker/WASM과 모의 DOM/Canvas이며 실제 브라우저 검사가 아닙니다. 기본 배포 승격 전 실제 브라우저·전체 native gate를 별도로 확인해야 합니다.

후속 c10 메모 라벨의 실제 Chromium 왕복과 종료 검증은 [브라우저 실측](hwpx-memo-browser-roundtrip.md)이 소유합니다. 해당 한 곳의 GUI 성공을 모든 fixture·레이아웃·전체 native 완료로 확대하지 않습니다.

## 재현

`HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/formula-result-paragraphs.test.mjs tests/hwpx/formula-result-paragraph-api.test.mjs`는 decoder·요청 수명·실제 API 집중 검사입니다. 정규 HWPX 검증 묶음에도 등록합니다.

`HWPJS_BASELINE_WASM=/absolute/frozen-baseline.wasm zig build hwpx-formula-query-parity -Doptimize=ReleaseSafe --prefix /absolute/isolated-output`은 새 설치 후보와 명시적 baseline을 같은 Worker 소스로 대조합니다. 누락되거나 같은 경로인 baseline은 실패시키며 경로가 달라도 SHA-256이 같으면 `DistinctWasmArtifactsRequired`로 거부합니다. 기본 데모에 설치하지 않도록 별도 prefix를 사용합니다.

서로 다른 실제 경로의 같은 c10 파일로 실행한 CLI 음성 대조는 해당 오류·exit1이었고 Worker 하위 검사 전에 종료했습니다(`formula-same-artifact-negative.log`,93ms). 최종 c10 대8fa 전체 Worker 대조도 추가 guard를 적용한 소스로3/3·fail/skip/cancel0·exit0입니다(`formula-final-c10-worker-parity.log`,297,507ms; 상위1개+하위2개). 후보57,918ms·기존239,526ms이며 앞선 e298 대8fa 실행과 합산하지 않습니다.

최종 c10의 Git 추적 HWPX46경로 Worker 편집·이력·저장·재열기 검사는1/1·fail/skip/cancel0·exit0입니다(`formula-tracked-worker.log`,554,402ms). 1,444문단 중 plain1,278·anchor146·field7·formula13, 암호 기본 거부1입니다. 보호 개체 텍스트146곳·필드7곳·계산 결과13곳을 실제 명령으로 편집하고 각 저장본의 재열기 projection과 재저장 바이트를 확인했습니다. 모든 문단의 편집, 암호 문서 지원, 모든 채널의 독립 XML 검사를 의미하지 않습니다.
