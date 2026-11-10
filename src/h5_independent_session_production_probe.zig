//! Production specialization of the real Session + existing History path.
const std = @import("std");
const edit = @import("hwp5/edit/style_preservation.zig");
const History = @import("hwp5/edit/editor_history.zig").History;
comptime {
    if (@import("builtin").is_test) @compileError("build-exe required");
    if (@import("hwp5/edit/plain_text.zig").IndependentWork != void) @compileError("production counters retained");
}
pub fn main() !void {
    const a = std.heap.page_allocator;
    const bytes = try @import("new_document/root.zig").hwp5(a);
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    var history = try History.initV2(a, session, .{ .max_entries = 4 });
    defer history.deinit();
    const groups = [_]@import("hwp5/edit/independent_text_session.zig").Group{.{ .section = 0, .paragraph = 0, .edits = &.{.{ .start = 16, .end = 16, .text = "AB😀", .expected = "" }} }};
    if (!try history.apply(session, .{ .splice_independent_text = &groups })) return error.ExpectedChange;
    if (history.stats().undoCount != 1) return error.ExpectedSingleHistoryEntry;
    const current = try session.copyText(a, 0, 0);
    defer a.free(current);
    const expected = try std.unicode.utf8ToUtf16LeAlloc(a, "AB😀\r");
    defer a.free(expected);
    if (!std.mem.eql(u8, current[32..], std.mem.sliceAsBytes(expected))) return error.UnexpectedText;
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const copied = try reopened.copyText(a, 0, 0);
    defer a.free(copied);
    if (!std.mem.eql(u8, current, copied)) return error.UnexpectedReopenedText;
    if (!try history.undo(session)) return error.ExpectedUndo;
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    if (!std.mem.eql(u8, bytes, undone.bytes)) return error.UnexpectedUndoBytes;
    if (!try history.redo(session)) return error.ExpectedRedo;
    std.debug.print("H5 production Session independent text: current source anchors retained, one owned history, save/reopen/undo/redo verified\n", .{});
}
