# 추적 HWPX Worker 편집·재열기 검사

## 계약

`tests/hwpx/worker-fixtures.test.mjs`는 Git 추적 HWPX 경로를 단일 inventory에서 가져온다. 파일 이름의 HWP/HWPX 문자열을 기능 판정으로 사용하지 않는다. 원본 load의 plain/anchor/field/계산 결과 권한을 분리하며 native의 수동 결과 API 5개가 없는 기존 WASM에서는 계산 결과 13곳을 보호 대상으로 확인한다. 기능이 없는 경우를 계산 결과 편집 통과로 세지 않는다.

필드·앵커 편집은 기존 Worker 명령을 호출하고 save→undo/save→redo/save→undo/save를 비교한다. 편집본을 새로운 세션으로 다시 열어 모든 문단 텍스트와 객체 종류별 개수를 대조하고 변경 없는 재저장도 byte-exact인지 확인한다. 재열기 projection은 기존 `worker-reopen-projection.mjs`를 재사용한다. 직렬화 뒤 바뀔 수 있는 source node ID를 텍스트 동일성으로 오인하지 않는다.

일반 본문의 실제1,230개 prefix 편집·독립 비교와 숫자 입력48곳의 거부 검증은 [별도 감사](hwpx-plain-prefix-verification.md)를 따른다. 권한 조회1,278개나 이 Worker 선언의 재열기 범위를 그 전수 검사와 혼동하지 않는다.

## 2026-10-18 실측

제목 책갈피 후보2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c의 후속 실행도1/1·fail/skip/cancel0·exit0·stderr0입니다(552,225.59ms, `/tmp/hwpjs-title-group-native.6U4qUw/tracked-worker-title-v4.log/.stderr`). 독립 Git index의 추적46경로와 동결 JS/Worker를 사용했으며 실행 테스트 파일 SHA256은11330eb1f8e1bd28f8e3a72e5fea0940c0551c3c3c8be5b0fde06a3ccdebc527입니다. 현재 작업 트리의46개 fixture 바이트도 모두 같음을 별도로 대조했습니다. 앵커146/필드7/계산 결과13의 편집·이력·재열기/재저장과 기존 고정1,444문단 집계가 통과했습니다. 아래 후보들과 합산하지 않으며 일반 본문1,278개의 실제 전수 편집은 이 선언에 포함하지 않습니다.

- 기존 테스트는 계산 결과 전용 문단의 편집 허용을 빠뜨려 `editable` 일치 검사에서 실패했다. main 전후 Worker/adapter를 같은 WASM으로 비교해 추적 46파일의 문단 정책이 동일함을 먼저 확인했다. 제품의 권한 판정을 완화해서 해결하지 않았다.
- 추적 46경로 중 암호화 1개는 비밀번호 요구를 확인했다. 나머지 문단 합계 1,444개에서 plain 1,278개·anchor 146개·field 7개와 계산 결과 전용 13개를 분리했다. plain 1,278개를 이번 검사에서 전부 편집했다는 뜻은 아니다.
- main 계열 WASM SHA256 `c8c6e8ab17e1e2426e01c1ec70293912c04a86dfcba1aa572df5a420479ff9c5`의 전체 선언 1/1·실패/skip 0(579,116.71ms). 앵커 146곳·필드 7곳을 각각 편집·이력·편집본 재열기/재저장으로 검증했다.
- 같은 실행에서 수동 결과 API가 있는 계산 결과 13곳도 모두 실제 Worker splice로 변경했다. 독립 XML inventory로 소유자를 확인하고 Python 일반/-O의 전체 XML/ZIP oracle 26회 및 내부 5종 변조 반례 합계 130회를 확인했다. 결과 캐시·dirty·비대상 텍스트·비대상 part의 변경을 허용하지 않는다.
- 기존 기본 WASM SHA256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`도 전체 선언 1/1·실패/skip 0(330,959.38ms). 앵커 146곳·필드 7곳의 같은 재열기 검사와 계산 결과 13곳의 보호 분기를 확인했다. 이 artifact에서는 계산 결과 편집을 실행하지 않았다.
- 차트 통합 후보 SHA256 `891fe0a1cb560083251ac50130505dc2dabac57f6ebeaf37f90bc226e76a676a`의 동일 검사도 전체 선언 1/1·실패/skip 0(561,037.70ms)으로 종료했다. 앵커 146곳·필드 7곳 및 계산 결과 13곳의 편집·이력·재열기/재저장과 위 계산 결과 독립 oracle을 모두 실행했다. 후보의 native 전체 검사 완료나 기본 WASM 교체를 뜻하지 않는다.

위 1/1은 한 선언 안의 내부 사례들을 합산한 수치가 아니다. 재열기 projection은 텍스트/객체 수를 검증하며 앵커·필드의 전체 XML 의미 보존이나 실제 브라우저·IME·원본 조판 동일성을 대신하지 않는다. 독립 XML/ZIP 대조는 위 계산 결과 변경에만 해당한다. 전체 RHWP 참조 975경로의 reader 검사는 [구역 수 원본 검증](hwp5-section-count-refusals.md)과 별도다.

## 전체 HWPX 정규 묶음 재검증

`/tmp/hwpjs-published-native.sFSefO/hwpx-physical-baselines-full.log`는191개 테스트 파일을 `node --test --test-concurrency=1 tests/hwpx/*.test.mjs`로 실행하여466/466·fail/cancel/skip0·exit0으로 종료했습니다(2,839,091.52ms). 실제 fixture 디렉터리를 물리 복사한 전용 스냅샷에서 실행해 fixture 응답의 realpath 보호를 유지했습니다. 사용자 스테이징의 추가 테스트 파일은 이191개에 포함하지 않았습니다.

검사 artifact는 이전 게시 후보 SHA256 `59235b1263465c623ec2c9ef338edee9b5b2ca705103f97b324f0a14eefbc7c4`이며 두 baseline 환경변수에는 SHA256 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`를 명시했습니다. 신규 개체 번호 후보360abdbb의 전체 HWPX 통과로 재분류하지 않습니다. 이 실행의 Worker fixture 선언도 앵커146곳·필드7곳의 편집/이력/저장본 재열기·byte-exact 재저장을 통과했습니다(576,282.58ms). 전체 native·브라우저·IME·원본 조판 완료는 별도입니다.

명령은 [개발·검증 명령](development-commands.md)의 Worker fixture 재열기 항목이 소유한다. 원본 fixture를 수정하지 않으며 기존보다 사례 수가 줄면 고정 집계 검사가 실패한다.
