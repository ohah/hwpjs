const std = @import("std");
const writer = @import("hwp5_table_creation_resources.zig");
const a = std.testing.allocator;
const Inventory = struct { paragraph: []u32, character: []u32, style: []u32, border_fill: []u32 };
fn owned(allocator: std.mem.Allocator) !void {
    const bytes = try writer.write(allocator, .{ .paragraphs = .{ .para_shapes = 2, .char_shapes = 3, .styles = 1 }, .border_count = 0 });
    defer allocator.free(bytes);
    const parsed = try std.json.parseFromSlice(Inventory, allocator, bytes, .{});
    defer parsed.deinit();
    try std.testing.expectEqualSlices(u32, &.{ 0, 1 }, parsed.value.paragraph);
    try std.testing.expectEqualSlices(u32, &.{ 0, 1, 2 }, parsed.value.character);
    try std.testing.expectEqualSlices(u32, &.{0}, parsed.value.style);
    try std.testing.expectEqualSlices(u32, &.{0}, parsed.value.border_fill);
}
test "HWP5 table resource inventory handles every allocation failure and explicit no-border" {
    try std.testing.checkAllAllocationFailures(a, owned, .{});
}
test "HWP5 table resource inventory limits IDs to serialized field widths" {
    const bytes = try writer.write(a, .{ .paragraphs = .{ .para_shapes = 70000, .char_shapes = 1, .styles = 300 }, .border_count = 70000 });
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(Inventory, a, bytes, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(@as(usize, 65536), parsed.value.paragraph.len);
    try std.testing.expectEqual(@as(usize, 256), parsed.value.style.len);
    try std.testing.expectEqual(@as(usize, 65536), parsed.value.border_fill.len);
    try std.testing.expectEqual(@as(u32, 65535), parsed.value.paragraph[65535]);
    try std.testing.expectEqual(@as(u32, 255), parsed.value.style[255]);
    try std.testing.expectEqual(@as(u32, 65535), parsed.value.border_fill[65535]);
}
