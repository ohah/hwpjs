# 필드 분할 실패 주입 진단

구형 전체 바이너리51fabff6…ef2d1c의3688 필드 분할 검사는4,096MiB guardian에서 peak4,329,082,264바이트로 중단됐습니다. 이력은 [다단 진단](native-column-observer-diagnostics.md)과 `/tmp/hwpjs-title-group-native.6U4qUw/native-tail-after-column-joined-pair.jsonl`을 따릅니다. 실패/중단을 제품의 전체 성공으로 바꾸지 않습니다.

## 변경 범위

`field_structure_split.zig`의 두 std.testing.checkAllAllocationFailures 호출을 공통 allocation_failures.check로 바꿨습니다. 기존 callback·단언·입력·한도·실패 인덱스와 제품 함수는 동일합니다. 추적 비용을 줄이되 모든 실패 지점과 누수 검사는 유지합니다. callback 중의 텍스트/마커 관측은 이미 소유한 결과를 읽으며 실패 allocator로 추가 관측 버퍼를 만들지 않습니다.

`/tmp/hwpjs-field-split-diagnostic.OQnmfn`은 e9d24ba4 소스 사본입니다. 변경 파일 외2,634개 src의 Git blob hash가 기준과 동일하고 변경 파일은 정확히 두 helper 호출 치환이며 작업 트리와 같은 바이트임을 검증했습니다. 포맷/diff 검사도 통과했습니다.

## 결과

ReleaseSafe acc5c36bf9a3b20c30f26c10c098c6d9631dcc2c2865a3f89ced1e80d77e117a의 `field-safe-guard.jsonl/.stderr`는 root 포함2/2·fail/skip/log/leak0·exit0·guardStopped=false·peak9,503,056바이트입니다. Debug a24a6c84e472d9c644a4216f431cb759a04ed7372da21710d9326a20000b62dc의 `field-debug-guard.jsonl/.stderr`도2/2·동일 오류0·exit0·guardStopped=false·peak4,424,016바이트입니다. 두 stderr는 비어 있습니다. 각 `field-*-build.log`의 빌드도 exit0입니다.

재현 필터는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX field structure split candidate owns both marker sides'`이며 Debug도 같습니다. 이 결과는 해당 split 후보의 두 실패 sweep과 기존 단언을 검증한 것이지 최신 전체 native gate·모든 필드 명령·전체 원본 조판/브라우저 편집 완료가 아닙니다.
