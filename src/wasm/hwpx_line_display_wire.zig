const std = @import("std");
const Snapshot = @import("../hwpx/line_display_snapshot.zig").Snapshot;

pub fn encode(a: std.mem.Allocator, row: Snapshot) ![]u8 {
    if (row.paragraph == 0) return error.InvalidLineDisplay;
    var ids: [4]u32 = undefined;
    for ([_]usize{ row.node, row.paragraph, row.anchor_node, row.anchor_unit }, &ids) |value, *id| id.* = std.math.cast(u32, value) orelse return error.LimitExceeded;
    for (row.endpoints) |point| for (point) |number| if (!std.math.isFinite(number)) return error.InvalidLineDisplay;
    if ((row.stroke.color orelse 0) > 0xffffff or (row.stroke.style orelse 0) > 1) return error.InvalidLineDisplay;
    const bytes = try a.alloc(u8, 72);
    @memset(bytes, 0);
    std.mem.writeInt(u32, bytes[0..4], 0x32444c48, .little);
    for (ids, 0..) |id, index| std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], id, .little);
    for (row.endpoints, 0..) |point, index| for (point, 0..) |number, axis| std.mem.writeInt(u64, bytes[24 + (index * 2 + axis) * 8 ..][0..8], @bitCast(number), .little);
    var flags: u32 = 0;
    for ([_]?u32{ row.stroke.color, row.stroke.width, row.stroke.style }, 0..) |value, index| {
        if (value) |present| {
            flags |= @as(u32, 1) << @intCast(index);
            std.mem.writeInt(u32, bytes[60 + index * 4 ..][0..4], present, .little);
        }
    }
    std.mem.writeInt(u32, bytes[56..60], flags, .little);
    return bytes;
}

pub fn encodeNodes(a: std.mem.Allocator, nodes: []const u32) ![]u8 {
    for (nodes, 0..) |node, index| if (index > 0 and node <= nodes[index - 1]) return error.InvalidLineNodes;
    const size = std.math.add(usize, 8, std.math.mul(usize, nodes.len, 4) catch return error.LimitExceeded) catch return error.LimitExceeded;
    const count = std.math.cast(u32, nodes.len) orelse return error.LimitExceeded;
    const bytes = try a.alloc(u8, size);
    std.mem.writeInt(u32, bytes[0..4], 0x314e4c48, .little);
    std.mem.writeInt(u32, bytes[4..8], count, .little);
    for (nodes, 0..) |node, index| std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], node, .little);
    return bytes;
}

test "HWPX line display wire validates scalars finite points and allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try encode(allocator, .{ .node = 7, .paragraph = 1, .anchor_node = 7, .anchor_unit = 0, .endpoints = .{ .{ 0, -1 }, .{ 2.5, 3 } } });
            defer allocator.free(bytes);
            try std.testing.expectEqual(@as(usize, 72), bytes.len);
            try std.testing.expectEqual(@as(u32, 0x32444c48), std.mem.readInt(u32, bytes[0..4], .little));
            const nodes = try encodeNodes(allocator, &.{ 7, 9 });
            defer allocator.free(nodes);
            try std.testing.expectEqual(@as(usize, 16), nodes.len);
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidLineDisplay, encode(a, .{ .node = 7, .paragraph = 0, .anchor_node = 7, .anchor_unit = 0, .endpoints = .{ .{ 0, 0 }, .{ 0, 0 } } }));
    try std.testing.expectError(error.InvalidLineDisplay, encode(a, .{ .node = 7, .paragraph = 1, .anchor_node = 7, .anchor_unit = 0, .endpoints = .{ .{ std.math.nan(f64), 0 }, .{ 0, 0 } } }));
    try std.testing.expectError(error.InvalidLineNodes, encodeNodes(a, &.{ 7, 7 }));
}
