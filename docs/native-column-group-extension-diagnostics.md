# 다단 그룹 확장 실패 주입 진단

## 구형 전체 실행

`/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-field-split.jsonl/.stderr`는 고정51fabff6…ef2d1c의3689..3713을25개·status/log/leak0으로 완료한 뒤3714 `column group extension repeats without restoring hidden prefix runs`에서 중단했습니다. peak4,340,944,328바이트·exit1·guardStopped=true이며 전체 범위4111 완료가 아닙니다. 앞선 중단은 [필드 분할 진단](native-field-split-diagnostics.md)을 따릅니다.

같은 구형 바이너리의 `native-tail-after-column-group-extension.jsonl/.stderr`는3715 실제 XML/continuation 검사를1개 완료한 뒤3716 기본/서식 후보의 실패 주입 검사에서 peak4,342,681,032바이트·exit1·guardStopped=true로 중단했습니다. 아래 현재 소스의4개 집중 검사는 이 두 실패 주입 경로를 모두 포함하지만 구형 중단을 소급 성공으로 바꾸지 않습니다.

## 변경 범위

`column_boundary_group_extend_tests.zig`의 세 checkAllAllocationFailures 호출만 공통 allocation_failures.check로 바꿨습니다. callback·모든 실패 지점·단언·fixture·소스 불변 조건·제품 함수는 유지합니다. 실패 중의 unchanged 검사는 이미 소유한 배열/텍스트를 읽으므로 별도의 실패 allocator 관측 할당을 추가하지 않습니다.

`/tmp/hwpjs-column-group-diagnostic.MwEPgB`는 e27ffff3 기준이며 변경 파일 외2,634개 src의 Git blob hash가 같습니다. 변경 파일도 세 helper 호출 치환만 있는지와 작업 트리 바이트 일치를 확인했습니다. 포맷/diff 검사도 통과했습니다.

## 집중 결과

첫 `group-safe-build.log`는 NoSpaceLeft·exit1로 실패했습니다. `group-safe-retry-build.log`의 재빌드는 exit0이며 ReleaseSafe 바이너리955ab6f713da7c77d59b545db47a061ad9ca3a0184d94f776fb773e059fc4d90의 `group-safe-guard.jsonl/.stderr`는 root 포함4/4·fail/skip/log/leak0·exit0·guardStopped=false·peak349,586,056바이트입니다. 반복 확장·두 실제 다단 fixture의 XML/continuation 소유권·기본/서식 상태의 전체 실패 주입을 포함합니다.

Debug dd98cca1b391c40a5e462e8e1c998d66a94672e31983742cb11c07a676041bd5도 `group-debug-guard.jsonl/.stderr`에서4/4·fail/skip/log/leak0·exit0·guardStopped=false·peak154,960,352바이트로 완료했습니다. 두 모드의 stderr는 비어 있습니다. 재현 필터는 `zig test src/root.zig -O ReleaseSafe --test-filter 'column group extension'`이고 Debug도 같습니다. 두 모드 결과나 구형 구간을 최신 전체 native gate·모든 문서/조판 완료로 합산하지 않습니다.
