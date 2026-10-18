# 계산 필드 문단 병합 실패 주입 진단

## 원래 전체 바이너리의 중단

ReleaseSafe `51fabff6dc936cb200e48d9f4b6f25f69760f2b26f401a751389736a76ef2d1c`의3456..4111 범위는3456..3458의3개를 fail/log/leak0으로 완료했습니다. 다음3459 `HWPX merged formula input allocation failures preserve the complete model`에서 관측 peak4,330,982,832바이트가4,096MiB 한도를 넘어 exit1·guardStopped=true로 종료했습니다. 근거는 `/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-merge-absolute.jsonl/.stderr`이며 child97328의 종료를 확인했습니다. 앞서 임시 디렉터리에 없는 guardian 상대 경로로 종료한 두 준비 실행은 테스트 실행 성공이 아닙니다.

같은 바이너리의 별도3460..4111 범위는3460..3462의3개를 완료한 다음3463 `HWPX structural formula splice allocation failures preserve the complete model`에서 peak4,304,293,272바이트·exit1·guardStopped=true로 종료했습니다(`native-tail-after-formula-input.jsonl/.stderr`). 이 후속 구조 편집 테스트는 아래 병합 파일과 다른 대상이며 아래 집중 결과로 해결됐다고 주장하지 않습니다.

## 변경과 집중 대조

`paragraph_merge_formula_tests.zig`의 네 `std.testing.checkAllAllocationFailures` 호출만 기존 `allocation_failures.check`로 전환했습니다. 실제 fixture 구성·바깥 할당자·callback/인자·실패 시 전체 모델/원본/undo 보존 단언·성공 후 저장/재열기는 그대로입니다. 전체 실패 지점을 건너뛰거나 한도를 올리지 않았습니다. 제품 병합/계산 코드는 바꾸지 않았습니다.

`05a7796d` 기반 분리 소스 `/tmp/hwpjs-formula-merge-diagnostic.8D8Apb`에서 다른 src2,633개 Git blob이 모두 같고 대상 파일도 네 호출 치환 결과와 정확히 같음을 확인했습니다. 포맷/diff 검사를 통과했습니다.

ReleaseSafe SHA256 `ffac9737e650288a3cd7463fd6dcf81eb98d6cf33e318bed4a929c395072e977`은 root 포함4/4·fail/skip/log/leak0·exit0·guardStopped=false·관측 peak13,353,296바이트입니다(`formula-safe-build.log`, `formula-safe-guard.jsonl/.stderr`). Debug `ca4a6a3bbe21f3b8f3cc586c680ce6b6318c685c20c2b6fff0e6088bc24ba146`도4/4·동일 오류0·exit0·guardStopped=false·peak5,996,880바이트입니다(`formula-debug-build.log`, `formula-debug-guard.jsonl/.stderr`). 실제 세 이름과 inventory를 확인했으며 두 stderr는 비어 있습니다.

필터는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX generated-left formula merge' --test-filter 'HWPX merged formula input' --test-filter 'HWPX formula merge transaction'`이고 Debug도 같은 필터입니다. 같은4,096MiB guardian을 사용했습니다. 집중 검증은 진단 할당 경로의 대조이며 제품 편집 메모리 최적화나 전체 native/fixture/UI 완료가 아닙니다. 다른 바이너리/범위의 결과를 합산하지 않습니다.
