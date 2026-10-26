//! 관측된 취소선 종류0/1의 활성 비트만 변경하고 나머지 payload는 보존합니다.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub fn attributes(raw: u32, enabled: bool) !u32 {
    if (@import("character_decoration_compat.zig").legacyStrike(@truncate(raw >> 2), @truncate(raw >> 18)))
        return if (enabled) raw else raw & ~@as(u32, 3 << 2);
    if (((raw >> 18) & 7) > 1) return error.UnsupportedCharacterStrikeKind;
    const result = (raw & ~@as(u32, 7 << 18)) | (@as(u32, @intFromBool(enabled)) << 18);
    // Clearing the modern flag must not reinterpret an existing center bit
    // pattern as the legacy strike representation.
    return if (!enabled and @import("character_decoration_compat.zig").legacyStrike(@truncate(result >> 2), @truncate(result >> 18)))
        result & ~@as(u32, 3 << 2)
    else
        result;
}
pub fn write(a: std.mem.Allocator, bytes: []const u8, version: Version, enabled: bool, limit: usize) ![]u8 {
    const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(bytes, version);
    const kind = shape.strikeKindRaw();
    if (kind > 1) return error.UnsupportedCharacterStrikeKind;
    if (bytes.len > limit) return error.LimitExceeded;
    const output = try a.dupe(u8, bytes);
    const flags = try attributes(shape.attributes, enabled);
    std.mem.writeInt(u32, output[46..50], flags, .little);
    return output;
}

test "HWP5 strike payload preserves style color version tails and allocation failures" {
    const a = std.testing.allocator;
    for ([_]u32{ 0x05000000, 0x05000300 }) |raw| {
        var bytes: [74]u8 = @splat(0);
        const length: usize = if (raw == 0x05000000) 68 else 74;
        if (length == 74) std.mem.writeInt(u32, bytes[70..74], 0x123456, .little);
        for (0..16) |style| {
            const flags: u32 = (0xa5a55a5a & ~@as(u32, 7 << 18 | 15 << 26 | 3 << 2)) | (@as(u32, @intCast(style)) << 26);
            std.mem.writeInt(u32, bytes[46..50], flags, .little);
            const on = try write(a, bytes[0..length], .{ .raw = raw }, true, 100);
            defer a.free(on);
            try std.testing.expectEqual(flags | @as(u32, 1 << 18), std.mem.readInt(u32, on[46..50], .little));
            try std.testing.expectEqualSlices(u8, bytes[0..46], on[0..46]);
            try std.testing.expectEqualSlices(u8, bytes[50..length], on[50..]);
            const off = try write(a, on, .{ .raw = raw }, false, 100);
            defer a.free(off);
            try std.testing.expectEqualSlices(u8, bytes[0..length], off);
        }
    }
    const input: [68]u8 = @splat(0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try write(allocator, source, .{ .raw = 0x05000000 }, true, 100);
            defer allocator.free(output);
        }
    }.run, .{&input});
    try std.testing.expectError(error.LimitExceeded, write(a, &input, .{ .raw = 0x05000000 }, true, 67));
    for (2..8) |kind| {
        var unknown = input;
        std.mem.writeInt(u32, unknown[46..50], @as(u32, @intCast(kind)) << 18, .little);
        try std.testing.expectError(error.UnsupportedCharacterStrikeKind, write(a, &unknown, .{ .raw = 0x05000000 }, false, 100));
    }
}
