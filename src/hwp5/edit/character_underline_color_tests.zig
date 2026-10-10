const std = @import("std");
const payload = @import("character_property_payload.zig");
test "HWP5 underline color changes only four bytes across versions with unknown kind retained" {
    const a = std.testing.allocator;
    var input: [79]u8 = @splat(0xa5);
    std.mem.writeInt(u32, input[46..50], 0xabcdefab, .little);
    for ([_]u32{ 0x05000000, 0x05000201, 0x05000300, 0x05010000 }) |raw| {
        const output = try payload.write(a, &input, .{ .raw = raw }, .{ .underline_color = 0x123456 }, 100);
        defer a.free(output);
        var expected = input;
        std.mem.writeInt(u32, expected[56..60], 0x563412, .little);
        try std.testing.expectEqualSlices(u8, &expected, output);
        try std.testing.expectEqual(@as(u2, 2), (try @import("../docinfo/char_shape.zig").CharShape.parse(output, .{ .raw = raw })).underlineKindRaw());
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: []const u8) !void {
            const output = try payload.write(allocator, original, .{ .raw = 0x05010000 }, .{ .underline_color = 0 }, 100);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, output[56..60], .little));
            try std.testing.expectEqualSlices(u8, original[0..56], output[0..56]);
            try std.testing.expectEqualSlices(u8, original[60..], output[60..]);
        }
    }.run, .{&input});
    try std.testing.expectError(error.InvalidCharacterColor, payload.write(a, &input, .{ .raw = 0x05010000 }, .{ .underline_color = 0x1000000 }, 100));
}
