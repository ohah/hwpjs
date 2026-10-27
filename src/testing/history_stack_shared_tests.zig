//! 공통 V2 ring 및 HX 소유권/표시세대/직접 snapshot 할당 회귀의 정규 Native 등록점.
//! 대형 Noori OOM과 별도 baseline 모듈 probe는 이 aggregator에 포함하지 않는다.
comptime {
    _ = @import("../model/history_stack_ssot_tests.zig");
    _ = @import("../hwpx/history_state_upgrade_tests.zig");
    _ = @import("../hwpx/display_resource_generation.zig");
    _ = @import("../hwpx/display_resource_generation_tests.zig");
    _ = @import("../hwpx/history_stack_resource_union_tests.zig");
    _ = @import("../hwpx/history_stack_resource_bind_tests.zig");
    _ = @import("../hwpx/history_full_allocator_tests.zig");
    _ = @import("../hwpx/history_full_allocator_real_tests.zig");
}
