//! 사전 ownership 검증과 무할당·실패 없는 commit만 소유한다. 예산 산식은 공통 stack이 소유한다.
pub fn Adapter(comptime E: type) type {
    return struct {
        pub const Upgrade = *E.CheckpointOwner;
        pub fn upgradeOwnedBytes(upgrade: ?Upgrade) usize {
            return if (upgrade) |owned| owned.ownedBytes() else 0;
        }
        pub fn validateUpgrade(current: *const E, upgrade: ?Upgrade) !void {
            if (upgrade) |owned| {
                if (current.checkpoint != null or owned.retained_by != null) return error.CheckpointAlreadyRetained;
            }
        }
        pub fn commitUpgrade(current: *E, upgrade: ?Upgrade) void {
            if (upgrade) |owned| current.attach(owned);
        }
    };
}
