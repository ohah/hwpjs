const std = @import("std");

test "HWPX native merge history rolls back checkpoint growth without publishing an entry" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const limit = try @import("editor_checkpoint.zig").size(&session, 4_000_000);
    var history = try @import("editor_history.zig").History.init(&session, 4, limit);
    defer history.deinit();
    const count = session.sections[0].last_paragraph;
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, .{ .kind = .merge, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expectEqual(count, session.sections[0].last_paragraph);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(!try history.redo(&session));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "HWPX native merge history preserves failed redo and repeated current provenance" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .merge, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" };
    try std.testing.expect(try history.apply(&session, command));
    const merged = try session.save();
    defer a.free(merged);
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "병합이력😀<&" }));
    const edited = try session.save();
    defer a.free(edited);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, merged, undone);
    try std.testing.expectError(error.InvalidParagraphIndex, history.apply(&session, .{ .kind = .merge, .paragraph = session.sections[0].last_paragraph, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expectError(error.InvalidStructureCommand, history.apply(&session, .{ .kind = .merge, .paragraph = 2, .start = 1, .deleted = 0, .inserted = "" }));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(@as(usize, 3), session.sections[0].structure_values.?.paragraphs[1].pieces.?.len);
    const repeated = try session.save();
    defer a.free(repeated);
    var reopened = try @import("editor_session.zig").open(a, repeated, .{});
    defer reopened.deinit();
    const expected = try session.anchorText(0, 2);
    defer a.free(expected);
    const actual = try reopened.anchorText(0, 2);
    defer a.free(actual);
    try std.testing.expectEqualStrings(expected, actual);
}
