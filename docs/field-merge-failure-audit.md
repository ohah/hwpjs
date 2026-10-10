# 필드 병합 할당 실패 감사의 메모리 경계

## 2026-10-11 재현

과거 native 전수 감사는3491번 `field source merge plan allocation failures preserve cross-paragraph Unicode source` 시작 후 SIGKILL로 종료됐습니다. 원본 실행의 OS 종료 원인은 확정하지 못했습니다. [이전 관측](reference-current-probes.md)을 전체 성공으로 읽지 않습니다.

현재 소스에서 해당 테스트만 ReleaseSafe로 실행하자 프로세스 RSS가37초에 약10GB,48초에 약12.7GB로 증가했습니다. macOS `sample`은 peak physical footprint13.7G와 DebugAllocator의 allocation/free/resize stack capture → DWARF SelfUnwinder 실행을 기록했습니다(`/tmp/hwpjs-field-merge-memory-20261011.sample.txt`). 호스트 메모리 압박을 피하려고 정확한 테스트 PID86588에 SIGTERM을 보냈고, 종료 결과도 TERM으로 확인했습니다. 이 실행은 실패 지점 전수 완료가 아닙니다.

외부 원본/세션과 다른 전용 DebugAllocator를 사용하되 stack_trace_frames10·resize_stack_traces=true를 유지한 대조도 실행5초에 RSS 약1.33GB로 증가했습니다. 정확한 PID90347만 SIGTERM으로 종료했습니다. 따라서 원본 세션과 할당자를 분리하는 것만으로 해결됐다고 주장하지 않습니다.

## 수정과 검증

`src/hwpx/field_source_merge_plan.zig`의 이 테스트에만 stack_trace_frames0·safety=true인 전용 DebugAllocator를 적용했습니다. 두 `checkAllAllocationFailures`의 콜백·실패 지점·원본 불변/Unicode/구조/서식 검사는 그대로입니다. FailingAllocator의 할당/해제 바이트 비교와 유도 실패 진단, 전용 DebugAllocator의 deinit 누수 검사를 유지합니다. 제품 할당자·파서·WASM 동작은 바꾸지 않습니다. 일반 할당/해제별 stack trace 진단은 이 반복 검사에서만 제외되며, 이는 진단 정보의 제한입니다.

ReleaseSafe 집중 실행은 root 진입 검사와 대상 테스트2/2를 통과했습니다. 생성된 같은 binary를 seed0x485750으로 `/usr/bin/time -l` 재실행한 결과도2/2·exit0,9.35초, maximum resident set size19611648바이트, peak memory footprint17908048바이트였습니다. `zig fmt --check`와 `git diff --check`도 통과했습니다. 메모리 증가가 trace 수집 설정에 의존한다는 대조 증거이며, Zig/macOS 내부의 정확한 누적 할당 위치나 원본 SIGKILL의 OS 원인을 완전히 확정한 증거는 아닙니다.

명령: `zig test src/root.zig -O ReleaseSafe --test-filter 'field source merge plan allocation failures preserve cross-paragraph Unicode source'`.3838테스트 전수 완료나 최신 기본 WASM 전체 검증으로 확대하지 않습니다.

`zig build -Doptimize=ReleaseSafe --prefix /tmp/hwpjs-field-failure-check-20261011`도 exit0입니다. 별도 출력 경로를 사용했으며 기본 데모 WASM은 교체하지 않았습니다. 현재 dirty 작업 트리 빌드이므로 게시 소스만의 clean build나 `zig build test` 전체 통과 증거로 읽지 않습니다.
