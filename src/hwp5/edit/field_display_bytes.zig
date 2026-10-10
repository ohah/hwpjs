//! Plain UTF-16 derived label preparation; control markers stay byte-exact.
const std = @import("std");
pub fn validateLabel(label: []const u8) !void {
    var at: usize = 0;
    while (try @import("../../text/scalars.zig").read(label, at, .utf16le)) |scalar| {
        if (scalar.value < 32) return error.UnsupportedDerivedLabelControl;
        at = scalar.end;
    }
}
pub fn prepare(a: std.mem.Allocator, before: []const u8, start_unit: u32, end_unit: u32, label: []const u8) ![]u8 {
    try @import("control_boundaries.zig").validate(before, start_unit, end_unit);
    try validateLabel(label);
    const start = @as(usize, start_unit) * 2;
    const end = @as(usize, end_unit) * 2;
    const length = std.math.add(usize, before.len - (end - start), label.len) catch return error.LimitExceeded;
    if (length > 8 * 1024 * 1024) return error.LimitExceeded;
    const output = try a.alloc(u8, length);
    @memcpy(output[0..start], before[0..start]);
    @memcpy(output[start..][0..label.len], label);
    @memcpy(output[start + label.len ..], before[end..]);
    return output;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const before = [_]u8{ 'a', 0, 13, 0 };
    const output = try prepare(a, &before, 0, 1, &.{ 'b', 0 });
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, &.{ 'b', 0, 13, 0 }, output);
}

test "derived field display preserves paragraph terminator with allocation failures and strict Unicode" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
    try std.testing.expectError(error.UnsupportedDerivedLabelControl, validateLabel(&.{ 13, 0 }));
    try std.testing.expectError(error.UnexpectedEnd, validateLabel(&.{'a'}));
    try std.testing.expectError(error.InvalidUnicodeEncoding, validateLabel(&.{ 0, 0xdc }));
    try std.testing.expectError(error.UnexpectedEnd, validateLabel(&.{ 0, 0xd8 }));
    const before = [_]u8{ 0x3d, 0xd8, 0, 0xde, 13, 0 };
    try std.testing.expectError(error.SplitSurrogatePair, prepare(std.testing.allocator, &before, 0, 1, &.{ 'a', 0 }));
    try std.testing.expectError(error.InvalidTextPosition, prepare(std.testing.allocator, &before, 0, 3, &.{ 'a', 0 }));
}
