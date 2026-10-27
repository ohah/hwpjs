//! 그림자 field의 sparse intent만 소유합니다. 원본 상태와 기본값을 혼합하지 않습니다.
const std = @import("std");
pub const Kind = enum(u2) { none, drop, continuous };
pub const Patch = struct { kind: ?Kind = null, offset_x: ?i32 = null, offset_y: ?i32 = null, color: ?u32 = null };
pub const Value = struct { kind_raw: u2, offset_x: i32, offset_y: i32, color_raw: u32 };
pub fn has(patch: Patch) bool {
    return patch.kind != null or patch.offset_x != null or patch.offset_y != null or patch.color != null;
}
pub fn validate(patch: Patch) !void {
    for ([_]?i32{ patch.offset_x, patch.offset_y }) |value| if (value) |v| if (v < -100 or v > 100) return error.InvalidCharacterShadowOffset;
    if (patch.color) |value| try @import("rgb_color.zig").validate(value);
}
pub fn merge(before: Patch, requested: Patch) Patch {
    var result = before;
    inline for (@import("../reflection.zig").fields(Patch)) |field| if (@field(requested, field.name)) |value| {
        @field(result, field.name) = value;
    };
    return result;
}
pub fn complete(patch: Patch) bool {
    return patch.kind != null and patch.offset_x != null and patch.offset_y != null and patch.color != null;
}
pub fn matches(value: ?Value, patch: Patch) bool {
    if (!has(patch)) return true;
    const current = value orelse return false;
    if (current.kind_raw == 3) return false;
    return (patch.kind == null or @backingInt(patch.kind.?) == current.kind_raw) and (patch.offset_x == null or patch.offset_x.? == current.offset_x) and (patch.offset_y == null or patch.offset_y.? == current.offset_y) and (patch.color == null or (current.color_raw <= 0xffffff and patch.color.? == @import("rgb_color.zig").hwp5(current.color_raw)));
}
