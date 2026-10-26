# 게시 소스 native 전수 감사

## 최신 공개 배포 상태 — HTTPS·대표 브라우저 경로 검증 완료

공개 자산 커밋 `0efc30f2`·manifest `268b5f21…`·WASM `3fc519b2…`의 G2는 workflow `40264419074`의 build/deploy 성공과 실제 Pages HTTPS 28개 자산의 바이트 수·SHA 일치를 확인했습니다. 정확한 식별자와 링크는 [원본 색상 정책](source-color-policy.md)의 상단 기록을 따릅니다.

배포 후 실제 HTTPS 브라우저에서 noori 20회 입력·개별 Native revision·색상, 찾아 바꾸기 후 입력과 undo/redo의 캐럿·포커스, headless API ready를 확인하고 소유 브라우저를 종료했습니다. 이는 동일 G2의 로컬 E2E·Rspress 검사와 별도이며 전체 한/글 동치나 새 전체 Native gate 통과가 아닙니다. 아래 old `5d2fa4…` 기록과 전체/집중 Native 실행의 원래 범위는 보존합니다. V2 history 후보 미포함·기본 16개 이력 제한·새 npm 미출시 경계도 유지합니다.

같은 시점의 고정 제품 WASM으로 실행한975참조 경로 읽기와 거부 원인 분리는 [게시 산출물 참조 읽기](reference-published-source-read.md)가 소유합니다. native 단위 테스트와 corpus 읽기를 하나의 완료 수로 합치지 않습니다.

## 2026-10-11 실행 기반

`2789f63dea5431331562aafa38e00708edc3a7b1`의 Git archive를 별도 `/tmp/hwpjs-main-native-fixed.q5arOO`에 추출했습니다. 로컬 미커밋 소스를 이 디렉터리에 복사하지 않았습니다. 추출이 끝나기 전에 시도한 첫 컴파일은 root.zig FileNotFound로 실패했고, 추출 종료코드0 확인 후 전체 test-no-exec 컴파일을 다시 시작했습니다. 이 초기 실패를 제품 컴파일 오류로 분류하지 않습니다.

빌드 명령은 `zig test src/root.zig -O ReleaseSafe --test-no-exec -femit-bin=/tmp/hwpjs-main-native-fixed-20261011`입니다. Zig0.16.0을 사용하고 기본 제품 WASM을 교체하지 않습니다. 컴파일 종료와 binary hash/metadata/실제 실행 결과를 확인하기 전에는 전수 테스트 수나 통과를 확정하지 않습니다. 이전 SIGKILL과 그 마지막 테스트의 수정은 [필드 병합 실패 감사](field-merge-failure-audit.md)가 소유합니다.

후속 컴파일은 exit0으로 종료됐습니다. binary SHA256 `56febbafcb55909709d94dc6a52a7fdb7f278a4cec83e0d55ef3b0650bfd8a7c`의 실제 metadata는3859테스트이며 batch-size100/seed0x485750 실행을 시작했습니다. 결과는 `/tmp/hwpjs-main-native-fixed-20261011.jsonl`에 기록합니다. `HWPJS_CHARACTER_FAILURE_START=0`/`HWPJS_CHARACTER_FAILURE_END=1`을 명시했으므로 해당 별도 글자 OOM 캠페인은 지점0만 포함하며 모든 글자 할당 실패 지점 검증이 아닙니다. 필드 병합의 앞서 수정한 두 checkAllAllocationFailures는 그대로 전수 실행 대상입니다. 시작 레코드/초기 성공 결과만으로 최종 전수 통과를 주장하지 않습니다. snapshot 이후 게시한 감사 도구 자체와 JS UI는 이 native binary의 코어 소스 변경으로 합산하지 않습니다.

## 검증 도구 게시와 반례

`tools/zig-native-batch-audit.mjs`는 기본 Zig runner의 `--listen=-` 프로토콜로 각 index를 요청합니다. parser는 `tools/zig-test-protocol.mjs`가 소유합니다. 설치된 Zig0.16.0 `compiler/test_runner.zig`, `std/zig/Server.zig`의 metadata·status(u2)/fuzz/log(u30)/leak(u31) 정의와 대조했습니다. binary hash와 metadata 일치, 전체 index 순서/개수, 결과 index, 정상 프로세스 종료를 검사합니다. fail·skip·log·leak 및 중단은 성공이 아닙니다. 이 프로세스 분할 경로는 장시간 단일 프로세스 gate나 fuzz campaign을 대신하지 않습니다.

`node --test tests/zig-test-protocol.test.mjs`3/3·fail/skip0으로 fragmentation·잘린 frame·길이 제한·metadata/UTF-8 decoder 경계·결과 flag를 검사했습니다. `tests/fixtures/native-runner-negative.zig`는 의도적 pass/fail/skip/leak/error-log만 포함하며 정규 root에 import하지 않습니다.

이 반례를 ReleaseSafe로 컴파일한 binary SHA256 `e549aa19ae1ec9e2349121e195371259495299d7a042952a5be192ce9639b8b8`의 실제 기본 runner를 batch-size2로 실행했습니다. 전체5개 실행, pass3/fail1/skip1/logErrors2/leaks1, success=false, 종료코드1입니다. 이는 검사기 자체의 부정 대조 성공이지 제품 테스트5개 통과가 아닙니다.

재현:

