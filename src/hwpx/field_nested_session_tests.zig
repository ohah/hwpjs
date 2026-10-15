const std = @import("std");
test "field range target rejects ambiguous adjacent boundaries without mutation" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:ctrl><p:fieldBegin id='2' type='CLICK_HERE'/></p:ctrl><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expectError(error.UnsupportedFieldLabelRange, @import("field_label_range_target.zig").select(&session, 0, 1, 1, 1));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
}
test "nested source label edits protect children and commit ancestor dirty with history" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldBegin id='2' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl><p:t>C</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const targets = try session.fieldLabels(0, 1);
    defer a.free(targets);
    try std.testing.expectEqual(@as(usize, 2), targets.len);
    try std.testing.expectEqual(@as(u32, 1), targets[0].start);
    try std.testing.expectEqual(@as(u32, 2), targets[1].start);
    const range_target = @import("field_label_range_target.zig");
    try std.testing.expectEqual(targets[1].begin_element, (try range_target.select(&session, 0, 1, 2, 2)).?.begin_element);
    try std.testing.expectEqual(targets[0].begin_element, (try range_target.select(&session, 0, 1, 1, 1)).?.begin_element);
    try std.testing.expect((try range_target.select(&session, 0, 1, 1, 4)) == null);
    try std.testing.expect((try range_target.select(&session, 0, 1, 0, 0)) == null);
    try std.testing.expectError(error.InvalidTextPosition, range_target.select(&session, 0, 1, 3, 2));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, expected: u32) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            const target = (try range_target.select(&proxy, 0, 1, 2, 2)) orelse return error.MissingFieldTarget;
            try std.testing.expectEqual(expected, target.begin_element);
            try std.testing.expectEqual(@as(usize, 0), source.sections[0].field_dirty.items.len);
        }
    }.run, .{ &session, targets[1].begin_element });
    try std.testing.expect(!try session.spliceFieldLabel(0, 1, targets[1].begin_element, 2, 1, "B"));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
    try std.testing.expectError(error.ProtectedFieldRange, session.spliceFieldLabel(0, 1, targets[0].begin_element, 2, 1, "overwrite"));
    try std.testing.expectError(error.ProtectedFieldRange, session.spliceFieldLabel(0, 1, targets[0].begin_element, 2, 0, "ambiguous"));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, bytes, unchanged);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, begin: usize) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(@import("editor_session.zig").Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            const changed = proxy.spliceFieldLabel(0, 1, begin, 2, 0, "한😀<&") catch |err| {
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| {
                    try std.testing.expectEqualSlices(u8, before.text, after.text);
                    try std.testing.expectEqual(before.start, after.start);
                    try std.testing.expectEqual(before.end, after.end);
                }
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 2), proxy.sections[0].field_dirty.items.len);
        }
    }.run, .{ &session, targets[1].begin_element });
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = 1, .begin_element = targets[1].begin_element, .start = 2, .deleted = 0, .inserted = "한😀<&" }));
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].field_dirty.items.len);
    for (session.sections[0].field_dirty.items) |dirty| try std.testing.expect(dirty.dirty);
    try std.testing.expectError(error.SplitSurrogatePair, range_target.select(&session, 0, 1, 4, 4));
    try std.testing.expectError(error.SplitSurrogatePair, session.spliceFieldLabel(0, 1, targets[1].begin_element, 4, 0, "blocked"));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, bytes, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
}
