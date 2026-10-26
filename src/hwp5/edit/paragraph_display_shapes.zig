//! Owned display values; semantic parsing remains in the DocInfo reader.
const std = @import("std");
const info = @import("../docinfo/reader.zig");
pub const Shape = struct {
    id: u32,
    alignment: u3,
    left: i32,
    right: i32,
    indent: i32,
    before: i32,
    after: i32,
    legacy_spacing_kind: u2,
    legacy_spacing: i32,
    modern_spacing: ?@import("../docinfo/para_shape.zig").ModernSpacing,
    heading_kind: u2 = 0,
    heading_id: u16 = 0,
    packed_heading_level: u3 = 0,
    extended_heading_level: ?u32 = null,
    heading_level: u32 = 0,
};

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, expected_count: usize) ![]Shape {
    if (expected_count > 100_000) return error.LimitExceeded;
    const output = try a.alloc(Shape, expected_count);
    errdefer a.free(output);
    var iterator = try info.Iterator.init(bytes, version, .{});
    var count: usize = 0;
    while (try iterator.next()) |record| {
        if (record.value != .para_shape) continue;
        if (count >= output.len) return error.ResourceCountMismatch;
        const shape = record.value.para_shape;
        output[count] = .{ .id = @intCast(count), .alignment = @truncate(shape.attributes >> 2), .left = shape.left, .right = shape.right, .indent = shape.indent, .before = shape.before, .after = shape.after, .legacy_spacing_kind = @truncate(shape.attributes), .legacy_spacing = shape.legacy_spacing, .modern_spacing = shape.modern_spacing };
        output[count].heading_kind = @truncate(shape.attributes >> 23);
        output[count].heading_id = shape.head_id;
        output[count].packed_heading_level = @truncate(shape.attributes >> 25);
        output[count].extended_heading_level = shape.level;
        output[count].heading_level = shape.effectiveLevel();
        count += 1;
    }
    if (count != output.len) return error.ResourceCountMismatch;
    return output;
}

fn allocationCase(a: std.mem.Allocator) !void {
    var bytes: [58]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 25 | (1 << 10) | (54 << 20), .little);
    std.mem.writeInt(u32, bytes[4..8], 3 << 2 | 2, .little);
    std.mem.writeInt(i32, bytes[16..20], -720, .little);
    std.mem.writeInt(i32, bytes[28..32], 160, .little);
    std.mem.writeInt(u32, bytes[50..54], 3, .little);
    const modern = try read(a, &bytes, .{ .raw = 0x05000205 }, 1);
    defer a.free(modern);
    try std.testing.expectEqual(@as(u3, 3), modern[0].alignment);
    try std.testing.expectEqual(@as(i32, -720), modern[0].indent);
    try std.testing.expectEqual(@as(i32, 160), modern[0].legacy_spacing);
    try std.testing.expectEqual(@as(u32, 3), modern[0].modern_spacing.?.attributes);
    try std.testing.expectEqual(@as(i32, 0), modern[0].modern_spacing.?.value);
    std.mem.writeInt(u32, bytes[0..4], 25 | (1 << 10) | (42 << 20), .little);
    const legacy = try read(a, bytes[0..46], .{ .raw = 0x05000000 }, 1);
    defer a.free(legacy);
    try std.testing.expect(legacy[0].modern_spacing == null);
    try std.testing.expectEqual(@as(u2, 2), legacy[0].legacy_spacing_kind);
}

test "HWP5 paragraph display preserves signed values and modern zero with allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWP5 paragraph display rejects counts framing and truncated input" {
    var bytes: [46]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 25 | (1 << 10) | (42 << 20), .little);
    const a = std.testing.allocator;
    const version: @import("../version.zig").Version = .{ .raw = 0x05000000 };
    try std.testing.expectError(error.ResourceCountMismatch, read(a, &bytes, version, 0));
    try std.testing.expectError(error.ResourceCountMismatch, read(a, &bytes, version, 2));
    try std.testing.expectError(error.LimitExceeded, read(a, &bytes, version, 100_001));
    for (0..bytes.len) |length| {
        if (read(a, bytes[0..length], version, 1)) |unexpected| {
            a.free(unexpected);
            return error.ExpectedFailure;
        } else |_| {}
    }
    bytes[1] &= ~@as(u8, 4);
    try std.testing.expectError(error.InvalidDocInfoLevel, read(a, &bytes, version, 1));
}
