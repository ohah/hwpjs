//! HWPX는 소유권 승격 adapter만 선택한다. 계획/commit/퇴출 구현은 공통 SSOT다.
const generic = @import("../model/history_budget_stack.zig");
const upgrade = @import("history_state_upgrade.zig");
pub fn Stack(comptime E: type) type {
    return generic.StackWithAdapter(E, upgrade.Adapter(E));
}
