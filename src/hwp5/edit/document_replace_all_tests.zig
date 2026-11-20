//! Synthetic Native Session/History contracts. No uploaded document fixtures.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const Service = @import("document_replace_all.zig").Service;
const a = std.testing.allocator;

fn open() !*edit.Session {
    const bytes = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    errdefer session.close();
    // The authored empty document has two eight-unit structural controls.
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "needle" } });
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 22 } });
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "needle😀needle" } });
    return session;
}
fn saved(session: *edit.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
test "document text H5 complete source and generated paragraphs use one undo redo entry" {
    const session = try open();
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const id = try lifetime.session(a);
    defer a.free(id);
    const service: Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const before = try saved(session);
    defer a.free(before);
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = id, .revision = history.revision() }, .query = "needle", .replacement = "한" }));
    try std.testing.expectEqual(@as(usize, 1), history.stats().undoCount);
    var observed = try session.documentTextSnapshot(a, lifetime, history.revision());
    defer observed.deinit();
    try std.testing.expectEqualStrings("한😀한", observed.rows.items[1].text);
    try std.testing.expect(std.mem.endsWith(u8, observed.rows.items[0].text, "한"));
    const after = try saved(session);
    defer a.free(after);
    const reopened = try edit.Session.open(a, after);
    defer reopened.close();
    var reloaded = try reopened.documentTextSnapshot(a, lifetime, null);
    defer reloaded.deinit();
    try std.testing.expectEqualStrings("한😀한", reloaded.rows.items[1].text);
    try std.testing.expect(try history.undo(session));
    const undone = try saved(session);
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(session));
    const redone = try saved(session);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}

test "document text H5 stale binding and unsupported replacement leave bytes history and redo intact" {
    const session = try open();
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const id = try lifetime.session(a);
    defer a.free(id);
    const service: Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = id, .revision = history.revision() }, .query = "needle", .replacement = "X" }));
    try std.testing.expect(try history.undo(session));
    const revision = history.revision();
    const before = try saved(session);
    defer a.free(before);
    try std.testing.expectError(error.StaleFormattingBinding, service.apply(a, .{ .binding = .{ .session = id, .revision = revision + 1 }, .query = "needle", .replacement = "X" }));
    try std.testing.expectError(error.UnsupportedTextControl, service.apply(a, .{ .binding = .{ .session = id, .revision = revision }, .query = "needle", .replacement = "\n" }));
    const after = try saved(session);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqual(@as(usize, 1), history.stats().redoCount);
    // Absent and identity queries must not discard redo either.
    try std.testing.expect(!try service.apply(a, .{ .binding = .{ .session = id, .revision = revision }, .query = "absent", .replacement = "X" }));
    try std.testing.expect(!try service.apply(a, .{ .binding = .{ .session = id, .revision = revision }, .query = "needle", .replacement = "needle" }));
    try std.testing.expectEqual(@as(usize, 1), history.stats().redoCount);
}
