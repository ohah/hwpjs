const std = @import("std");
const t = std.testing;
const d = @import("validation.zig");
const f = @import("test_fixture.zig");
const opts: d.Options = .{ .forms = .{}, .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var h: [4]u8 = undefined;
    f.put(&h, 0, u32, tag | (level << 10) | (@as(u32, @intCast(payload.len)) << 20));
    try out.appendSlice(a, &h);
    try out.appendSlice(a, payload);
}
fn section(a: std.mem.Allocator) ![]u8 {
    const base = try f.section(a);
    defer a.free(base);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, base);
    var para = [_]u8{0} ** 24;
    f.put(&para, 0, u32, 8);
    try frame(a, &out, 66, 0, &para);
    var token = [_]u8{0} ** 16;
    f.put(&token, 0, u16, 11);
    f.put(&token, 2, u32, @import("../body/control_rules.zig").form_id);
    f.put(&token, 14, u16, 11);
    try frame(a, &out, 67, 1, &token);
    var ctrl = [_]u8{0} ** 44;
    @memcpy(ctrl[0..4], token[2..6]);
    try frame(a, &out, 71, 1, &ctrl);
    const text = "CharShapeSet:set:18:CharShapeID:int:0 ";
    var object = [_]u8{0} ** (14 + text.len * 2);
    @memcpy(object[0..8], "tbp+tbp+");
    f.put(&object, 8, u32, text.len);
    f.put(&object, 12, u16, text.len);
    for (text, 0..) |c, i| object[14 + i * 2] = c;
    try frame(a, &out, 91, 2, &object);
    return out.toOwnedSlice(a);
}
fn exercise(a: std.mem.Allocator, late: bool) !void {
    const doc = try f.docInfo(a, 12);
    defer a.free(doc);
    const body = try section(a);
    defer a.free(body);
    const original = try a.dupe(u8, body);
    defer a.free(original);
    var sections: [12]d.types.Section = undefined;
    for (&sections, 0..) |*s, i| s.* = .{ .index = @intCast(11 - i), .bytes = body };
    var options = opts;
    options.forms.?.properties.max_nodes = if (late) 23 else 24;
    var report = d.inspectDecoded(a, .{ .header = &f.header(), .doc_info = doc, .sections = &sections }, options) catch |err| {
        try t.expectEqualSlices(u8, original, body);
        if (late and err == error.FormPropertyNodeLimit) return;
        return err;
    };
    defer report.deinit(a);
    try t.expect(!late);
    try t.expectEqualSlices(u8, original, body);
    for (report.sections) |s| {
        try t.expectEqual(@as(usize, 1), s.forms.inspected_forms);
        try t.expectEqual(@as(usize, 2), s.forms.known_property_nodes);
        try t.expectEqual(@as(usize, 1), s.forms.char_shape_valid);
    }
}
test "form document validation shares budgets and releases every allocation on late failure" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "zero form budgets constrain selected forms but not unselected raw diagnostics" {
    const doc = try f.docInfo(t.allocator, 1);
    defer t.allocator.free(doc);
    const body = try section(t.allocator);
    defer t.allocator.free(body);
    const input: d.Input = .{ .header = &f.header(), .doc_info = doc, .sections = &.{.{ .index = 0, .bytes = body }} };
    var options = opts;
    options.forms.?.max_forms = 0;
    try t.expectError(error.FormControlLimit, d.inspectDecoded(t.allocator, input, options));
    options.forms = null;
    var report = try d.inspectDecoded(t.allocator, input, options);
    defer report.deinit(t.allocator);
    try t.expectEqual(@as(usize, 1), report.sections[0].forms.unselected_controls);
    try t.expectEqual(@as(usize, 1), report.sections[0].forms.unselected_objects);
    try t.expectEqual(@as(usize, 0), report.sections[0].forms.inspected_forms);
}
