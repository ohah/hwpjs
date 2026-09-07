const std = @import("std");
const t = std.testing;
const form = @import("form_control.zig");
const Tree = @import("tree.zig").Tree;
const rules = @import("control_rules.zig");
fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, bytes: []const u8) !void {
    var h: [4]u8 = undefined;
    std.mem.writeInt(u32, &h, tag | (level << 10) | (@as(u32, @intCast(bytes.len)) << 20), .little);
    try out.appendSlice(a, &h);
    try out.appendSlice(a, bytes);
}
fn fixture(a: std.mem.Allocator) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var ctrl = [_]u8{0} ** 46;
    std.mem.writeInt(u32, ctrl[0..4], rules.form_id, .little);
    std.mem.writeInt(i32, ctrl[8..12], -17, .little);
    std.mem.writeInt(u32, ctrl[16..20], 0xfffffffe, .little);
    var payload = [_]u8{0} ** 30;
    @memcpy(payload[0..4], "tbp+");
    @memcpy(payload[4..8], "tbp+");
    payload[8] = 8;
    payload[12] = 8;
    for ("A:int:1 ", 0..) |c, i| payload[14 + i * 2] = c;
    for (0..12) |i| {
        try frame(a, &out, 66, 0, &([_]u8{0} ** 24));
        try frame(a, &out, 71, 1, &ctrl);
        if (i == 0) try frame(a, &out, 255, 2, &.{});
        try frame(a, &out, @import("form_object.zig").tag, 2, &payload);
    }
    return out.toOwnedSlice(a);
}
fn collect(a: std.mem.Allocator, bytes: []const u8, options: form.Options) !form.Report {
    var tree = try Tree.parse(a, bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    return form.collectObservedUnits(a, tree, options);
}
fn exercise(a: std.mem.Allocator, late: bool) !void {
    const bytes = try fixture(a);
    defer a.free(bytes);
    const original = try a.dupe(u8, bytes);
    defer a.free(original);
    var report = collect(a, bytes, .{ .properties = .{ .max_nodes = if (late) 11 else 12 } }) catch |err| {
        if (late and err == error.FormPropertyNodeLimit) return;
        return err;
    };
    defer report.deinit(a);
    try t.expect(!late);
    try t.expectEqualSlices(u8, original, bytes);
    // Body Tree nodes are already freed; input payloads remain alive.
    try t.expectEqual(@as(usize, 12), report.forms.len);
    try t.expectEqual(@as(usize, 192), report.total_property_bytes);
    try t.expectEqual(@as(usize, 12), report.total_property_nodes);
    const first = report.forms[0];
    try t.expectEqual(@as(usize, 1), first.control_node);
    try t.expectEqual(@as(usize, 3), first.object_node);
    try t.expectEqual(@as(usize, 1), first.other_direct_children);
    try t.expectEqual(@as(i32, -17), first.common.offset_y);
    try t.expectEqual(@as(u32, 0xfffffffe), first.common.width);
    try t.expectEqual(@as(usize, 0), first.common.description_utf16.?.len);
    try t.expectEqualSlices(u8, &.{ '1', 0 }, first.properties.nodes[0].property.value);
}
test "form assembly owns arrays not payloads and cleans every allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "form limits apply across controls rather than restarting per payload" {
    const bytes = try fixture(t.allocator);
    defer t.allocator.free(bytes);
    var report = try collect(t.allocator, bytes, .{ .max_forms = 12, .properties = .{ .max_input_bytes = 192, .max_nodes = 12, .max_depth = 0 } });
    defer report.deinit(t.allocator);
    try t.expectError(error.FormControlLimit, collect(t.allocator, bytes, .{ .max_forms = 11 }));
    try t.expectError(error.FormPropertyInputLimit, collect(t.allocator, bytes, .{ .properties = .{ .max_input_bytes = 191 } }));
    try t.expectError(error.FormPropertyNodeLimit, collect(t.allocator, bytes, .{ .properties = .{ .max_nodes = 11 } }));
}
