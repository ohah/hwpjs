//! Signed paragraph geometry patch; absent fields preserve original bytes.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Patch = @import("../../model/document.zig").ParagraphMarginPatch;
pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, patch: Patch, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    _ = try @import("../docinfo/para_shape.zig").ParaShape.parse(input, version);
    const output = try a.dupe(u8, input);
    inline for (std.meta.fields(Patch), 0..) |field, index| {
        if (@field(patch, field.name)) |value| std.mem.writeInt(i32, output[4 + index * 4 ..][0..4], value, .little);
    }
    return output;
}

test "HWP5 paragraph margin payload preserves absent values and version tails" {
    const a = std.testing.allocator;
    var input: [65]u8 = @splat(0xa5);
    for ([_]u32{ 0x05000000, 0x05000107, 0x05000205, 0x05010000 }) |raw| {
        const output = try write(a, &input, .{ .raw = raw }, .{ .indent = std.math.minInt(i32), .right = 0, .after = std.math.maxInt(i32) }, 100);
        defer a.free(output);
        var expected = input;
        std.mem.writeInt(i32, expected[8..12], 0, .little);
        std.mem.writeInt(i32, expected[12..16], std.math.minInt(i32), .little);
        std.mem.writeInt(i32, expected[20..24], std.math.maxInt(i32), .little);
        try std.testing.expectEqualSlices(u8, &expected, output);
        const no_op = try write(a, &input, .{ .raw = raw }, .{}, 100);
        defer a.free(no_op);
        try std.testing.expectEqualSlices(u8, &input, no_op);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try write(allocator, source, .{ .raw = 0x05010000 }, .{ .left = -720, .before = 0 }, 100);
            defer allocator.free(output);
            const shape = try @import("../docinfo/para_shape.zig").ParaShape.parse(output, .{ .raw = 0x05010000 });
            try std.testing.expectEqual(@as(i32, -720), shape.left);
            try std.testing.expectEqual(@as(i32, 0), shape.before);
            try std.testing.expectEqualSlices(u8, source[24..], output[24..]);
        }
    }.run, .{&input});
    try std.testing.expectError(error.LimitExceeded, write(a, &input, .{ .raw = 0x05000000 }, .{}, 1));
    try std.testing.expectError(error.UnexpectedEnd, write(a, input[0..41], .{ .raw = 0x05000000 }, .{}, 100));
}
