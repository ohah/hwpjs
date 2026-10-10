//! HWP5 underline position only; leave line style, color, and version tails intact.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Kind = enum(u2) { none = 0, bottom = 1, top = 3 };
pub fn attributes(input: u32, kind: Kind) u32 {
    return (input & ~@as(u32, 0x0c)) | (@as(u32, @intFromEnum(kind)) << 2);
}

pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, kind: ?Kind, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(input, version);
    const output = try a.dupe(u8, input);
    if (kind) |value| {
        std.mem.writeInt(u32, output[46..50], attributes(shape.attributes, value), .little);
    }
    return output;
}

test "HWP5 underline payload preserves every unrelated byte and version tail" {
    const a = std.testing.allocator;
    const input: [79]u8 = @splat(0xa5);
    for ([_]u32{ 0x05000000, 0x05000201, 0x05000300, 0x05010000 }) |raw| {
        for ([_]?Kind{ null, .none, .bottom, .top }) |kind| {
            const output = try write(a, &input, .{ .raw = raw }, kind, 100);
            defer a.free(output);
            var expected = input;
            if (kind) |value| expected[46] = (expected[46] & ~@as(u8, 0x0c)) | (@as(u8, @intFromEnum(value)) << 2);
            try std.testing.expectEqualSlices(u8, &expected, output);
            const repeated = try write(a, output, .{ .raw = raw }, kind, 100);
            defer a.free(repeated);
            try std.testing.expectEqualSlices(u8, output, repeated);
        }
    }
    var undocumented = input;
    undocumented[46] = (undocumented[46] & ~@as(u8, 0x0c)) | 8;
    const kept = try write(a, &undocumented, .{ .raw = 0x05010000 }, null, 100);
    defer a.free(kept);
    try std.testing.expectEqualSlices(u8, &undocumented, kept);
    try std.testing.expectError(error.LimitExceeded, write(a, &input, .{ .raw = 0x05010000 }, .bottom, 78));
    for (0..68) |length| try std.testing.expectError(error.UnexpectedEnd, write(a, input[0..length], .{ .raw = 0x05000000 }, .bottom, 100));
}

test "HWP5 underline payload allocation failure does not change source" {
    const input: [79]u8 = @splat(0xa5);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            const output = try write(a, source, .{ .raw = 0x05010000 }, .top, 100);
            defer a.free(output);
            try std.testing.expectEqual(@as(u8, 0xad), output[46]);
            try std.testing.expectEqualSlices(u8, source[47..], output[47..]);
            try std.testing.expectEqualSlices(u8, source[0..46], output[0..46]);
        }
    }.run, .{&input});
    for (input) |value| try std.testing.expectEqual(@as(u8, 0xa5), value);
}
