//! HPS2 scalar resources; no parsing or layout policy.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, shapes: anytype) ![]u8 {
    if (shapes.len > 100_000) return error.LimitExceeded;
    const bytes = try a.alloc(u8, 8 + shapes.len * 72);
    errdefer a.free(bytes);
    @memcpy(bytes[0..4], "HPS2");
    std.mem.writeInt(u32, bytes[4..8], @intCast(shapes.len), .little);
    for (shapes, 0..) |shape, index| {
        if (shape.id != index) return error.InvalidParagraphShapes;
        const row = bytes[8 + index * 72 ..][0..72];
        std.mem.writeInt(u32, row[0..4], shape.id, .little);
        std.mem.writeInt(u32, row[4..8], shape.alignment, .little);
        const values = [_]i32{ shape.left, shape.right, shape.indent, shape.before, shape.after };
        for (values, 0..) |value, field| std.mem.writeInt(i32, row[8 + field * 4 ..][0..4], value, .little);
        std.mem.writeInt(u32, row[28..32], shape.legacy_spacing_kind, .little);
        std.mem.writeInt(i32, row[32..36], shape.legacy_spacing, .little);
        std.mem.writeInt(u32, row[36..40], @intFromBool(shape.modern_spacing != null), .little);
        std.mem.writeInt(u32, row[40..44], if (shape.modern_spacing) |value| value.attributes else 0, .little);
        std.mem.writeInt(i32, row[44..48], if (shape.modern_spacing) |value| value.value else 0, .little);
        std.mem.writeInt(u32, row[48..52], shape.heading_kind, .little);
        std.mem.writeInt(u32, row[52..56], shape.heading_id, .little);
        std.mem.writeInt(u32, row[56..60], shape.packed_heading_level, .little);
        std.mem.writeInt(u32, row[60..64], @intFromBool(shape.extended_heading_level != null), .little);
        std.mem.writeInt(u32, row[64..68], shape.extended_heading_level orelse 0, .little);
        std.mem.writeInt(u32, row[68..72], shape.heading_level, .little);
    }
    return bytes;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const Shape = @import("../hwp5/edit/paragraph_display_shapes.zig").Shape;
    const shapes = [_]Shape{.{ .id = 0, .alignment = 7, .left = 0, .right = 0, .indent = -720, .before = 0, .after = 0, .legacy_spacing_kind = 2, .legacy_spacing = 160, .modern_spacing = .{ .attributes = 3, .value = 0 } }};
    const bytes = try encode(a, &shapes);
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 80), bytes.len);
    try std.testing.expectEqual(@as(i32, -720), std.mem.readInt(i32, bytes[24..28], .little));
    try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, bytes[44..48], .little));
    try std.testing.expectEqual(@as(i32, 0), std.mem.readInt(i32, bytes[52..56], .little));
}
test "HWP5 paragraph shapes wire preserves signed and optional zero with allocation failures" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
