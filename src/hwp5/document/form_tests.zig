const std = @import("std");
const t = std.testing;
const d = @import("validation.zig");
const f = @import("test_fixture.zig");
const opts: d.Options = .{ .forms = .{}, .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
const section = @import("form_test_fixture.zig").section;
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
        try t.expectEqual(@as(usize, 1), s.forms.undetermined_char_shape);
        try t.expectEqual(@as(usize, 0), s.forms.explicit_char_shape_valid);
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
