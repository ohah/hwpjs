# 큰 문서 테스트의 할당자 진단 비용

분할 native 실행의 index619(`connector_display_host_tests`)가 프로세스당1검사에서도 물리 footprint 관측4096MiB를 넘었습니다. `/tmp/hwpjs-wire-resource-audit.LC0pnc`는619개 완료·618pass·1fail·skip0 뒤 해당 검사에서 중단됐으며, 실제 관측 peak4423126568바이트입니다. 이 결과를 전체 통과로 읽지 않습니다. MAX 기대값 실패/3버퍼 누수는 [별도 회귀](formula-max-test-regression.md)이며 이 큰 자원 사용의 설명으로 대체하지 않습니다.

## 변경과 보존하는 검사

`src/testing/checked_allocator.zig`는 명시적 safety=true·stack_trace_frames=0인 DebugAllocator를 한 검사 범위에 소유합니다. callback의 오류를 보존하고 deinit 누수 상태가 있으면 TestAllocatorLeak으로 실패합니다. `allocation_failures.zig`도 같은 Debug 타입을 사용하며 기존 전체 실패 인덱스 순회를 유지합니다. 전역 SDK/제품 할당자나 표준 test runner는 수정하지 않습니다.

연결선 검사에서는 std.testing.allocator 대신 이 범위 할당자만 바꿉니다. 실제 원본 문서·4연결선·Unicode 입력·undo/redo·모든 위치 단언은 그대로입니다. 해당 인스턴스의 할당별 호출 위치 기록은 잃지만 안전성·누수 검출은 유지합니다. 전역 allow_stack_tracing은 여전히 true이고 다른 native/제품 오류 진단을 끄지 않습니다.

## 동일 집중 범위 대조

참조 입력은 `2025 행정업무운영 편람(최종).hwpx`, SHA256 `c6dd7e847a99f219681afc5a29c80a9665c04df9cda4d820a3350d739664fdf6`입니다. HEAD 의존성에 이 변경만 적용해 별도 집중 바이너리를 만들었습니다. 수정 전 집중 바이너리도 같은 source 집합에서 연결선 검사의 할당자만 되돌려 컴파일했습니다. 두 runner metadata의 기존2개 이름/순서는 같고 수정본에 helper 자체 검사1개가 추가됩니다. 처음 전체 metadata equality 시도가 이 추가 검사 때문에 실패했으며, 기존 검사를 제거한 것으로 통과시키지 않았습니다.

같은 프로세스당1검사·1024MiB 관측 한도에서 수정 전은 연결선 검사 중 peak1349748080바이트로 자원 중단됐습니다. 수정본 SHA256 `71f8fa0ac0cd3594d93d8da11ddeb052d75a3b1c9f9d19f6ac58dd753a5c2749`은3/3·실패/skip/log/leak0·exit0, 관측 peak96567752바이트(약92MiB)였습니다. 결과는 `/tmp/hwpjs-allocator-resource.0jY1Gb`에 있습니다. 이 footprint 관측은 OS 하드 상한이나 일반 제품 메모리 성능비의 증거가 아닙니다.

별도 `src/testing_checked_allocator_probe.zig`는 root inventory에 import하지 않는 음성 대조입니다. 양성2/2는 전역 tracing 유지·2할당의3개 전체 실패 호출·callback 오류 보존을 확인합니다. 의도적 누수와 단언 실패는 각각 실제1/1 실행에서 FAIL(TestAllocatorLeak)/FAIL(TestUnexpectedResult)·exit1이었고, 컴파일 오류/시그널 종료를 대조 성공으로 세지 않았습니다. 원래 전체 native gate의 자원 문제 전체가 해결됐다는 주장은 하지 않습니다.

ReleaseFast에서도 같은 양성2/2·exit0과 의도적 누수 FAIL(TestAllocatorLeak)·exit1을 확인했습니다. 최적화 모드의 기본 allocator 안전성에 기대지 않고 이 helper의 명시적 safety=true로 검사를 유지합니다. 모드별 결과를 서로 다른 사례 수로 합산하지 않습니다.

게시할 변경만 분리한 소스의 fmt와 ReleaseSafe 제품 빌드5/5단계도 통과했습니다. 기본 배포 WASM을 교체하지 않았고 브라우저·디바이스도 실행하지 않았습니다. 이 검사 수리와 HWP5 생성 표 Session/CFB/API 기능 게시를 구분합니다.