```sh
zig test tests/fixtures/native-runner-negative.zig -O ReleaseSafe --test-no-exec -femit-bin=/absolute/temporary/native-negative
node tools/zig-native-batch-audit.mjs --binary=/absolute/temporary/native-negative --batch-size=2
node tools/zig-native-batch-audit.mjs --binary=/absolute/compiled/native-tests --batch-size=100
```

negative 실행의 종료코드1은 예상 결과입니다. 실제 제품 실행은 최종 complete의 success·skip·logErrors·leaks와 binary/source snapshot을 함께 확인해야 합니다. 전체 할당 실패 캠페인 범위는 테스트별 계약/환경변수와 구분하며 테스트 목록 전수로 모든 입력·편집·원본 조판 완료를 주장하지 않습니다.

## 2026-10-26 게시 Native와 후속 변경의 검증 경계

Native foundation은 `50ad5257`, 표시 자원 캐시는 `59bed088`, generic 채움 확장은 `482685bb`로 소스 게시됐습니다. [원본 색상 정책](source-color-policy.md)이 지원 필드·producer 조합·raw 보존·웹 소비 계약을 소유합니다. 이 기록 시점 공개 Pages는 manifest `5d2fa40e34d26c0fc4ba99b524dc6ebcaf8729b896a61e4da9b7d006fc09f9b1`의 이전 세대이며 소스 게시를 공개 배포 완료로 표시하지 않습니다.

| 근거 | 실제 확인 | 확대하지 않는 범위 |
| --- | --- | --- |
| foundation 전체 ReleaseSafe | root4860 pass·1 skip + 별도 text9 pass = **4869 pass·1 skip·0 fail**, exit0, 8/8단계 | generic 추가 후 새 전체 실행 아님 |
| 게시 전 형식 정리 연결 | 토큰 동치19파일·정리 후 집중33 및 동일 제품 WASM으로 선행 전체 실행 연결 | 형식 정리 후 전체 suite 재실행 아님 |
| generic 확장 | 집중18/18·skip0, 별도 실제 JS5흐름/고립 Canvas7흐름 | 서로 다른 검증을 Native 통과 수로 합산하지 않음 |
| 게시 foundation+generic의 Safe 제품 빌드 | 1회·6/6단계·exit0, 선행 확장 WASM 전체 바이트 동일 | 테스트·브라우저를 새로 실행한 것 아님 |
| 표시 header 캐시 | 영구 전용 테스트 **5 pass·0 fail·0 skip** | Native history 보관 정책 변경이나 전체 입력 문제 해결 아님 |

전체 실행의 고정 논리 source3049 digest는 `e7d146adc2c822c2d35b3705faffcbbeb00c2b3169eeb5a106f834b98eaa14ba`입니다. 이후 게시 형식 정리 base3049와 generic5를 결합한 source3050 digest는 `38668f9f6e591e15aa6cfd82658c0af5f7920c8e78776e5066761a16bacbb72b`로 구분합니다. 후자의 Safe 제품 WASM은 5,726,383바이트, SHA256 `3fc519b22c4c3f69d7e64c5337247163fcf0b7f8175e80c124325b922effccf0`이며 선행 확장 산출물과 전체 바이트가 같습니다. exports413/functions411, imports0, memory min19 pages·max없음·비공유·memory64=false이고 기존 ABI 기능/서명을 보존했습니다. 동일 바이트는 선행 실행 연결 근거이며 최신 source 전체 검증을 대신하지 않습니다.

유일 skip은 `hwpx.character_property_failure_tests.test.HWPX character property transaction allocation failure shard on mixed runs`입니다. [해당 테스트](../src/hwpx/character_property_failure_tests.zig)는 `HWPJS_CHARACTER_FAILURE_START/END`가 모두 미지정이면 skip하며 이번 전체 실행도 그 조건이었습니다. pass로 세지 않고 이 별도 shard의 모든 OOM 지점 통과를 주장하지 않습니다. 각 테스트 내부 할당 실패 검사와 이 skip은 별개입니다.

[표시 캐시](../web/preview/display-resource-cache.mjs)는 같은 활성 HWPX 세션의 성공한 일반 본문 splice에서 허용된 header 자원만 복사·재사용합니다. 본문·범위·권한·이력·저장 bytes는 캐시하지 않으며 서식/구조·undo/redo·문서 교체·실패 때 무효화합니다. [단위 회귀](../tests/hwpx/display-resource-cache.test.mjs)와 [실제 runtime 회귀](../tests/hwpx/display-resource-cache-runtime.test.mjs)가 영구 진입점입니다.

남은 **16개 이력 보관 제한**은 입력 누락이나 캐시가 만든 문제가 아닙니다. 기존 기본값 `maxEntries=16`, `maxCheckpointBytes=8MiB`와 [공통 스택](../src/model/history_stack.zig)의 oldest eviction 때문에 기존 b7/d63에서20입력 후25 undo는 revision4,100입력 후100 undo는 revision84까지 도달했습니다. 이 수치는 해당 기존 엔진의 관측이며 generic 새 바이너리에서 재실행한 것으로 쓰지 않습니다. 캐시 커밋은 이 정책을 바꾸지 않습니다. 8MiB는 개별 checkpoint 한도이지 전체 세션 메모리 예산이 아닙니다. [이력 계약](hwpx-edit-history.md)과 [영구 이력 회귀](../src/hwpx/editor_history_tests.zig)를 따르며, 더 긴 이력을 위한 V2는 이 게시 범위와 공개 배포에 포함하지 않습니다.
