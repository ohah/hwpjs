//! Public session reproduction of ordinary input after an anchored resplit.
const std = @import("std");

test "chart source boundary resplit keeps plain input capability executable" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    for ([_]usize{ 10, 51, 102 }) |paragraph| {
        var session = try @import("hwpx/editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        const original_text = try session.anchorText(0, paragraph);
        defer a.free(original_text);
        const boundary = std.math.cast(u32, try @import("hwpx/text_site_edit.zig").utf16Length(original_text)) orelse return error.LimitExceeded;
        try std.testing.expect(try session.mergeParagraph(0, paragraph));
        try std.testing.expect(try session.splitParagraph(0, paragraph, boundary, 0));
        const before = try session.save();
        defer a.free(before);
        var history = try @import("hwpx/editor_history.zig").History.init(&session, 8, 16 * 1024 * 1024);
        defer history.deinit();
        try std.testing.expect(try session.canEdit(0, paragraph));
        try std.testing.expect(try history.apply(&session, .{ .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "왼쪽😀<&" }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try @import("hwpx/editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        try std.testing.expect(try reopened.canEdit(0, paragraph));
        const text = try reopened.anchorText(0, paragraph);
        defer a.free(text);
        const expected = try std.mem.concat(a, u8, &.{ "왼쪽😀<&", original_text });
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, text);
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
    }
}
