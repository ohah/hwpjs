# 기본 WASM 픽스쳐 편집 재검증

## 게시 HWPX 감사의 환경/오래된 기대값 분리

후속 HWPX 숫자/수식 게시 의존성 검증은727c38df(게시 caf15480 소스 산출물)에서4파일5/5·skip0·exit0(53128ms)입니다.48숫자 입력·13수식 정의 전수·PRODUCT/반복 참조·실제 Worker·정확 표시 문자열을 함께 검사했습니다. 숫자 입력은 저장/재열기/이력/비숫자 거부 후 redo까지 확인합니다. 이 실행의 테스트/독립 정의 oracle/일관된 잘못된 cache·label 변조기는 로컬에만 있던5파일을 의존성 단위로 게시합니다. Python 일반/최적화 검사의 실패는 정확한 변조 원인과 종료코드로 확인하며 timeout/인프라 실패를 통과로 바꾸지 않습니다. 정규 gate의 전체 종료 결과나 모든 명령/함수 지원으로 확대하지 않습니다.

caf15480 archive 추출본의 정규 hwpx-text-audit 첫 실행은 `.git` 없는 환경에서 git ls-files를 호출하는 inventory 검사들이 실패했습니다. 임시 추출본에 원래 tree의 추적 파일을 인덱싱했습니다(6228파일 내용 hash 일치, archive에 실제 내용이 없는 legacy/hwpers gitlink1개 제외). 원본 저장소/파일은 수정하지 않았습니다. 재실행은 전체 추적 비암호 열기/no-op ZIP을 통과했지만 Worker 검사의 과거 UnsupportedHwpxFormatting 기대가 현재 InvalidTextPosition과 달라 실패를 확인했습니다. 정규 실행은 다른 검사들을 계속 실행 중입니다.

Worker 기대값과 필드 밖 입력 허용 검사를 현재 계약으로 갱신하고, 테스트의 산출물 선택도 HWPJS_TEST_WASM을 따르게 했습니다. 게시 소스의727c38df 산출물로 최신 Canvas preview 파일5/5·skip0·exit0(21315ms)을 확인했습니다. 필드 밖 실제 삽입 위치/텍스트와 undo 저장 바이트 복원을 검사하며 오류를 광범위하게 허용하지 않습니다. 이는 테스트 기대 갱신이지 제품 서식/필드 기능을 새로 구현한 것이 아니며 정규 전체 HWPX gate 통과로 보고하지 않습니다.

## 2026-10-11 구조 편집 수식 수정 후 기본 산출물

기본 WASM SHA256 `b8e5409af336c039c78b19e94b93eba880a2bd19996813feb321105e3b550899`에서 `node tools/hwp5-edit-corpus-audit.mjs --history`가 exit0으로 종료됐습니다. 로그는 `/tmp/hwpjs-structural-formula-hwp5-edit-20261011.json`입니다. Git 추적101입력의 분류는 HWP5 전체 문단 prefix 통과53·부분1·암호 일반 읽기 거부1, HWPX 별도 편집 감사 대상45·암호 일반 읽기 거부1입니다. HWP5 2090시도 중2042편집/저장 재열기/이력 성공, 비숫자 입력의 InvalidFormulaNumber 거부48입니다. 전수 prefix 검사이며 모든 명령/숫자 대체/브라우저/조판 완료 검사가 아닙니다. 같은 기본 산출물의 HWPX 감사는 별도 실행 중이며 이전 실행의 집계를 최신 결과로 소급하지 않습니다.

최신 b8e5409a 기본 산출물의 HWPX 전용 입력 감사도 exit0입니다. `/tmp/hwpjs-structural-formula-hwpx-specialized-20261011.jsonl`에서46파일·암호1·165시도 중152편집/저장 재열기/이력·독립 XML/ZIP152대조(필드6), 계산 결과 직접 입력 거부13을 확인했습니다. `formula-definition-corpus.test.mjs`와 `formula-worker.test.mjs`도3/3·skip0·exit0이며 실제 chart13/13수식 정의 변경의 독립 산술·전체 XML/ZIP·이력 및 Worker 갱신을 검사합니다. 이는48숫자 셀의 모든 위치 입력이나 모든 함수/브라우저 지원 완료가 아닙니다. 일반 HWPX 전수 감사는 별도 실행 중입니다.

일반 HWPX 전수 감사도 같은 기본 WASM에서 exit0으로 종료됐습니다. `/tmp/hwpjs-structural-formula-hwpx-edit-20261011.jsonl`의 최종 집계는46파일·암호1·1444문단·1231입력/저장/이력 복원, 거부 UnsupportedParagraphControl146·InvalidFormulaNumber48·ProtectedFieldRange19, 거부 이후 redo 보존189회입니다. 위의 실행 중 표현은 먼저 완료한 HWP5/전용 입력 검사 당시 상태이며 이제 종료 결과로 대체합니다. 전용 경로152개는 일반 경로 밖의 성공이며 두 경로를 합쳐1383문단의 비숫자 입력을 확인했습니다. 남은48숫자 입력과13계산 결과 보호를 모든 편집 명령의 미지원으로 해석하지 않습니다.

숫자 입력 전수2파일도 기본 b8e5409a에서2/2·skip0·exit0(33945ms)입니다. `numeric-input-corpus.test.mjs`는 독립 인벤토리의48숫자 셀을 각각0으로 변경해 저장/재열기/undo/redo·비숫자 거부 후 redo와13수식 산술을 일반/최적화 Python으로 검사합니다. `numeric-exact-corpus.test.mjs`는 같은48변경의13수식 결과를 허용 오차 없는 정확한 표시 문자열로 추가 대조하고, 수치 tolerance 검사에 통과하는 근접 변조를 정확 비교가 거부하는 부정 대조를 포함합니다. 단일 실제 chart의 전체 숫자 셀0치환이지 임의 수치·모든 위치/함수·브라우저 전수는 아닙니다.

