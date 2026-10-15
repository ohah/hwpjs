const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
fn command(text: []const u8) history_mod.Command {
    return .{ .kind = .created_cell_text, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = text, .created_table_identity = 9007199254740993, .created_cell = .{ 0, 0 } };
}
test "created cell text command saves reopens and retains redo on refusal and no op" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("../model/created_table.zig").create(a, 9007199254740993, 33, try @import("../model/table_creation_plan.zig").create(1, 1, 100, 17, 1), &.{1000000}, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 1);
    defer table.deinit(a);
    _ = try @import("created_table_session.zig").stage(&session, 0, 2, 0, &table);
    var history = try history_mod.History.init(&session, 4, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, command("입력😀<&\r\n\n끝")));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 3);
    defer a.free(text);
    try std.testing.expectEqualStrings("입력😀<&\r\n\n끝", text);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(!try history.apply(&session, command("")));
    try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, command(&.{0})));
    var bad = command("x");
    bad.created_cell = .{ 1, 0 };
    try std.testing.expectError(error.InvalidTableCell, history.apply(&session, bad));
    bad = command("x");
    bad.created_table_identity = 99;
    try std.testing.expectError(error.InvalidCreatedTableIdentity, history.apply(&session, bad));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, history.applyBatch(&session, &.{ command("late"), bad }));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            const sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(sections);
            sections[0].created_tables = try source.sections[0].created_tables.clone(allocator);
            defer sections[0].created_tables.deinit(allocator);
            var borrowed = source.*;
            borrowed.allocator = allocator;
            borrowed.sections = sections;
            try std.testing.expect(try @import("created_cell_text_session.zig").set(&borrowed, 0, 9007199254740993, 0, 0, "다름😀"));
        }
    }.run, .{&session});
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
}
