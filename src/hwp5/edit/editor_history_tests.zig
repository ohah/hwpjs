const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
const command: edit.Command = .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "이력😀" } };

fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
}
fn savedEqual(session: *edit.Session, expected: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}

test "HWP5 native history branches noops refusals growth rollback and eviction" {
    const input = try fixture();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const other = try edit.Session.open(a, input);
    defer other.close();
    var history = try History.init(a, session, 2, 8_000_000);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, History.init(a, session, 0, 1));
    try std.testing.expectError(error.LimitExceeded, History.init(a, session, 1, 0));
    try std.testing.expectError(error.SourceBindingMismatch, history.undo(other));
    try std.testing.expect(!try history.undo(session));
    history.max_checkpoint_bytes = try session.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, history.apply(session, command));
    try savedEqual(session, input);
    try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
    history.max_checkpoint_bytes = 8_000_000;
    try std.testing.expect(try history.apply(session, command));
    const edited = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(edited.bytes);
    try std.testing.expect(try history.undo(session));
    try savedEqual(session, input);
    history.max_checkpoint_bytes = try session.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, history.apply(session, command));
    try savedEqual(session, input);
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    history.max_checkpoint_bytes = 8_000_000;
    try std.testing.expectError(error.UnsupportedStructuralEdit, history.apply(session, .{ .delete_paragraph = .{ .section = 0, .paragraph = 1 } }));
    const info = try session.paragraph(0, 1);
    try std.testing.expect(!try history.apply(session, .{ .set_style = .{ .section = 0, .paragraph = 1, .style_id = info.style_id } }));
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expect(try history.redo(session));
    try savedEqual(session, edited.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(!try history.redo(session));
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expectEqual(@as(usize, 2), history.stack.undo.items.len);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(!try history.undo(session));
    try savedEqual(session, edited.bytes);
}

test "HWP5 native history all allocation failures preserve model and stack ownership" {
    const input = try fixture();
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const session = try edit.Session.open(allocator, bytes);
            defer session.close();
            var history = try History.init(allocator, session, 2, 8_000_000);
            defer history.deinit();
            _ = history.apply(session, command) catch |err| {
                try savedEqual(session, bytes);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
                return err;
            };
            const edited = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(edited.bytes);
            _ = history.undo(session) catch |err| {
                try savedEqual(session, edited.bytes);
                try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
                return err;
            };
            _ = history.redo(session) catch |err| {
                try savedEqual(session, bytes);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
                return err;
            };
            try savedEqual(session, edited.bytes);
        }
    }.run, .{input});
}
