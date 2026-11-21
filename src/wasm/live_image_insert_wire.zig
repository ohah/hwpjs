//! HWP5 metadata JSON. No caller-provided owner certification or source profile.
const std = @import("std");
pub const Wire = struct { start: u32, width: u32, height: u32 };
pub const Parsed = std.json.Parsed(Wire);
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !Parsed {
    if (bytes.len == 0 or bytes.len > 1024) return error.LimitExceeded;
    const root = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer root.deinit();
    if (root.value != .object or root.value.object.count() != 3) return error.InvalidImageInsertRequest;
    for ([_][]const u8{ "start", "width", "height" }) |key| {
        const v = root.value.object.get(key) orelse return error.InvalidImageInsertRequest;
        if (v != .integer or v.integer < 0 or v.integer > (if (std.mem.eql(u8, key, "start")) @as(i64, std.math.maxInt(u32)) else std.math.maxInt(i32))) return error.InvalidImageInsertRequest;
        if (!std.mem.eql(u8, key, "start") and v.integer == 0) return error.InvalidPictureInsertionSize;
    }
    return std.json.parseFromSlice(Wire, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
}
