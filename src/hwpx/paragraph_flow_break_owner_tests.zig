const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
const Kind = @import("../model/paragraph_break.zig").Kind;
const flow = @import("paragraph_flow_snapshot.zig");

test "HWPX explicit flow binds new sibling after edited header footer descendants" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    for ([_]Kind{ .page, .column }) |kind| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
        _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리😀");
        const before = try session.save();
        defer a.free(before);
        var history = try history_mod.History.init(&session, 4, 16_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .break_before = kind }));
        const values = session.sections[0].structure_values.?;
        var target: ?usize = null;
        for (values.paragraphs, 0..) |row, index| {
            if (row.break_before != null) {
                try std.testing.expect(target == null);
                target = index;
                try std.testing.expect(row.generated_id != null);
                try std.testing.expectEqual(@as(?Kind, kind), row.break_before);
            }
        }
        const index = target orelse return error.MissingParagraphBreak;
        try std.testing.expect(index > 2);
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const rows = try flow.read(a, &reopened, 0);
        defer flow.free(a, rows);
        try std.testing.expectEqual(flow.Host.body, rows[index].host);
        try std.testing.expectEqual(@as(?bool, kind == .page), rows[index].page_break);
        try std.testing.expectEqual(@as(?bool, kind == .column), rows[index].column_break);
        for (1..6) |paragraph| {
            const original = try session.anchorText(0, paragraph);
            defer a.free(original);
            const restored = try reopened.anchorText(0, paragraph);
            defer a.free(restored);
            try std.testing.expectEqualStrings(original, restored);
        }
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
