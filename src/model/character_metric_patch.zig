//! 언어 순서와 요청한 값만 소유합니다. 원본 누락을 기본값으로 채우지 않습니다.
const std = @import("std");
pub const Values = [7]?i32;
pub const names = .{ "ratio", "char_spacing", "relative_size", "offset" };
pub fn bounds(comptime name: []const u8) struct { low: i32, high: i32 } {
    if (comptime std.mem.eql(u8, name, "ratio")) return .{ .low = 50, .high = 200 };
    if (comptime std.mem.eql(u8, name, "char_spacing")) return .{ .low = -50, .high = 50 };
    if (comptime std.mem.eql(u8, name, "relative_size")) return .{ .low = 10, .high = 250 };
    return .{ .low = -100, .high = 100 };
}
pub fn validate(patch: anytype) !void {
    inline for (names) |name| if (@field(patch, name)) |values| {
        const range = comptime bounds(name);
        for (values) |value| if (value) |v| if (v < range.low or v > range.high) return error.InvalidCharacterMetric;
    };
}
pub fn merge(before: Values, requested: Values) Values {
    var result = before;
    for (requested, 0..) |value, i| if (value) |v| {
        result[i] = v;
    };
    return result;
}
pub fn has(patch: anytype) bool {
    inline for (names) |name| if (@field(patch, name)) |values| {
        for (values) |value| if (value != null) return true;
    };
    return false;
}
pub fn matches(current: anytype, patch: anytype) bool {
    inline for (.{ .{ "ratio", "ratio" }, .{ "char_spacing", "spacing" }, .{ "relative_size", "relativeSize" }, .{ "offset", "offset" } }) |pair| {
        if (@field(patch, pair[0])) |values| {
            const observed = @field(current, pair[1]);
            const source = if (@typeInfo(@TypeOf(observed)) == .optional) observed orelse return false else observed;
            for (values, source) |requested, existing| if (requested) |value| {
                const raw = if (@typeInfo(@TypeOf(existing)) == .optional) existing orelse return false else existing;
                if (value != raw) return false;
            };
        }
    }
    return true;
}
