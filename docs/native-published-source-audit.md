# 게시 소스 native 전수 감사

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
