//! Baseline regression only: no chart publication command exists in this packet.
const std = @import("std");
test "H5 chart session wiring empty resource state preserves original save and History adapter" {
    const a = std.testing.allocator;
    const bytes = try @import("new_document/hwp5.zig").create(a);
    defer a.free(bytes);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const history = try @import("hwp5/edit/history_v2.zig").History.create(a, session, .{});
    defer history.deinit();
    const checkpoint = try session.createCheckpoint(1048576);
    defer checkpoint.deinit();
    const parent = try session.cloneHistoryCheckpointForRestore(checkpoint, 1048576);
    defer parent.deinit();
    try std.testing.expect(try session.matchesCheckpoint(parent));
    try std.testing.expect(!try history.undo(session));
    try std.testing.expect(!try history.redo(session));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
    const reopened = try @import("hwp5/edit/style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const resaved = try reopened.save(a, .{});
    defer a.free(resaved.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, resaved.bytes);
}
