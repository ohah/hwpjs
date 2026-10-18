# 일반 본문 prefix의 독립 검증 경계

## 권한 조회와 실제 편집

[추적 Worker 검사](hwpx-worker-fixture-roundtrip.md)의1,278개 plain 집계는 일반 본문 전부를 실제로 편집한 수가 아닙니다. 실제 전수 쓰기는 별도 감사로 수행하며, 성공한 권한 조회만으로 저장·이력·다른 XML 보존을 증명하지 않습니다.

제목 책갈피 후보2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c의 첫 별도 검사에서142개 prefix의 독립 XML/이력과 계산 입력48개의 InvalidFormulaNumber·원문/redo 보존을 확인한 뒤 example.hwpx 문단1에서 oracle mismatch로 중단했습니다(`plain-edit-probe.jsonl/.stderr`, `/tmp/hwpjs-title-group-native.6U4qUw`). 끝 summary가 없으므로1,278개 완료가 아닙니다.

## 앞선 빈 run의 소유권

example.hwpx 첫 문단에는 구역/단 설정 run 다음에 빈 charPrIDRef4 run, 그다음에 charPrIDRef1의 `삼강오륜` 텍스트가 있습니다. 독립 원본 XML 대조 결과 실제 prefix는 앞의 빈 run에 새 hp:t로 들어가며 기존 텍스트와 스타일은 그대로입니다. 이 기대 트리와 저장 XML 전체가 같음을 별도 진단으로 확인했습니다. 파서/제품 writer의 손실로 분류하지 않습니다.

`hwpx-anchor-prefix-oracle.py`의 plain_text 모드는 원본 run 순서에서 최초 텍스트 소유자를 선택합니다. 기존 hp:t보다 앞의 빈 run도 후보이며 그 스타일을 보존합니다. 앞선 텍스트 뒤의 빈 run으로 입력을 옮기지 않습니다. direct_text 모드는 이전처럼 첫 직접 hp:t만 선택하므로 필드/특수 경로의 기대를 함께 변경하지 않습니다. ZIP 목록/CRC/comment·비대상 payload·XML 전체 비교는 유지합니다.

`plain-prefix-oracle-self-test.py`는 일반/-O 각각6양성·15음성을 검사합니다. 앞쪽 빈 run, 구역 설정 뒤의 빈 run, 단독 빈 run, 텍스트 뒤의 빈 run, 연속 빈 run, direct_text의 기존 의미를 구분합니다. 잘못된 소유 run/스타일/기존 본문/기대 문자열/비대상 payload는 거부합니다. 수정 전 복사본의 `plain-oracle-baseline.log`는 첫 양성에서 complete XML mismatch·exit1이었고, 수정 후 두 모드 모두 통과했습니다.

`tests/hwpx/plain-prefix-empty-run.test.mjs`는 이 자체 검사와 실제 example 원본 입력·독립 전체 XML/잘못된 예상값·undo/redo·재열기/재저장을 실행합니다. `plain-prefix-regressions.log`는2/2·fail/skip/cancel0·exit0입니다. 제품 코드를 바꾸거나 불일치 XML을 허용한 변경이 아닙니다.

## 긴 감사의 입력 전송

보강된 기대값으로 재실행한 `plain-edit-probe-fixed-oracle.jsonl/.stderr`는 example 경계를 통과했지만 page.hwpx 문단9에서 oracle 입력 임시파일 쓰기의 ENOSPC로 종료됐습니다. 제품/독립 XML 불일치로 분류하지 않으며 이 실행도 전수 성공이 아닙니다.

기존 동기 oracle-process.mjs는 동기 pipe EOF 문제를 피하기 위한 regular-file 계약을 유지합니다. 새로운 `oracle-process-async.mjs`는 awaited 검사에서 Node execFile의 비동기 stdin.end와 종료 callback을 사용합니다. 임시 입력 파일을 만들지 않고 결과가 nonzero/timeout/EPIPE/output-budget이면 실패를 반환합니다. 입력/stdio의 소유권은 실행 전에 검사하고 stdout/stderr/상태를 보존합니다.

