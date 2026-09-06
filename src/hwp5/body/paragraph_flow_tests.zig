const std = @import("std");
const t = std.testing;
const Flows = @import("paragraph_flows.zig").Flows;
fn fixture(a: std.mem.Allocator) ![]u8 {
    var b: std.ArrayList(u8) = .empty;
    errdefer b.deinit(a);
    const rows = [_][3]u32{ .{ 66, 0, 0 }, .{ 255, 1, 0 }, .{ 72, 2, 2 }, .{ 66, 2, 0 }, .{ 255, 3, 0 }, .{ 72, 4, 1 }, .{ 66, 4, 0 }, .{ 66, 2, 0 }, .{ 72, 2, 0 }, .{ 72, 2, 1 }, .{ 66, 2, 0 }, .{ 66, 0, 0 } };
    for (rows) |row| {
        const len: u32 = if (row[0] == 66) 24 else if (row[0] == 72) 8 else 0;
        var header: [4]u8 = undefined;
        std.mem.writeInt(u32, &header, row[0] | (row[1] << 10) | (len << 20), .little);
        try b.appendSlice(a, &header);
        var payload = [_]u8{0} ** 24;
        payload[0] = @intCast(row[2]);
        try b.appendSlice(a, payload[0..len]);
    }
    return b.toOwnedSlice(a);
}
fn exercise(a: std.mem.Allocator) !void {
    const b = try fixture(a);
    defer a.free(b);
    var tree = try @import("tree.zig").Tree.parse(a, b, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var flows = try Flows.build(a, tree, groups.items);
    defer flows.deinit(a);
    for ([_][2]usize{ .{ 0, 0 }, .{ 3, 2 }, .{ 6, 5 }, .{ 7, 2 }, .{ 10, 9 }, .{ 11, 0 } }) |row| try t.expectEqual(row[1], try flows.get(row[0]));
    try t.expectError(error.InvalidParagraphNode, flows.get(2));
    try t.expectError(error.InvalidParagraphNode, flows.get(std.math.maxInt(usize)));
}
test "paragraph flows preserve outer continuation across nested and empty lists with OOM cleanup" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "paragraph flows reject missing duplicate and invalid supplied groups" {
    const b = try fixture(t.allocator);
    defer t.allocator.free(b);
    var tree = try @import("tree.zig").Tree.parse(t.allocator, b, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(t.allocator);
    var groups = try @import("list_groups.zig").Groups.build(t.allocator, tree);
    defer groups.deinit(t.allocator);
    try t.expectError(error.MissingParagraphFlow, Flows.build(t.allocator, tree, &.{}));
    try t.expectError(error.DuplicateParagraphFlow, Flows.build(t.allocator, tree, &.{ groups.items[0], groups.items[0] }));
    var bad = groups.items[0];
    bad.end = std.math.maxInt(usize);
    try t.expectError(error.InvalidFlowGroup, Flows.build(t.allocator, tree, &.{bad}));
}
