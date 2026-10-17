//! Version-aware spacing patch; framing and resource insertion are separate.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Shape = @import("../docinfo/para_shape.zig").ParaShape;
pub const Spacing = @import("../../model/document.zig").ParagraphSpacing;

pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, spacing: Spacing, limit: usize) ![]u8 {
    if (spacing.kind > 3) return error.InvalidParagraphSpacing;
    if (input.len > limit) return error.LimitExceeded;
    const shape = try Shape.parse(input, version);
    if (shape.modern_spacing == null and spacing.kind == 3) return error.UnsupportedParagraphSpacing;
    const output = try a.dupe(u8, input);
    if (shape.modern_spacing) |modern| {
        std.mem.writeInt(u32, output[46..50], (modern.attributes & ~@as(u32, 31)) | spacing.kind, .little);
        std.mem.writeInt(i32, output[50..54], spacing.value, .little);
        // Percentage readers may select the legacy pair even with a modern tail.
        if (spacing.kind == 0) {
            std.mem.writeInt(u32, output[0..4], shape.attributes & ~@as(u32, 3), .little);
            std.mem.writeInt(i32, output[24..28], spacing.value, .little);
        }
    } else {
        std.mem.writeInt(u32, output[0..4], (shape.attributes & ~@as(u32, 3)) | spacing.kind, .little);
        std.mem.writeInt(i32, output[24..28], spacing.value, .little);
    }
    return output;
}

test "HWP5 paragraph spacing payload selects present version fields and preserves all other bytes" {
    const a = std.testing.allocator;
    for ([_]u32{ 0x05000000, 0x05000107, 0x05000205, 0x05010000 }) |raw| {
        const len: usize = if (raw >= 0x05000205) 62 else if (raw >= 0x05000107) 46 else 42;
        var input: [62]u8 = @splat(0xa5);
        const output = try write(a, input[0..len], .{ .raw = raw }, .{ .kind = 2, .value = 0 }, 100);
        defer a.free(output);
        var expected = input;
        if (raw >= 0x05000205) {
            std.mem.writeInt(u32, expected[46..50], 0xa5a5a5a2, .little);
            std.mem.writeInt(i32, expected[50..54], 0, .little);
        } else {
            std.mem.writeInt(u32, expected[0..4], 0xa5a5a5a6, .little);
            std.mem.writeInt(i32, expected[24..28], 0, .little);
        }
        try std.testing.expectEqualSlices(u8, expected[0..len], output);
    }
    var minimal: [42]u8 = @splat(0);
    try std.testing.expectError(error.UnsupportedParagraphSpacing, write(a, &minimal, .{ .raw = 0x05000205 }, .{ .kind = 3, .value = 100 }, 100));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const output = try write(allocator, bytes, .{ .raw = 0x05000000 }, .{ .kind = 1, .value = -720 }, 100);
            defer allocator.free(output);
        }
    }.run, .{&minimal});
}

test "HWP5 paragraph spacing percentage synchronizes both source fields only" {
    const a = std.testing.allocator;
    var input: [58]u8 = @splat(0xa5);
    for ([_]i32{ 0, 100, 160, 500 }) |value| {
        const output = try write(a, &input, .{ .raw = 0x05010000 }, .{ .kind = 0, .value = value }, 100);
        defer a.free(output);
        var expected = input;
        std.mem.writeInt(u32, expected[0..4], 0xa5a5a5a4, .little);
        std.mem.writeInt(i32, expected[24..28], value, .little);
        std.mem.writeInt(u32, expected[46..50], 0xa5a5a5a0, .little);
        std.mem.writeInt(i32, expected[50..54], value, .little);
        try std.testing.expectEqualSlices(u8, &expected, output);
    }
}
