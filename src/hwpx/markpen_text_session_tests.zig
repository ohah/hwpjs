const std = @import("std");
test "run direct markpen retains protected picture and allows anchored prefix" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:markpenBegin color='#FFFFFF'/><p:pic/><p:t><p:markpenEnd/></p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.spliceAnchored(0, 1, 0, 0, "앞😀<&"));
    try std.testing.expectError(error.ProtectedInlineControl, session.spliceAnchored(0, 1, 5, 1, ""));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:markpenBegin color='#FFFFFF'/>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:pic/>"));
}
test "markpen source empty text insertion preserves zero-width markers and history" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:markpenBegin color='#FFFF00'/><p:markpenEnd/></p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.canEdit(0, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, original: []const u8) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(@import("editor_session.zig").Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            const changed = proxy.splice(0, 1, 0, 0, "문자😀<&") catch |err| {
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| try std.testing.expectEqualSlices(u8, before.text, after.text);
                try std.testing.expect(proxy.sections[0].structure_values == null);
                proxy.allocator = std.testing.allocator;
                const saved = try proxy.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expectEqualSlices(u8, original, saved);
                return err;
            };
            try std.testing.expect(changed);
        }
    }.run, .{ &session, input });
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "문자😀<&" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:markpenBegin color='#FFFF00'/><p:markpenEnd/>"));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "markpen empty source open and no-op save retain every allocation failure cleanup" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:markpenBegin color='#FFFF00'/><p:markpenEnd/></p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer session.deinit();
            try std.testing.expectEqual(@as(usize, 1), session.sections[0].sites.items.len);
            try std.testing.expectEqualStrings("", session.sections[0].sites.items[0].text);
            try std.testing.expect(try session.canEdit(0, 1));
            const saved = try session.save();
            defer allocator.free(saved);
            try std.testing.expectEqualSlices(u8, bytes, saved);
        }
    }.run, .{@as([]const u8, input)});
}
