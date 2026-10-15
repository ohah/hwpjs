const std = @import("std");
test "field exterior edits text before a field-owned table without deleting the anchor" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>  </p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' editable='1'/></p:ctrl><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:subList><p:p><p:run><p:t>CELL</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>after</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 1, 0, 0));
    try std.testing.expect(try session.splice(0, 1, 0, 0, "outside"));
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 1, 9, 1, ""));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:tbl rowCnt='1' colCnt='1'>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:t>CELL</p:t>"));
}
test "field range lookup leaves an exterior table editable before a root orphan" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl><p:t>CELL</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p><p:p><p:run><p:ctrl><p:fieldBegin id='2' type='CLICK_HERE'/></p:ctrl><p:t>unfinished</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect((try @import("field_label_range_target.zig").select(&session, 0, 1, 0, 0)) == null);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, input, unchanged);
    try std.testing.expect(try session.spliceAnchored(0, 1, 0, 0, "outside"));
    try std.testing.expectEqual(@as(usize, 1), session.source_fields.?.report.unmatched_begins);
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 3, 0, 0, "blocked"));
}
test "closed container field edits cell and body text without consuming its table" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>A</p:t></p:run></p:p><p:p><p:run><p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:t>CELL</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:t>Z</p:t></p:run></p:p><p:p><p:run><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const cell = try session.fieldLabels(0, 3);
    defer a.free(cell);
    try std.testing.expectEqual(@as(usize, 1), cell.len);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, begin: u32) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(@import("editor_session.zig").Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            const changed = proxy.spliceFieldLabel(0, 3, begin, 0, 0, "셀😀<&") catch |err| {
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| try std.testing.expectEqualSlices(u8, before.text, after.text);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), proxy.sections[0].field_dirty.items.len);
        }
    }.run, .{ &session, cell[0].begin_element });
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = 3, .begin_element = cell[0].begin_element, .start = 0, .deleted = 0, .inserted = "셀😀<&" }));
    const body = try session.fieldLabels(0, 4);
    defer a.free(body);
    try std.testing.expectEqual(@as(usize, 1), body.len);
    try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = 4, .begin_element = body[0].begin_element, .start = 0, .deleted = 0, .inserted = "본문" }));
    const host = try session.fieldLabels(0, 2);
    defer a.free(host);
    try std.testing.expectEqual(@as(usize, 1), host.len);
    try std.testing.expectError(error.ProtectedInlineControl, session.spliceFieldLabel(0, 2, host[0].begin_element, 0, 1, ""));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:tbl rowCnt='1' colCnt='1'>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:fieldEnd beginIDRef='1'/>"));
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].field_dirty.items.len);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
