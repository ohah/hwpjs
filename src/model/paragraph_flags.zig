//! 저장 문단 flag의 명시 bool만 소유합니다. null은 원본 변경 없음입니다.
pub const Patch = struct { grid: ?bool = null, border_connect: ?bool = null };
pub const Value = struct { grid: ?bool = null, border_connect: ?bool = null };
pub fn has(patch: Patch) bool {
    return patch.grid != null or patch.border_connect != null;
}
pub fn merge(before: Patch, requested: Patch) Patch {
    return .{ .grid = requested.grid orelse before.grid, .border_connect = requested.border_connect orelse before.border_connect };
}
pub fn matches(value: Value, patch: Patch) bool {
    return (patch.grid == null or patch.grid == value.grid) and (patch.border_connect == null or patch.border_connect == value.border_connect);
}
