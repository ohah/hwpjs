//! UTF-16 selection coordinates over owned/borrowed UTF-8, without format policy.
const std = @import("std");

fn byteOffset(text: []const u8, point: u32) !usize {
    var offset: usize = 0;
    var units: u32 = 0;
    while (units < point) {
        const scalar = (try @import("scalars.zig").read(text, offset, .utf8)) orelse return error.InvalidTextPosition;
        const width: u32 = if (scalar.value > 0xffff) 2 else 1;
        units = std.math.add(u32, units, width) catch return error.LimitExceeded;
        if (units > point) return error.SplitSurrogatePair;
        offset = scalar.end;
    }
    return offset;
}

pub fn replace(a: std.mem.Allocator, text: []const u8, start: u32, end: u32, inserted: []const u8, limit: usize) ![]u8 {
    if (start > end) return error.InvalidTextPosition;
    if (!std.unicode.utf8ValidateSlice(text) or !std.unicode.utf8ValidateSlice(inserted)) return error.InvalidUnicodeEncoding;
    const first = try byteOffset(text, start);
    const last = try byteOffset(text, end);
    const length = std.math.add(usize, text.len - (last - first), inserted.len) catch return error.LimitExceeded;
    if (length > limit) return error.LimitExceeded;
    const out = try a.alloc(u8, length);
    @memcpy(out[0..first], text[0..first]);
    @memcpy(out[first..][0..inserted.len], inserted);
    @memcpy(out[first + inserted.len ..], text[last..]);
    return out;
}

test "UTF8 splice uses UTF16 scalar positions and handles aliased input and exact budgets" {
    const a = std.testing.allocator;
    const text = "a😀한";
    const output = try replace(a, text, 1, 3, "둘\n", 8);
    defer a.free(output);
    try std.testing.expectEqualStrings("a둘\n한", output);
    try std.testing.expectError(error.LimitExceeded, replace(a, text, 1, 3, "둘\n", 7));
    try std.testing.expectError(error.SplitSurrogatePair, replace(a, text, 2, 3, "", 100));
    try std.testing.expectError(error.SplitSurrogatePair, replace(a, text, 1, 2, "", 100));
    try std.testing.expectError(error.InvalidTextPosition, replace(a, text, 0, 5, "", 100));
    try std.testing.expectError(error.InvalidTextPosition, replace(a, text, 3, 1, "", 100));
    try std.testing.expectError(error.InvalidUnicodeEncoding, replace(a, &.{255}, 0, 0, "", 100));
    try std.testing.expectError(error.InvalidUnicodeEncoding, replace(a, text, 0, 0, &.{255}, 100));
    const aliased = try replace(a, text, 1, 3, text[5..], 100);
    defer a.free(aliased);
    try std.testing.expectEqualStrings("a한한", aliased);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try replace(allocator, "a😀한", 1, 3, "둘\n", 8);
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings("a둘\n한", bytes);
        }
    }.run, .{});
}
