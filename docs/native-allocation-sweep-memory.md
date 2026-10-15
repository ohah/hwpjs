# 할당 실패 전수 검사의 메모리 보존 조사

## 중단 지점과 변경

이전 native guardian의 index3359는 HWPX character style public command validates real IDs and preserves redo on refusal입니다. 실제 ID·잘못된 ID/위치·undo/redo 저장 검증 뒤 editor.open/setCharacterFormat의 전체 실패 주입을 std.testing.allocator로 수행했습니다. Zig0.16.0의 이 allocator는 매 할당10스택 프레임과 resize 스택을 기록합니다. never_unmap/retain_metadata가 true라고 추정하지 않습니다. 실제 확인한 기본값은 둘 다 false입니다.

이 한 검사만 기존 testing/allocation_failures.check에 연결했습니다. std.testing.checkAllAllocationFailures 자체·모든 실패 인덱스·현재 모델 미설치 단언은 유지하며 공용 scoped DebugAllocator의 safety=true/stack_trace_frames=0과 명시적 deinit 누수 검사를 사용합니다. 제품 파서/편집 코드를 변경한 것이 아닙니다. 전수 gate를 위해 검사를 삭제하거나 실행 횟수를 축소하지 않았습니다.

## 실측과 부정 대조

수정한 원래 테스트의 ReleaseSafe 단일 바이너리 SHA256 `1ddb18ae18bfca2772cfe8a8c45b6704e9e22d5e923ea7ace7757e4590986b00`는 guardian에서1/1·fail/skip/logErrors/leaks0·exit0이며 관측 maximumPhysicalBytes54985064입니다. 로그 `/tmp/hwpjs-style-allocation-checked.xf8JQZ/audit.jsonl`,handle35721입니다. 이전 전체 바이너리3359의8GiB 중단과 다른 산출물이므로 이 둘만으로 원인을 확정하지 않습니다.

별도 comparison probe는 같은 charshape.hwpx·ID18·editor.open/setCharacterFormat callback과 현재 제품 소스에서 두 backing을 비교했습니다. 파일 header의 선언 마지막 ID와 최대 ID가 모두18임을 독립 ZIP/XML 해석으로 확인했습니다. checked 버전은6808호출(정상1회+6807실패 위치)을 완료했습니다. traced 버전은 current1159955656/peak1160004808bytes에서1GiB guard에 의해 중단됐습니다. 로그 `/tmp/hwpjs-style-allocator-pair.H8Wj79/audit.jsonl`,binary SHA256 `48b1369ba3c4a75c7338e9727ff43be47fae47674f5428ca1887a56aaf006224`,handle82044·exit1입니다. 이 exit1은 traced 비교의 자원 중단이며 제품 assertion 실패나 두 버전 전수 pass가 아닙니다.

이 비교는 해당 경로의 높은 메모리 사용에서 테스트 allocator의 스택 기록이 기여한다는 근거입니다. 모든 전수 중단 원인을 이것 하나로 확정하거나 제품 전체에 누수가 없다고 주장하지 않습니다. 샘플 footprint는 OS 하드 상한이 아닙니다.

공용 helper의 실패 인덱스/삼킨 OOM 검사1/1·exit0과 의도적인 누수 부정 대조3개를 실제 실행했습니다. 부정 대조는3개 모두 FAIL(TestAllocatorLeak)로 종료1을 확인했으며 callback 실패보다 누수 오류가 우선하는 경계도 유지됩니다. 컴파일/인프라 실패를 부정 대조 통과로 세지 않았습니다.

## 게시 경계

이 test harness 수정과 비교 probe는 아직 로컬입니다. 전체 정규 native/build gate와 문단 소유 순회 최적화의 게시 조건은 [소유 노드 순회](hwpx-paragraph-owned-node-scan.md),이전 전수 중단은 해당 문서의 고정 산출물 기록과 구분합니다. 단일 테스트55MB 결과로 정규 전수 gate를 대체하지 않습니다.
