# 실제 헤더 반복 검사의 메모리 조사

## 위치와 독립 재현

분리 소스의 정규 native 바이너리 SHA256 `708d10ed86d46e98fe9a25b4077e58e7c7b494e441ac5377381e3e5db46e2827`의 inventory는3909개입니다. batch1000/2GiB 물리 메모리 감시 실행80845는145개 완료 뒤 index145의 HWPX corpus package relationships read-only survey에서 current2195408816/peak2195523504bytes로 중단됐습니다. 로그 `/tmp/hwpjs-clean-native-location-20261015.jsonl`입니다. 정규 단일 프로세스 gate의 통과 증거로 바꾸지 않습니다.

해당145번만 같은 전체 바이너리에서 실행하면484파일/478승인/MissingEndRecord6의 기존 단언을 모두 통과하며, status/logs/leaks0·exit0·peak397066912bytes입니다. 별도 filtered 바이너리도2/2·exit0·관측 최고322830936bytes입니다. 따라서 코퍼스 검사 하나를 원인으로 단정하거나 그 검사를 삭제하지 않았습니다.

같은 바이너리의0부터 순차 실행 후 매 테스트의 footprint를 읽은 `/tmp/hwpjs-clean-native-prefix-memory-20261015.jsonl`에서 index72 색상 실제 헤더 검사의 current 증가는 약384MiB, index82 언어별 글꼴 실제 헤더 검사의 증가는 약752MiB입니다. index145에서 다시 current2209974240bytes로 중단됐습니다. 완료된 결과는 status/logs/leaks0이며 footprint 증가는 제품 누수 확정과 다릅니다.

## 두 테스트의 scoped allocator 비교

character_color_patch와 character_font_patch의 해당 테스트 본문을 allocator 인자를 받는 private 함수로 옮기고 공용 checked_allocator.run으로 감쌌습니다. 원본 fixture·모든 charPr와 언어별 반복·원문 전체 비교·재파싱·값 단언은 유지합니다. 공용 helper는 safety=true/stack_trace_frames=0·명시적 deinit 누수 검사를 수행합니다. 제품 parser/writer는 수정하지 않았습니다.

수정 전 전체 바이너리에서72/82만 같은 프로세스에 순서대로 요청한 실행77771은 둘 다 status/logs/leaks0·exit0입니다. 첫 검사 후 current404243056/peak405586568bytes, 두 번째 후 current1192559792/peak1193805000bytes입니다.

수정 후 filtered 바이너리 SHA256 `9af69d1cd780efe3c181893a1f3df49a2eafb5a655e56d844daff0f8f396b768`는 root import와 두 검사3/3·fail/skip/logErrors/leaks0·exit0입니다. 별도 같은 두 검사 요청 후 footprint를 읽은 실행도 둘 다 status/logs/leaks0·exit0이며, 첫 검사 후 current1212704/peak2539832bytes, 두 번째 후 current1212704/peak2654520bytes입니다. 두 검사의 테스트 allocator 스택 기록이 큰 메모리 사용에 기여한 근거이며 전체 제품 메모리 상한/누수 없음/정규 gate 완료로 확대하지 않습니다.

포맷·해당 diff 검사도 통과했습니다. native 수정은 로컬이고 정규 전체 검증/ReleaseSafe 제품 빌드를 아직 통과하지 않았습니다. 전체 지원 목표와 기본 WASM 승격은 그대로 미완료입니다. 이번 실행의 모든 native 자식은 종료됐으며 브라우저/디바이스를 시작하지 않았습니다.

## 후속 정규 검증과 폐기한 설정 실험

두 헤더 테스트 수정 후 같은 분리 소스의 정규 `zig build test -Doptimize=ReleaseSafe -j1 --summary all` 실행34852는 컴파일 후 native 실행까지 진행했으나 합산 RSS8263MiB로8GiB 기준을 넘어 중단됐습니다. build SIGTERM·wrapper exit1이며 전체 통과 수는 확인되지 않았습니다. PID10273/10286/27844의 종료를 확인했습니다.

실행 중1초 sample `/tmp/hwpjs-clean-native-current-20261015.sample.txt`는 table_geometry_values의 실제 표 배치 할당 실패 검사→testing.FailingAllocator→DebugAllocator(stack_trace_frames10)→debug.captureCurrentStackTrace→DWARF SelfUnwinder 경로를 보여줍니다. 표 배치 제품 누수나 전체 메모리 원인을 이 sample 하나로 확정하지 않습니다.

별도 test root의 std_options.allow_stack_tracing=false로 진단만 제한하는 실험은 설정 적용을 확인하는 양성 대조가 TestUnexpectedResult로 실패했습니다. Zig0.16.0 기본 compiler/test_runner.zig가 자체 std_options를 소유하므로 사용자 테스트 모듈의 선언만으로는 해당 설정이 적용되지 않았습니다. 같은 실험의 누수/단언 음성 대조는 예상 exit1이었지만 설정 자체가 미적용이므로 새 정책의 안전성 증명으로 세지 않습니다. 실험 진입점/음성 대조 파일은 모두 제거했고 build/SDK/제품 설정을 변경하지 않았습니다. 실패한 실험을 자원 문제 해결이나 새 정규 gate 통과로 기록하지 않습니다.
