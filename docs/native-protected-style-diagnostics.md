# 보호 문단 서식의 실패 주입 진단

후속 문단 병합 테스트의 자원 중단과 대조 검증은 [문단 병합 실패 주입 진단](native-paragraph-merge-diagnostics.md)이 소유합니다.

## 기존 실행의 후속 중단

51fabff6dc936cb200e48d9f4b6f25f69760f2b26f401a751389736a76ef2d1c(4,111개)의3376..4111 범위는3376..3430의55개를 fail/log/leak0으로 완료했습니다. 다음3431 `HWPX protected style command and input remain atomic on allocation failure`에서 peak4,308,798,872바이트가4,294,967,296바이트 기준을 넘어 exit1·guardStopped=true로 종료됐습니다(`native-tail-after-ownership.jsonl/.stderr`, `/tmp/hwpjs-title-group-native.6U4qUw`). child55570 종료를 확인했습니다.

같은 바이너리의 별도3432..4111 검사도 첫3432 `HWPX character style public command validates real IDs and preserves redo on refusal`에서 peak4,313,730,480바이트로 exit1·guardStopped=true입니다(`native-tail-after-style.jsonl/.stderr`). child76905 종료를 확인했고 이 범위의 완료 테스트는0개입니다. 두 중단을 제품 assertion 실패나 전체 통과로 재분류하지 않습니다.

## 대조 변경

작업 트리에 이미 있던 `character_style_session_tests.zig`의 한 바깥 checked_allocator.run과 두 allocation_failures.check 전환을 `/tmp/hwpjs-protected-style-diagnostic.T4KUw4`에서 검증했습니다. 다른 src2,633개 Git blob은 모두 같고, 이 파일도 기존 바깥 할당자/두 호출만 치환한 결과와 정확히 같습니다. 제품 함수·fixture·callback·단언·전체 실패 인덱스는 바꾸지 않았습니다.

ReleaseSafe4299b9bdcd71b15919910199461e917ffc0005d9bf16d92ecac7963da1292bbd는3/3·fail/skip/log/leak0·exit0·guardStopped=false·관측 peak65,159,552바이트입니다(`style-safe-build.log`, `style-safe-guard.jsonl/.stderr`). Debug05239cc38b2fb403b2421cef9470a5a4a99569c39e9c1bf1c5f64c29db83e9bd도3/3·동일 오류0·exit0·guardStopped=false·peak17,989,968바이트입니다(`style-debug-build.log`, `style-debug-guard.jsonl/.stderr`). 각각 root1개+서로 다른 실제 assertion2개이며 이름도 두 중단 대상과 일치합니다.

같은4,096MiB guardian이며 검사 범위를 줄이거나 한도를 올리지 않았습니다. 기존 테스트 변경을 확인 후 채택한 것이며 제품 편집 메모리 최적화나 전체 native gate 완료의 증거가 아닙니다. 앞의55개와 집중3개는 다른 바이너리이므로 합산하지 않습니다. 동시 진행 중인 원래 앞 구간과도 별도입니다.

집중 재현은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX protected style command' --test-filter 'HWPX character style public command'`이며 Debug도 같은 필터입니다. runner inventory의 root 외 실제 두 이름을 확인해야 하며 선언3개를 fixture3개나 전체 native 통과로 해석하지 않습니다.