HWP5 최신 기본 경로의 numeric/control/Worker3파일23/23·skip0·exit0(12214ms)도 확인했습니다.48숫자 셀 각각0/-1/1234.5 변경 및500/1000000 기반 누적 변경에서13수식 command/표시 문자열을 독립 레코드 산술로 대조하고 저장/재열기/비대상 stream/undo/redo를 확인합니다.169개 비의존 셀 구조 위치와 계산 결과/의존 셀 구조 보호, 생성 문단·다문단·하이퍼링크·탭·앵커 회귀를 포함합니다. 테스트 선택 편향을 줄이기 위해 `chartNumericTargets`가 독립 레코드의 표/셀/수식 참조 범위에서 숫자 셀 목록을 만들고, 제품 InvalidFormulaNumber로 수집한48목록과 정확히 대조하도록 추가했습니다. 보강한 numeric 파일3/3·skip0·exit0입니다. arbitrary 수치/모든 위치·브라우저 전체 지원은 별도입니다.

## 이전 산출물 기록

2026-10-10 `node tools/hwp5-edit-corpus-audit.mjs --history`는 기본 WASM SHA256 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`으로 Git 추적101입력을 검사했고 exit0입니다. 로그는 `/tmp/hwpjs-promoted-hwp5-edit-20261010.json`입니다.

HWP5는53파일의 모든 문단 prefix 입력·저장 텍스트/비대상 stream·재열기·이력이 검증됐습니다. chart.hwp1파일은 숫자 셀48문단에 비숫자 prefix를 공급한 `InvalidFormulaNumber` 거부로 부분 지원 상태입니다. 전체2090시도 중2042편집/이력 성공이고 거부48입니다. 이 거부를 파서 오류나 모든 숫자 입력 미지원으로 해석하지 않습니다. 숫자 값/정확 수식 결과는 별도 집중 검사의 범위입니다.

비암호 HWPX45파일은 이 도구에서 텍스트 읽기만 검사하며 편집은 별도 조사 상태로 기록합니다. 암호 HWP5/HWPX각1파일은 일반 reader에서 명시적으로 거부됐습니다. 암호 API의 실제 복호화·편집 검사는 [현재 데모 산출물](current-preview-artifact.md)의 별도 근거를 따릅니다. 중복 경로 사본은 독립 기능 수로 합산하지 않습니다.

`node tools/hwpx-edit-corpus-audit.mjs --history`는 같은 기본 산출물로 exit0입니다. `/tmp/hwpjs-promoted-hwpx-edit-20261010.jsonl`의 최종 집계는46파일·암호1·1444문단·1231편집/이력 복원입니다. 거부는 UnsupportedParagraphControl146·InvalidFormulaNumber48·ProtectedFieldRange19이며 거부 이후 기존 redo 보존189회를 확인했습니다. 일반/필드 외부 적격성·저장 projection·이력 검사이며 독립 전체 XML와 실제 브라우저는 별도입니다.

`node tools/hwpx-specialized-input-audit.mjs --wasm=/Users/yoonhb/Documents/workspace/hwpjs/zig-out/bin/hwpjs.wasm`도 exit0입니다. 로그 `/tmp/hwpjs-promoted-hwpx-specialized-20261010.jsonl`은46파일·암호1·일반 입력 경로 밖165시도 중152편집/저장 재열기/undo/redo와152독립 XML/ZIP 대조(필드6)를 기록합니다. Python 일반/`-O`로 검사했습니다. 나머지13은 chart 계산 결과의 직접 입력 거부입니다. 두 경로를 합친1383문단의 비숫자 prefix 검증을 전체 명령/조판 완료로 승격하지 않습니다. 남은48숫자 셀은 별도 숫자 값 입력 검사의 범위입니다.

필드 독립 검사기의 self-test도 일반/`-O` 양쪽에서 exit0입니다. UTF16 삽입/치환/삭제·잘못된 위치/길이·원문 무변경·dirty/서식/텍스트/비대상 ZIP 변조 거부를 확인했습니다. 실패/시간 초과를 데이터 불일치로 가장해 성공 처리하지 않습니다.

현재 기본 WASM의 `tests/hwpx/worker-fixtures.test.mjs`가235807ms에1/1·skip0·exit0으로 종료됐습니다. 모든46추적 HWPX를 실제 Worker 모듈로 열어 원본 입력 불변과1444문단의 경로를 검사했습니다. plain1278·anchor146·field7·보호된 계산 결과13·암호1이며, anchor146/field7의 각각 실제 입력·저장·undo/redo 원본 복원을 검사했습니다. plain1278의 모든 편집 명령을 이 테스트에서 수행한 것은 아닙니다. Node self/fetch 경계 대역이며 실제 브라우저/OS IME 완료가 아닙니다. 실행 중 추가한 메뉴 모듈 수정은 이 Worker 검사의 범위 밖입니다.

감사 도구의 파일 선택·CLI와 prefix route 검사는4파일8/8·skip0·exit0입니다. Git의 NUL 경로 목록을 사용하고 demo 경로를 빠뜨리지 않으며, 실제 입력 위치를 다른 편집 가능한 위치로 옮기지 않습니다. 누락·중복 옵션을 실행 전 거부합니다. 구조적 거부와 field label 실패를 숨기지 않습니다.