`tests/hwpx/oracle-process-async.test.mjs`의8/8·fail/skip/cancel0·exit0은 큰 Unicode 입력의 바이트 길이/SHA256/EOF, 없는 TMPDIR, 빈 입력, nonzero, 잘못된 입력/stdio, timeout, EPIPE, spawn 실패, 출력 예산을 검사합니다(`async-oracle-tests-final.log`). 종료 뒤 소유 자식 PID가 없다는 대조도 포함합니다. 이8개를 문단 편집 지원 수에 합산하지 않습니다.

같은 동결 소스의 `plain-edit-async.jsonl/.stderr`는46파일/암호1/전체1,444문단/일반 권한1,278·실제 prefix1,230·숫자 입력 거부48의 끝 summary와 exit0·stderr0을 확인했습니다. 실제 편집과 거부 좌표가 각각 중복 없이1,230/48개이며 서로 겹치지 않음을 재계수했습니다. 일반 숫자 입력48곳의 문자 prefix 거부를 쓰기 성공이나 읽기 전용 문단으로 세지 않습니다. 후속 [숫자 입력 전수 검사](hwpx-chart-numeric-input-corpus.md)는 그48좌표와 독립 숫자 witness가 같음을 확인하고 유효 숫자 변경·캐시 산술·이력·재열기까지 검사했습니다. 따라서 같은1,278개 plain 대상의 실제 쓰기는 일반 텍스트1,230과 유효 숫자48로 구분합니다.

원본/WASM/oracle/감사 소스 해시를 기록하며 종료 후 그대로인지 검사합니다. oracle SHA256은f947fab274ec6a83822c0dc37c9ca03cb29d5470401ba87b5f7f968c895fa7c0, 감사 소스는dab46a704d3c58487fc3d3735fe4e276c82deeafb46587ae0940a1e1e5bc9387입니다. 게시 `tools/hwpx-plain-fixture-audit.mjs`의 바이트도 이 소스 해시와 같습니다. 실제1,230개는 Python 일반/-O의 전체 XML·비대상 ZIP payload 비교와 각 입력의 원문 undo→저장 redo→원문 undo를 모두 통과했습니다.48거부는 예외/원문/revision·이전의 대기 redo 보존을 검사했습니다. 새 문서를 reopen한 검사는 이 감사에 포함되지 않습니다.

재현은 명시 후보로 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/hwpx-plain-fixture-audit.mjs`입니다. 추적 fixture 집계가 바뀌면 고정 수치에서 실패하며 부분 범위 인자를 받아 전수인 것처럼 보고하지 않습니다. CLI guard2/2·fail/skip/cancel0·exit0을 확인했습니다. 입력 전송8개와 빈 run2개를 함께 재실행한10/10·exit0은 `plain-oracle-combined.log`이며, 최초 후보 환경변수를 빠뜨린 실행의9통과/1거부·exit1은 제품 실패나 통과로 세지 않았습니다.

현재 작업 트리의 추적46개 fixture 바이트와 동결 입력이 모두 같음도 별도로 확인했습니다. 기본 WASM·브라우저·원본 조판 동치·전체 native gate와는 별도입니다. 끝난 전용 Zig 캐시만 열린 파일·컴파일러 부재 확인 후 정리했고 원본/소스/산출물/로그는 보존했습니다. 이 캐시는 재빌드로 재생성할 수 있습니다.

같은 후보의 관련7파일 재검사는20/20·fail/skip/cancel0·exit0입니다(`plain-oracle-regression-group.log`,160,726.31ms). 새8입력 전송/2빈 run과 기존 저장 메뉴·미닫힘 필드 바깥의 API/Worker·대각선 원본·메모 라벨 검사를 포함합니다. 이20개는 개별8/2 결과와 중복 집계하지 않습니다.
