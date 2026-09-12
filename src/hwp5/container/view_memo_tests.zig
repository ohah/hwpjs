const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const options: c.Options = .{ .view_text_semantics = .strict_document_rules, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };

fn section(a: std.mem.Allocator, id: u32, field: bool) ![]u8 {
    const base = try f.section(a);
    defer a.free(base);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, base);
    if (field) {
        var para = [_]u8{0} ** 24;
        f.put(&para, 0, u32, 8);
        try f.frame(a, &out, 66, 0, &para);
        var token = [_]u8{0} ** 16;
        f.put(&token, 0, u16, 3);
        f.put(&token, 2, u32, @import("../body/control_rules.zig").id("%%me"));
        f.put(&token, 14, u16, 3);
        try f.frame(a, &out, 67, 1, &token);
        var ctrl = [_]u8{0} ** 19;
        @memcpy(ctrl[0..4], token[2..6]);
        f.put(&ctrl, 11, u32, 99); // Field instance ID is not the memo target.
        f.put(&ctrl, 15, u32, id);
        try f.frame(a, &out, 71, 1, &ctrl);
    } else {
        var para = [_]u8{0} ** 24;
        f.put(&para, 0, u32, 8);
        try f.frame(a, &out, 66, 0, &para);
        var token = [_]u8{0} ** 16;
        f.put(&token, 0, u16, 4);
        f.put(&token, 2, u32, 0x00256d65);
        f.put(&token, 10, u32, id);
        f.put(&token, 14, u16, 4);
        try f.frame(a, &out, 67, 1, &token);
        var marker: [4]u8 = undefined;
        f.put(&marker, 0, u32, id);
        try f.frame(a, &out, 93, 1, &marker);
        try f.frame(a, &out, 72, 1, &([_]u8{0} ** 16));
    }
    return out.toOwnedSlice(a);
}
fn make(a: std.mem.Allocator, id: u32, missing: bool) ![]u8 {
    const h = f.header();
    const doc = try f.docInfo(a, 2);
    defer a.free(doc);
    const field = try section(a, id, true);
    defer a.free(field);
    const target = try section(a, id, false);
    defer a.free(target);
    const wrong = try section(a, id ^ 1, false);
    defer a.free(wrong);
    // Deliberately reversed directory order; logical Section0 must be first.
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &h },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section1", .parent = 3, .content = target },
        .{ .name = "Section0", .parent = 3, .content = field },
        .{ .name = "ViewText", .parent = 0, .kind = 1 },
        .{ .name = "Section1", .parent = 6, .content = if (missing) wrong else target },
        .{ .name = "Section0", .parent = 6, .content = field },
    }, .{});
}
fn exercise(a: std.mem.Allocator, missing: bool) !void {
    const bytes = try make(a, 0, missing);
    defer a.free(bytes);
    var report = c.inspect(a, bytes, options) catch |err| {
        if (missing and err == error.MissingMemoTarget) return;
        return err;
    };
    defer report.deinit(a);
    try t.expect(!missing);
    const view = report.view_text_semantics.?;
    try t.expectEqual(@as(usize, 1), view.memo_references.fields);
    try t.expectEqual(@as(usize, 1), view.memo_references.lists);
    try t.expectEqual(@as(usize, 1), view.memo_references.matched_fields);
    try t.expectEqual(@as(usize, 1), view.memo_references.cross_section_fields);
    try t.expectEqual(@as(usize, 0), view.memo_references.duplicate_list_ids);
    try t.expectEqualDeep(report.document.memo_references, view.memo_references);
    try t.expectEqual(@as(usize, 1), view.memo_end_references.matched_ends);
    try t.expectEqualDeep(report.document.memo_end_references, view.memo_end_references);
    try t.expectEqual(@as(usize, 1), view.memo_ranges.pairs);
    try t.expectEqual(@as(usize, 1), view.memo_ranges.cross_section_pairs);
    try t.expectEqual(@as(usize, 0), view.memo_ranges.unclosed_starts);
    try t.expectEqual(@as(usize, 0), view.memo_ranges.orphan_ends);
    try t.expectEqualDeep(report.document.memo_ranges, view.memo_ranges);
}
test "ViewText memo references span sections but never borrow BodyText targets" {
    try exercise(t.allocator, false);
    try exercise(t.allocator, true);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "ViewText memo target extremes remain IDs and unselected semantics stay deferred" {
    for ([_]u32{ 0, 0xffffffff }) |id| {
        const bytes = try make(t.allocator, id, false);
        defer t.allocator.free(bytes);
        var report = try c.inspect(t.allocator, bytes, options);
        defer report.deinit(t.allocator);
        try t.expectEqual(@as(usize, 1), report.view_text_semantics.?.memo_references.cross_section_fields);
        const missing = try make(t.allocator, id, true);
        defer t.allocator.free(missing);
        var off = options;
        off.view_text_semantics = .uninspected;
        var deferred = try c.inspect(t.allocator, missing, off);
        defer deferred.deinit(t.allocator);
        try t.expect(deferred.view_text_semantics == null);
    }
}
