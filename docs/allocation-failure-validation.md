# 할당 실패 검증

`src/testing/allocation_failures.zig`는 별도 safety-enabled DebugAllocator를 소유하고 종료 시 누수를 검사합니다. std의 `checkAllAllocationFailures`를 그대로 호출해 정상 실행에 필요한 모든 할당 실패 지점·OOM 삼킴·비결정적 할당을 검사합니다. 실패 지점 수를 샘플링하거나 줄이지 않습니다.

매 정상 할당의 스택 기록만 0프레임으로 설정합니다. 누수는 여전히 실패하지만 누수의 최초 할당 스택은 이 경로에서 제공하지 않습니다. 원인 위치가 필요하면 기존 스택 추적 allocator로 별도 재현합니다. 이 설정은 테스트 도우미에만 있으며 제품 allocator·WASM·파서 정책은 변경하지 않습니다.

```sh
zig test src/text_preview_allocation_test.zig -O ReleaseSafe --test-filter 'allocation sweep retains' --test-filter 'HWPX public text transport releases every failed allocation'
```

아래는 의도적인 누수 부정 대조입니다. `TestAllocatorLeak`을 출력하고 종료코드 1이어야 합니다. 정상 root suite에 등록하지 않습니다.

```sh
zig test src/testing/allocation_failures_negative.zig -O ReleaseSafe --test-filter 'negative deliberate leak'
```

기본 도우미 회귀는 할당 두 개에 대해 정상 실행 한 번과 두 실패 지점 모두를 실행했는지 검사하고, OOM을 삼킨 콜백도 거부합니다. 실행 중인 이전 테스트 바이너리에 이 변경을 소급하지 않습니다.
