const std = @import("std");
const t = std.testing;
const linked = @import("form_links.zig");
const Tree = @import("tree.zig").Tree;
const rules = @import("control_rules.zig");
fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var h: [4]u8 = undefined;
    std.mem.writeInt(u32, &h, tag | (level << 10) | (@as(u32, @intCast(payload.len)) << 20), .little);
    try out.appendSlice(a, &h);
    try out.appendSlice(a, payload);
}
fn collect(a: std.mem.Allocator, bytes: []const u8) !linked.Report {
    var tree = try Tree.parse(a, bytes, .{ .raw = 0x05000300 }, .{});
    defer tree.deinit(a);
    return linked.collectObservedUnits(a, tree, .{});
}
fn exercise(a: std.mem.Allocator, late: bool) !void {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    var ctrl = [_]u8{0} ** 44;
    std.mem.writeInt(u32, ctrl[0..4], rules.form_id, .little);
    var object = [_]u8{0} ** 30;
    @memcpy(object[0..4], "tbp+");
    @memcpy(object[4..8], "tbp+");
    object[8] = 8;
    object[12] = 8;
    for ("A:int:1 ", 0..) |c, i| object[14 + i * 2] = c;
    for (0..12) |i| {
        var token = [_]u8{0xff} ** 16;
        const code: u16 = if (late and i == 11) 12 else 11;
        std.mem.writeInt(u16, token[0..2], code, .little);
        std.mem.writeInt(u32, token[2..6], rules.form_id, .little);
        std.mem.writeInt(u16, token[14..16], code, .little);
        try frame(a, &bytes, 66, 0, &([_]u8{0} ** 24));
        try frame(a, &bytes, 67, 1, &token);
        try frame(a, &bytes, 71, 1, &ctrl);
        try frame(a, &bytes, 91, 2, &object);
    }
    const original = try a.dupe(u8, bytes.items);
    defer a.free(original);
    var report = collect(a, bytes.items) catch |err| {
        try t.expectEqualSlices(u8, original, bytes.items);
        if (late and err == error.FormControlCodeMismatch) return;
        return err;
    };
    defer report.deinit(a);
    try t.expect(!late);
    try t.expectEqualSlices(u8, original, bytes.items);
    try t.expectEqual(@as(usize, 12), report.links.len);
    for (report.links, report.forms.forms, 0..) |link, form, i| {
        try t.expectEqual(i * 4 + 2, link.control_node);
        try t.expectEqual(form.control_node, link.control_node);
        try t.expectEqual(@as(u16, 11), link.code);
        try t.expectEqualSlices(u8, &.{ '1', 0 }, form.properties.nodes[0].property.value);
    }
}
test "linked forms retain borrowed payloads and clean successful and late failing allocations" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
