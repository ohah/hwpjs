# 문단 구조·원본 파트 실패 주입 진단

고정 전체 바이너리의 후속 앞 구간 완료와 한계는 [native 앞 구간 기록](native-prefix-coverage-current.md)이 소유합니다.

## 구조 계산 필드 입력

원래 전체 바이너리 `51fabff6dc936cb200e48d9f4b6f25f69760f2b26f401a751389736a76ef2d1c`의3463 중단은 [이전 병합 진단](native-formula-merge-diagnostics.md)을 따릅니다. 실제 중단 대상은 `paragraph_structure_formula_tests.zig` 첫 테스트입니다. 작업 트리에 이미 있던 공통 실패 주입 helper 전환 한 줄만 분리 소스 `/tmp/hwpjs-structural-formula-diagnostic.mlWzzz`에서 검증했습니다. `58010454`와 다른 src2,633개 Git blob은 같고 대상도 해당 한 줄만 치환한 결과와 정확히 같습니다. 실제 chart 저장·재열기 검사와 전체 실패 지점·단언·제품 함수는 유지했습니다.

ReleaseSafe `e1bbf8c7750bf8ab5897541078f9b7525494e4738835efeb2c7708aa10f0204f`는 root 포함3/3·fail/skip/log/leak0·exit0·guardStopped=false·관측 peak8,339,792바이트입니다(`structure-safe-build.log`, `structure-safe-guard.jsonl/.stderr`). Debug `e42e057673bd239cee64587ec2586ceb1dafe15f43f3247fe41af5aacb50f4a9`도3/3·동일 오류0·exit0·guardStopped=false·peak8,667,496바이트입니다(`structure-debug-build.log`, `structure-debug-guard.jsonl/.stderr`). 두 stderr는 비어 있습니다.

필터는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX structural formula splice' --test-filter 'HWPX structural formula save'`이고 Debug도 같습니다. 실제 두 이름은 전체 모델 실패 원자성과 chart의 비대상 계산 보존입니다.

## 원본 파트 수명과 마스터페이지 ID

같은 원래 전체 바이너리의3464..4111 범위는3464만 완료한 뒤3465 `HWPX paragraph ID source parts release transient ownership on allocation failure`에서 peak4,313,599,408바이트로4,096MiB를 넘어 exit1·guardStopped=true입니다(`/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-structural-formula.jsonl/.stderr`). child21187 종료를 확인했습니다. 후속3466..4111은3466..3473의8개를 완료한 뒤3474 공개 필드 split/save 실패 주입에서 peak4,320,120,216바이트로 같은 한도를 넘었습니다(`native-tail-after-id-parts.jsonl/.stderr`). 뒤의3474는 아래 수정 대상과 다른 파일이며 해결로 계수하지 않습니다.

`paragraph_id_source_parts_tests.zig`의 세 실패 주입 호출만 공통 helper로 전환했습니다. `58010454` 기반 `/tmp/hwpjs-id-source-diagnostic.ufe6iI`의 다른 src2,633개 Git blob과 대상의 세 치환 동일성을 확인했습니다. fixture·원본 파트 수명·master page ID 충돌 회피·실제 저장/재열기·모든 실패 지점과 단언을 유지했습니다. 포맷/diff 검사를 통과했습니다.

ReleaseSafe `50767f9705a450abe6de2535836d5098bcdc6aba938e9db98919a60bcf800601`은 root 포함3/3·fail/skip/log/leak0·exit0·guardStopped=false·peak5,833,040바이트입니다(`id-safe-build.log`, `id-safe-guard.jsonl/.stderr`). Debug `bbfd5c6a255b47aac7985a3524039f5d119e0e66b3333b040fad61de5bfbbfe1`도3/3·동일 오류0·exit0·guardStopped=false·peak2,802,000바이트입니다(`id-debug-build.log`, `id-debug-guard.jsonl/.stderr`). 두 stderr는 비어 있습니다. 필터 `--test-filter 'HWPX paragraph ID source parts'`가 실제 두 테스트를 모두 포함하며 inventory의 이름/개수로 확인했습니다.

모든 대조는 기존4,096MiB guardian을 유지합니다. 진단 할당 비용의 개선이지 제품 편집 메모리 최적화나 전체 native gate·전체 fixture 편집 완료가 아닙니다. 바이너리가 다른 결과는 합산하지 않습니다.
