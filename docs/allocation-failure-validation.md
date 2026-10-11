# 할당 실패 검증

`src/testing/allocation_failures.zig`는 별도 safety-enabled DebugAllocator를 소유하고 종료 시 누수를 검사합니다. std의 `checkAllAllocationFailures`를 그대로 호출해 정상 실행에 필요한 모든 할당 실패 지점·OOM 삼킴·비결정적 할당을 검사합니다. 실패 지점 수를 샘플링하거나 줄이지 않습니다.

대형 실파일의 일반 실행에는 `src/testing/checked_allocator.zig`의 run을 사용합니다. 이 모듈이 safety-enabled 무추적 Debug 타입을 단일 소유하며 실패 주입 도우미도 같은 타입을 재사용합니다. run은 callback 성공/오류 뒤 allocator를 해제하고 누수가 있으면 TestAllocatorLeak, 없으면 원래 callback 오류를 전달합니다. 일반 실행을 실패 주입 전수 실행으로 잘못 표시하지 않습니다.

매 정상 할당의 스택 기록만 0프레임으로 설정합니다. 누수는 여전히 실패하지만 누수의 최초 할당 스택은 이 경로에서 제공하지 않습니다. 원인 위치가 필요하면 기존 스택 추적 allocator로 별도 재현합니다. 이 설정은 테스트 도우미에만 있으며 제품 allocator·WASM·파서 정책은 변경하지 않습니다.

```sh
zig test src/text_preview_allocation_test.zig -O ReleaseSafe --test-filter 'allocation sweep retains' --test-filter 'HWPX public text transport releases every failed allocation'
```

아래는 의도적인 누수 부정 대조입니다. `TestAllocatorLeak`을 출력하고 종료코드 1이어야 합니다. 정상 root suite에 등록하지 않습니다.

부정 대조는 전수 실패 주입, 일반 callback 성공, 일반 callback 오류의 세 경로를 각각 검사합니다. 콜백 자체가 오류를 반환해도 누수가 있으면 `TestAllocatorLeak`이 우선해야 합니다. 후속 실행에서 세 검사 모두 정확히 `TestAllocatorLeak`으로 실패했고 최종 exit1이었습니다. 이는 기대된 부정 대조 결과이며 정상 suite의 실패나 통과 수에 합산하지 않습니다.

```sh
zig test src/testing/allocation_failures_negative.zig -O ReleaseSafe --test-filter 'negative deliberate leak'
```

기본 도우미 회귀는 할당 두 개에 대해 정상 실행 한 번과 두 실패 지점 모두를 실행했는지 검사하고, OOM을 삼킨 콜백도 거부합니다. 실행 중인 이전 테스트 바이너리에 이 변경을 소급하지 않습니다.

## 생성 셀 텍스트의 전체 gate 지연 조사

후속 최신 전체 실행의 table_display_placements 실제 중첩 소유권 검사에서는 상황이 달랐습니다. 이 검사는 이미0프레임 DebugAllocator로 std의 전수 실패 주입을 실행합니다. 샘플의 주요 경로는 read→display_current_paragraphs→paragraph_structure_collect→section_text.scanSource→XML visit이며 실패 할당자의 실제 backing도0프레임이었습니다. 여기의 지연을 앞선 DWARF 스택 추적 비용으로 일반화하지 않습니다. 전체 XML 순회가 실패 지점마다 반복되는 검사 비용이며, 이 샘플만으로 제품 무한 루프/누수나 전체 검사 완료를 주장하지 않습니다. 실패 지점을 줄이거나 불필요하게 할당자 설정을 교체하지 않았고 동일 실행을 유지했습니다.

후속 전체 실행은 생성 셀을 지나 대형 실제 문서의 line_display_snapshot 검사로 진행됐습니다. 이 일반 실행에서도 DebugAllocator10프레임→DWARF 스택 해석 비용을 샘플링했습니다. 선 도형 검사만 공통 checked allocator 실행기로 분리했고 원래18선/17장식 거부와 끝점/문단 기대값은 변경하지 않았습니다. 집중3/3·exit0 실행의 시간은28.74초, 최대 RSS629571584바이트·peak footprint523617576바이트입니다. 이후 생성 셀/전수 실패 주입 helper/일반 checked allocator를 함께 선택한5/5·exit0도 확인했습니다. 일반 helper의 callback 오류 보존과 scoped buffer 해제를 검사하며 의도적 누수 부정 대조는 변경 후에도 TestAllocatorLeak·exit1로 실패했습니다. 이전 전체 바이너리는 이 후속 테스트 변경을 포함하지 않으므로 새 helper의 전체 gate로 읽지 않습니다. 제품 parser·WASM allocator는 변경하지 않았습니다.

2026-10-11 소유 ReleaseSafe 전체 테스트를 샘플링해 `created_cell_text_tests`의 실패 주입 callback→Session.save→DebugAllocator(스택10프레임)→captureStackTrace/DWARF 해석 경로를 확인했습니다. 당시 물리 footprint101.4GB였고 실행은 아직 종료 전이었습니다. 이 샘플은 제품 parser 누수의 증명이 아니며 전체 검증의 최대 RSS/종료 측정도 아닙니다. sample 도구의 DWARF 처리 경고도 제품 오류로 계수하지 않습니다.

해당 한 실패 주입 호출을 이 공통 도우미로 연결했습니다. callback과 모든 실패 지점/누수 검사·저장/이력 기대값은 그대로 유지했습니다. 집중3/3·exit0(root import 포함)를 두 번 확인했고 후속 `/usr/bin/time -lp` 실행은4.09초·최대 RSS73121792바이트·peak footprint15991288바이트였습니다. 전체 검증 샘플과 집중 실행의 범위가 달라 전체 메모리가101GB에서70MiB로 감소했다고 주장하지 않습니다. 의도적 누수 부정 대조는 별도1실패·TestAllocatorLeak·exit1로 끝나 누수 검사가 여전히 실패함을 확인했습니다.

최신 전체 native gate를 시작하기 전에 cwd/명령/부모·자식 PID를 확인한 이 목표의 오래된 소스 검증 프로세스만 종료했습니다. 취소를 통과/제품 실패로 계수하지 않고 다른 저장소나 사용자 프로세스는 종료하지 않았습니다. 최신 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`은 실행 중이며 아직 최종 결과가 없습니다. 테스트 파일 변경은 그 최종 gate 전 미커밋입니다.

같은 소스의 ReleaseSafe build6/6·exit0(42초), 별도 `full-gate-current/bin/hwpjs.wasm` SHA256 `3d77c87433cee8ee8256722756c23c06056b693a9ebb82af2388d6dc054e7252`를 확인했습니다. 기존 문단 지역 순회 후보3f096f와9개 non-custom section의 타입/길이/바이트 SHA256이 모두 같습니다. 전체 파일 해시 차이를 실행 코드 변경으로 단정하지 않으며, 이 비교로 전체 native/public gate를 대체하지 않습니다. 기본 WASM/데모는 교체하지 않았습니다.
