# HWPX 문단 병합 실패 주입 진단

후속 계산 필드 병합의 별도 중단과 대조는 [계산 필드 병합 진단](native-formula-merge-diagnostics.md)이 소유합니다.

## 중단 재현과 변경 범위

2026-10-18 전체 ReleaseSafe 바이너리 `51fabff6dc936cb200e48d9f4b6f25f69760f2b26f401a751389736a76ef2d1c`의 후속 범위3433..4111은3433..3452의20개를 fail/log/leak0으로 완료했습니다. 다음3453 `HWPX merge retains later generated continuations and their current edits`에서 관측 peak4,300,688,792바이트가4,096MiB 한도를 넘어 exit1·guardStopped=true로 종료했습니다. 근거는 `/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-style-pair.jsonl/.stderr`입니다. 제품 assertion 실패나 전체 통과로 재분류하지 않습니다.

`paragraph_merge_session_tests.zig`의 네 `std.testing.checkAllAllocationFailures` 호출만 기존 공통 `allocation_failures.check`로 전환했습니다. 실패 주입 callback·인자·모든 할당 실패 지점·단언·바깥 할당자는 유지합니다. 공통 helper는 안전 검사와 누수 검사를 유지하되 각 할당의 stack trace를 저장하지 않는 진단 할당자를 사용합니다. 제품 병합/저장 코드는 변경하지 않았습니다.

분리 소스 `/tmp/hwpjs-merge-session-diagnostic.LpS06t`는 `e201d50d`를 기준으로 이 파일의 네 치환만 적용했습니다. 다른 src2,633개는 Git blob이 모두 같고, 대상 파일도 네 치환 결과와 정확히 같음을 확인했습니다. 포맷 및 diff 검사를 통과했습니다.

## 집중 검증

ReleaseSafe SHA256 `f285811274931a01cd633cf0dc23af71ba37ffa9a361c92f262fa7f61f18192b`는 root 포함4/4·fail/skip/log/leak0·exit0·guardStopped=false입니다. 동일4,096MiB guardian에서 관측 peak63,570,280바이트입니다(`merge-safe-build.log`, `merge-safe-guard.jsonl/.stderr`). 실제 세 테스트는 생성된 후속 문단의 현재 편집 보존, 삭제한 문단 identity의 재사용, 저장·checkpoint 교환 후 중복 텍스트 부재를 검사합니다.

Debug SHA256 `fa8532fda12abbd7c87f58890d61b4ad2c2e531db1dc02c70f17469d7eac29a3`도 같은4개를 fail/skip/log/leak0·exit0·guardStopped=false로 완료했습니다. 관측 peak19,710,312바이트이며 stderr는 비어 있습니다(`merge-debug-build.log`, `merge-debug-guard.jsonl/.stderr`).

집중 빌드는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX merge retains later' --test-filter 'HWPX merged provenance IDs' --test-filter 'HWPX merged session owns'`입니다. Debug도 같은 필터를 사용합니다. 결과는 선택 컴파일된 테스트 범위에만 적용하며 전체 native gate·전체 fixture 편집·브라우저 검증 완료를 뜻하지 않습니다. 서로 다른 바이너리의 결과를 합산하지 않습니다.
