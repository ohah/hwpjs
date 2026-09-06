const std = @import("std");
const t = std.testing;
const Tree = @import("tree.zig").Tree;
const Links = @import("control_links.zig").Links;
fn fixture() [80]u8 {
    var bytes = [_]u8{0} ** 80;
    std.mem.writeInt(u32, bytes[0..4], 66 | (24 << 20), .little);
    std.mem.writeInt(u32, bytes[28..32], 67 | (1 << 10) | (32 << 20), .little);
    for ([_]usize{ 32, 48 }) |start| {
        std.mem.writeInt(u16, bytes[start..][0..2], 11, .little);
        std.mem.writeInt(u32, bytes[start + 2 ..][0..4], 77, .little);
        std.mem.writeInt(u16, bytes[start + 14 ..][0..2], 11, .little);
    }
    for ([_]usize{ 64, 72 }) |start| {
        std.mem.writeInt(u32, bytes[start..][0..4], 71 | (1 << 10) | (4 << 20), .little);
        std.mem.writeInt(u32, bytes[start + 4 ..][0..4], 77, .little);
    }
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = fixture();
    var tree = try Tree.parse(a, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var links = try Links.build(a, tree);
    defer links.deinit(a);
    try t.expectEqual(2, links.items.len);
    try t.expectEqual(0, links.items[0].paragraph_node);
    try t.expectEqual(1, links.items[0].text_node);
    try t.expectEqual(2, links.items[0].control_node);
    try t.expectEqual(3, links.items[1].control_node);
    try t.expectEqual(8, links.items[1].start_unit);
}
test "control links preserve repeated ID occurrence and release all allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
}
test "control link late mismatch cleans partially built links" {
    var bytes = fixture();
    bytes[76] = 88;
    var tree = try Tree.parse(t.allocator, &bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(t.allocator);
    try t.expectError(error.ControlIdMismatch, Links.build(t.allocator, tree));
}
