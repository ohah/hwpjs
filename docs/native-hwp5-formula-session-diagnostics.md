# HWP5 공개 계산 거래의 실패 관측 할당자

고정 구형 바이너리51fabff6…ef2d1c의3506 `public formula session preserves original on failed apply and committed values on failed save allocations`는 peak4,412,329,464바이트로4,096MiB를 넘어 중단됐습니다. 근거는 [이전 구조 진단](native-hwp5-formula-structure-diagnostics.md)과 `/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-hwp5-formula-family.jsonl/.stderr`입니다. 제품 assertion 실패나 전체 통과로 재분류하지 않습니다.

`formula_session_tests.zig`에서 실패 주입은 기존 allocation_failures.check가 맡고, fixture·실패 후 copyText/save 관측은 별도 checked_allocator.run 수명이 맡도록 분리했습니다. 실제 open/apply/save/reopen의 실패 주입과 모든 실패 인덱스는 유지합니다. 관측용 allocator를 주입 대상과 혼동하지 않습니다. 원본11.2/67.5와 성공12.2/68.5, 실패 후 저장 원본 바이트, 출력 할당 실패 뒤 이미 확정한 편집값을 확인하는 단언은 그대로입니다. 제품 함수는 바꾸지 않았습니다.

`c1c6f759` 기반 `/tmp/hwpjs-hwp5-formula-session.kUoxx2`의 다른 src2,634개 Git blob은 모두 같고 대상 파일도 실제 작업 트리와 같습니다. 실패 callback을 allocator 인자만 역정규화하면 원래와 byte-exact이고 모든 std.testing.expect 문장도 동일합니다. 포맷/diff 검사를 통과했습니다.

ReleaseSafe e7481f228fa63faae48483c6cab35a9a4c89599ebe6b7eaabf0fe2bd7ca6c3b5는 root 포함2/2·fail/skip/log/leak0·exit0·guardStopped=false·peak7,373,136바이트입니다(`session-safe-build.log`, `session-safe-guard.jsonl/.stderr`). Debug e8d4151b9b41544daa41030e3d910ec79f1b0d3091bd1985183898f0a4c027b3도2/2·동일 오류0·exit0·guardStopped=false·peak3,981,648바이트입니다(`session-debug-build.log`, `session-debug-guard.jsonl/.stderr`). 두 stderr는 비어 있습니다. 기존4,096MiB guardian을 유지했습니다.

재현은 `zig test src/root.zig -O ReleaseSafe --test-filter 'public formula session preserves original'`이고 Debug도 같습니다. 실제 한 테스트와 root를 확인했습니다. 진단 비용의 개선이며 전체 native gate·제품 메모리 최적화·모든 계산 규칙/편집/GUI 완료는 아닙니다.

후속 다단의 관측 OOM 재현·회귀와 각 바이너리 결과는 [다단 실패 주입 진단](native-column-observer-diagnostics.md)이 소유합니다.

구형 바이너리의 후속3507..4111은3507..3664의158개를 status/log/leak0으로 완료하고3665 column materialization에서 peak4,343,090,632바이트로 중단됐습니다(`native-tail-after-hwp5-formula-session.jsonl/.stderr`). 다음3666..4111도3666..3677의12개 완료 후3678 joined anchor inventory에서 peak4,347,858,352바이트로 중단됐습니다(`native-tail-after-column-materialization.jsonl/.stderr`). 두 중단은 위 단일 수식 session 테스트와 별개이며 해결로 계수하지 않습니다.
