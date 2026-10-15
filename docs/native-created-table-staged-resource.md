# 표 생성 실패 주입의 fixture 할당자 경계

## 재현과 수리

도형 배치 수리 후 전체 native 바이너리 `4ddda72fb323586fc0478a5dc9fbc894adb9571507a8f052db164ed3057e1265`는3,923선언 중858개 완료 뒤 index858 `created table staged allocation failures retain empty current state and source`에서1024MiB 관측 기준을 넘어exit1·incomplete로 끝났습니다. 관측 physical footprint peak는1,087,767,680바이트이며 앞선858개 fail/log/leak0을 전체 성공으로 읽지 않습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-drawing-fixed-native-audit.jsonl`입니다.

`src/hwpx/created_table_session_tests.zig`의 해당 테스트 바깥 소유 범위만 기존 checked_allocator.run으로 분리했습니다. 제품 staging/Session/표 모델은 변경하지 않았습니다. 내부 표준 checkAllAllocationFailures의 모든 실패 지점·실패마다 빈 registry 단언·borrowed session의 registry 복원/해제·성공 뒤 원본 registry0과 저장 원문 bytes 동일 단언을 그대로 유지합니다. 공통 wrapper는 safety와 명시적 누수 검사를 유지하고 할당별 stack trace 저장만 제외합니다.

## main 독립 검증

main `569bc564`에 해당 테스트 수리만 더한 사본의 집중 바이너리 `70638a770985cbff60649c0e6624f48f61c2a74a3e8bc18f660ff941f06c22c8`는 같은1024MiB 한도에서 root 포함2/2·fail/skip/log/leak0·exit0, peak14,221,672바이트입니다. 로그는 `/tmp/hwpjs-line-snapshot-publication.nw8dHT/created-table-staged-main-audit.jsonl`입니다. 같은 사본의 ReleaseSafe 제품 빌드5/5·exit0입니다. 전체 native 재실행·수식 기능/표 생성 API의 새 게시·기본 WASM 승격은 이 집중 검증에 포함하지 않습니다.

추적 src/build2,497파일을 Git blob hash로 대조해 위1파일만 다른 것을 확인했고 fmt/diff check도 통과했습니다. 게시에는 테스트5줄과 이 기록/상위 링크3파일만 포함합니다.
