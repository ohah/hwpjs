const std = @import("std");
fn record(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var header: [4]u8 = undefined;
    std.mem.writeInt(u32, &header, tag | level << 10 | @as(u32, @intCast(payload.len)) << 20, .little);
    try out.appendSlice(a, &header);
    try out.appendSlice(a, payload);
}
fn paragraph(a: std.mem.Allocator, out: *std.ArrayList(u8), level: u32, count: usize) !void {
    var header = @as([22]u8, @splat(0));
    std.mem.writeInt(u32, header[0..4], @intCast(count * 8 + 1), .little);
    try record(a, out, 66, level, &header);
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    for (0..count) |_| {
        var token = @as([16]u8, @splat(0));
        std.mem.writeInt(u16, token[0..2], 17, .little);
        std.mem.writeInt(u32, token[2..6], @import("../body/control_rules.zig").id("fn  "), .little);
        std.mem.writeInt(u16, token[14..16], 17, .little);
        try text.appendSlice(a, &token);
    }
    try text.appendSlice(a, &.{ 13, 0 });
    try record(a, out, 67, level + 1, text.items);
}
fn note(a: std.mem.Allocator, out: *std.ArrayList(u8), level: u32) !void {
    var control = @as([16]u8, @splat(0));
    std.mem.writeInt(u32, control[0..4], @import("../body/control_rules.zig").id("fn  "), .little);
    std.mem.writeInt(u32, control[4..8], 1, .little);
    try record(a, out, 71, level, &control);
    var list = @as([8]u8, @splat(0));
    std.mem.writeInt(u16, list[0..2], 1, .little);
    try record(a, out, 72, level + 1, &list);
}
test "HWP5 note sources nested link order regression and independent cursor negative control" {
    const a = std.testing.allocator;
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try paragraph(a, &raw, 0, 2);
    try note(a, &raw, 1);
    try paragraph(a, &raw, 2, 1);
    try note(a, &raw, 3);
    try paragraph(a, &raw, 4, 0);
    try note(a, &raw, 1);
    try paragraph(a, &raw, 2, 0);
    const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw.items, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), links.items.len);
    try std.testing.expectEqual(@as(usize, 2), links.items[0].control_node);
    try std.testing.expectEqual(@as(usize, 10), links.items[1].control_node);
    try std.testing.expectEqual(@as(usize, 6), links.items[2].control_node);
    var wrong: @import("../body/list_groups.zig").OwnerCursor = .{ .groups = groups.items };
    try std.testing.expectEqual(@as(usize, 1), wrong.take(2).len);
    try std.testing.expectEqual(@as(usize, 1), wrong.take(10).len);
    try std.testing.expectEqual(@as(usize, 0), wrong.take(6).len);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw.items});
    defer document.deinit(a);
    const rows = try @import("note_sources.zig").read(a, raw.items, version, document.sections[0].paragraphs);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 3), rows.len);
    for (rows, [_]usize{ 2, 6, 10 }, [_]usize{ 0, 1, 0 }) |row, control, owner| {
        try std.testing.expectEqual(control, row.control_node);
        try std.testing.expectEqual(owner, row.paragraph);
    }
}
