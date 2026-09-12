const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const options: c.Options = .{ .view_text_semantics = .strict_document_rules, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
fn make(a: std.mem.Allocator, count: u16, bad: bool, late: bool) ![]u8 {
    return makeWithForms(a, count, bad, late, false);
}
fn makeWithForms(a: std.mem.Allocator, count: u16, bad: bool, late: bool, forms: bool) ![]u8 {
    const header = f.header();
    const doc = try f.docInfo(a, count);
    defer a.free(doc);
    const body = if (forms) try @import("../document/form_test_fixture.zig").section(a) else try f.section(a);
    defer a.free(body);
    const view = try a.alloc(u8, body.len + 40);
    defer a.free(view);
    @memcpy(view[0..body.len], body);
    @memset(view[body.len..], 0);
    f.put(view, 20, u16, 1);
    f.put(view, body.len, u32, 69 | (1 << 10) | (36 << 20));
    f.put(view, body.len + 4, u32, 9);
    var nodes: std.ArrayList(writer.Node) = .empty;
    defer nodes.deinit(a);
    try nodes.appendSlice(a, &.{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "FileHeader", .parent = 0, .content = &header }, .{ .name = "DocInfo", .parent = 0, .content = doc }, .{ .name = "BodyText", .parent = 0, .kind = 1 } });
    const names = [_][]const u8{ "Section0", "Section1" };
    for (names[0..count]) |name| try nodes.append(a, .{ .name = name, .parent = 3, .content = body });
    const parent: u32 = @intCast(nodes.items.len);
    try nodes.append(a, .{ .name = "ViewText", .parent = 0, .kind = 1 });
    for (names[0..count], 0..) |name, i| try nodes.append(a, .{ .name = name, .parent = parent, .content = if (bad and i + 1 == count) view else body });
    if (late) try nodes.append(a, .{ .name = "PrvImage", .parent = 0, .content = "unknown" });
    return writer.write(a, nodes.items, .{});
}
fn success(a: std.mem.Allocator) !void {
    var report = blk: {
        const bytes = try make(a, 2, false, false);
        defer a.free(bytes);
        break :blk try c.inspect(a, bytes, options);
    };
    defer report.deinit(a);
    try t.expect(report.view_text_semantics != null);
    const semantic = report.view_text_semantics.?;
    try t.expectEqual(@as(usize, 2), semantic.sections.len);
    try t.expectEqual(@as(usize, 8), semantic.records);
    try t.expectEqualDeep(report.document.sections, semantic.sections);
    try t.expectEqual(@as(usize, 8), report.view_text.deferred_records);
    try t.expectEqual(@as(usize, 0), report.uninspected_streams);
}
test "ViewText strict semantics owns detached reports without replacing framing evidence" {
    try success(t.allocator);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try success(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try t.checkAllAllocationFailures(t.allocator, success, .{});
}
fn lateFailure(a: std.mem.Allocator) !void {
    const bytes = try make(a, 2, false, true);
    defer a.free(bytes);
    var selected = options;
    selected.preview_image = .{ .images = .{}, .empty = .reject, .unhandled = .reject };
    var report = c.inspect(a, bytes, selected) catch |err| switch (err) {
        error.UnsupportedPreviewImage => return,
        else => return err,
    };
    defer report.deinit(a);
    return error.ExpectedLateFailure;
}
test "ViewText strict semantics cleans reports when a later container stage fails" {
    try lateFailure(t.allocator);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try lateFailure(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{});
}
test "ViewText strict semantics preserves the existing line-position rejection" {
    const bytes = try make(t.allocator, 2, true, false);
    defer t.allocator.free(bytes);
    try t.expectError(error.InvalidLinePosition, c.inspect(t.allocator, bytes, options));
    var off = options;
    off.view_text_semantics = .uninspected;
    var report = try c.inspect(t.allocator, bytes, off);
    defer report.deinit(t.allocator);
    try t.expect(report.view_text_semantics == null);
    try t.expectEqual(@as(usize, 9), report.view_text.deferred_records);
}
test "ViewText strict semantics shares document record and byte caps without double charging" {
    const bytes = try make(t.allocator, 2, false, false);
    defer t.allocator.free(bytes);
    var baseline = try c.inspect(t.allocator, bytes, options);
    defer baseline.deinit(t.allocator);
    var selected = options;
    selected.document.max_total_bytes = baseline.total_decoded_bytes;
    selected.document.max_total_records = baseline.document.total_records + baseline.view_text.records;
    var exact = try c.inspect(t.allocator, bytes, selected);
    defer exact.deinit(t.allocator);
    try t.expectEqualDeep(baseline.view_text, exact.view_text);
    selected.document.max_total_records -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, selected));
    selected.document.max_total_records += 1;
    selected.document.max_total_bytes -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, selected));
}

test "ViewText strict semantics shares all form budgets across body and view sections" {
    const bytes = try makeWithForms(t.allocator, 2, false, false, true);
    defer t.allocator.free(bytes);
    var selected = options;
    selected.document.forms = .{};
    var baseline = try c.inspect(t.allocator, bytes, selected);
    defer baseline.deinit(t.allocator);
    const unit = baseline.document.sections[0].forms;
    try t.expectEqual(@as(usize, 1), unit.inspected_forms);
    try t.expectEqual(@as(usize, 2), unit.property_nodes);
    try t.expect(unit.property_bytes > 0);
    for (baseline.document.sections) |s| try t.expectEqualDeep(unit, s.forms);
    for (baseline.view_text_semantics.?.sections) |s| try t.expectEqualDeep(unit, s.forms);
    selected.document.forms.?.max_forms = 4;
    selected.document.forms.?.properties.max_input_bytes = unit.property_bytes * 4;
    selected.document.forms.?.properties.max_nodes = 8;
    var exact = try c.inspect(t.allocator, bytes, selected);
    defer exact.deinit(t.allocator);
    try t.expectEqualDeep(baseline.view_text_semantics.?.sections, exact.view_text_semantics.?.sections);
    var short = selected;
    short.document.forms.?.max_forms -= 1;
    try t.expectError(error.FormControlLimit, c.inspect(t.allocator, bytes, short));
    short = selected;
    short.document.forms.?.properties.max_input_bytes -= 1;
    try t.expectError(error.FormPropertyInputLimit, c.inspect(t.allocator, bytes, short));
    short = selected;
    short.document.forms.?.properties.max_nodes -= 1;
    try t.expectError(error.FormPropertyNodeLimit, c.inspect(t.allocator, bytes, short));
    // Unselected ViewText must not spend semantic form budgets.
    selected.view_text_semantics = .uninspected;
    selected.document.forms.?.max_forms = 2;
    selected.document.forms.?.properties.max_input_bytes = unit.property_bytes * 2;
    selected.document.forms.?.properties.max_nodes = 4;
    var off = try c.inspect(t.allocator, bytes, selected);
    defer off.deinit(t.allocator);
    try t.expect(off.view_text_semantics == null);
}
