const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;

fn expectSaved(session: *Session, expected: []const u8) !void {
    const saved = try session.save(std.testing.allocator, .{ .allow_stale_layout = true });
    defer std.testing.allocator.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}

fn exercise(a: std.mem.Allocator, input: []const u8, target: usize) !void {
    const session = try Session.open(a, input);
    defer session.close();
    var protection = try session.textSourceProtection(a, 0);
    defer protection.deinit(a);
    try std.testing.expectEqual(.retained_memo, protection.mode);
    try std.testing.expect(!protection.protected_paragraphs[target]);
    var history = try History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    const command: @import("style_preservation.zig").Command = .{ .splice_text = .{
        .section = 0,
        .paragraph = target,
        .start_unit = 0,
        .end_unit = 0,
        .utf8 = "메모입력",
    } };
    _ = history.apply(session, command) catch |err| {
        try expectSaved(session, input);
        try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
        try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
        return err;
    };
    const edited = try session.save(std.testing.allocator, .{ .allow_stale_layout = true });
    defer std.testing.allocator.free(edited.bytes);
    try std.testing.expect(try history.undo(session));
    _ = history.apply(session, command) catch |err| {
        try expectSaved(session, input);
        try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
        try std.testing.expect(try history.redo(session));
        try expectSaved(session, edited.bytes);
        return err;
    };
    try expectSaved(session, edited.bytes);
}

test "actual memo text every allocation failure preserves document and redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/english.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    const flows = try session.paragraphFlow(a, 0);
    defer a.free(flows);
    for (flows) |row| if (row.memo_node != null) {
        try @import("../../testing/allocation_failures.zig").check(exercise, .{ input, row.paragraph });
        return;
    };
    return error.MissingMemoParagraph;
}
