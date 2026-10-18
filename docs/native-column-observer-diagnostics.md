# 다단 실패 주입과 관측 경로 분리

## 문제 재현

구형51fabff6…ef2d1c 바이너리의3665 materialization/3678 object inventory/3679 tab inventory는 별도의4,096MiB 중단입니다. 이전 결과는 [공개 수식 session 진단](native-hwp5-formula-session-diagnostics.md)과 `/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-column-materialization.jsonl`·`native-tail-after-column-joined.jsonl`에 보관합니다.3679 tab은 peak4,362,096,072바이트·완료0·exit1·guardStopped=true입니다. 해당 범위가 전체 성공은 아닙니다.

초기 분리 시도 `/tmp/hwpjs-column-checkpoint-current.6qTc0G`는 두 실제 fixture로 실패 주입을 확장했지만, splice 실패 뒤 anchorText 관측에도 실패 중인 allocator를 사용했습니다. std FailingAllocator는 실패 시 alloc_index를 늘리지 않아 이후 요청도 계속 실패합니다. 따라서 structure_values=null 조건 뒤의 텍스트/원본 단언에 도달하기 전에 다시 OOM으로 끝날 수 있습니다. ReleaseSafe fd4e329d…541201이4/4·exit0이어도 이 두 조건의 전수 확인 증거로 사용하지 않습니다. Debug ed9c269f…663cfa는 이 문제를 확인하고 소유 guardian84008에 TERM해 root1개 후 ExternalSIGTERM·exit1·guardStopped=true로 중단했습니다. Safe guardian81589는 TERM 전에 이미 정상 종료돼 없었으며 중단됐다고 바꾸지 않습니다.

실제 원본 Session으로 별도 `src/column_observer_repro.zig`를 실행해 splice의 OOM 직후 같은 allocator의 anchorText도 OOM이고, 독립 observer로 읽으면 정상 원문을 얻으며 실패 allocator는 여전히 OOM임을 재현했습니다(`observer-old-path-repro.log`,1/1·exit0). 이 private 재현 파일은 제품/정규 root에 연결하지 않았습니다.

## 수정

테스트의 정상 준비/관측은 checked_allocator.run이, 전체 실패 주입은 allocation_failures.check가 맡습니다. 실패 callback의 Session allocator는 관측 중에만 별도 observer로 바꾸고 반드시 원래 ptr/vtable로 돌립니다. 소속 모델 부재·원래 텍스트·원본 source 세 조건은 하나의 observeMaterializationFailure가 담당하며 잘못된 조건을 명시적 오류로 반환합니다. 주입 중인 allocator에 실패 후 쿼리를 맡겨 단언을 건너뛰지 않습니다.

균등/서로 다른 폭의 두 fixture 모두에 open/query/splice의 전체 실패 지점을 적용합니다. 기존의 한 fixture 조건을 없앴고, checkpoint capture도 기존 helper를 사용합니다. 관측 경로를 긍정 검사와 의도적으로 틀린 기준값 검사로 재사용하는 회귀를 추가했습니다. 주입 allocator의 메모리는 원래 allocator로 해제하고 별도 관측 버퍼도 자기 소유권으로 해제합니다. 제품 함수·fixture·실패 인덱스 cutoff는 바꾸지 않았습니다.

## 현재 검증

`/tmp/hwpjs-column-observer-current.mtrs7I`의 ReleaseSafe 7eadb86e15a98559d911f2dfe9b2bc25b92218d1905f060aca630702a5fe14a2는 root 포함5/5·fail/skip/log/leak0·exit0·guardStopped=false·peak39,354,752바이트입니다(`column-safe-build.log`, `column-safe-guard.jsonl/.stderr`). stderr에 두 fixture의 sweep 완료가 모두 기록됐습니다.

Debug 1c4eebea9fd17095977a826af5894308a506afdb4ec76d68fc673bd97fa79037의 관측 회귀만2..3 범위로 먼저 실행한 `observer-debug-guard.jsonl`은1/1·동일 오류0·exit0·guardStopped=false입니다. Safe의 같은 단일 회귀도 통과했습니다. 단일 회귀는 실제 OOM 상태·정상 관측·틀린 텍스트 거부·여전히 활성인 OOM과 allocator 복원을 검사합니다. 빨리 끝난 이 범위의 footprint 샘플0을 실제 메모리 사용0으로 주장하지 않습니다.

같은 Debug의 전체5개도 `column-debug-guard.jsonl/.stderr`에서5/5·fail/skip/log/leak0·exit0·guardStopped=false·peak26,165,608바이트로 완료했습니다. 두 fixture의 sweep 완료 로그도 모두 확인했습니다. 모든 대조는 동일4,096MiB guardian입니다. 필터는 `zig test src/root.zig -O ReleaseSafe --test-filter 'column boundary session materializes' --test-filter 'column boundary checkpoint' --test-filter 'column boundary failure observer'`이고 Debug도 같습니다. 최신 전체 native gate나 제품 편집 메모리 최적화·모든 다단/조판 완료의 증거가 아닙니다.

동결 기준9f62876f와 전체 추적 src를 비교해 checkpoint 테스트 외2,634개 파일이 동일하고, 변경 파일도 현재 작업 트리와 같은 바이트임을 확인했습니다. 별도 joined 진단의 src도 joined_collect 외2,634개가 같은 기준입니다. 따라서 서로 다른 진단 바이너리를 하나의 전체 실행으로 합치지 않습니다.

joined 진단 `/tmp/hwpjs-column-joined-diagnostic.H4X5SW`는 기존 두 실패 sweep의 allocator helper 호출만 바꾼 소스를 사용합니다. 첫 Safe 컴파일은 완료 없이 exit1로 끝났고, `joined-safe-retry-build.log`의 재빌드는 exit0입니다. 바이너리773e3803d55ed8f2a060729cf960e1ed80cdc7baccc18e2602b8f2ba1df2ae0f의 `joined-safe-guard.jsonl/.stderr`는 root 포함4/4·fail/skip/log/leak0·exit0·guardStopped=false·peak53,772,672바이트입니다. Debug be6c767db415c5dfc140f3a15381b6dd43f3ce49e36ef27cad95b17bbeaeb818도 `joined-debug-guard.jsonl/.stderr`에서4/4·동일 오류0·exit0·guardStopped=false·peak21,119,336바이트입니다. 두 stderr는 비어 있습니다. 개체 폭과 Unicode/탭 좌표의 기존 단언·실패 인덱스는 유지했습니다. 재현 필터는 `--test-filter 'column joined anchor' --test-filter 'column joined tab'`입니다.

구형 전체 바이너리의 후속 `native-tail-after-column-joined-pair.jsonl`은3680..3687의8개 결과 뒤3688 field structure split에서 peak4,329,082,264바이트로 중단했습니다(exit1·guardStopped=true). 이 중단은 현재 focused 다단 결과와 별개의 미해결 전체 gate이며 통과로 바꾸지 않습니다.
