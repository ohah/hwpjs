const std = @import("std");
const snapshots = @import("created_table_snapshot.zig");

test "created table snapshot detaches text preserves wide identity and restores with history" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("../model/created_table.zig").create(a, 9007199254740993, 33, try @import("../model/table_creation_plan.zig").create(1, 2, 101, 17, 2), &.{ 1000000, 1000001 }, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 2);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "현재😀", 100);
    var history = try @import("editor_history.zig").History.init(&session, 4, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .created_table_stage, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
    var second = try @import("../model/created_table.zig").create(a, 2, 34, try @import("../model/table_creation_plan.zig").create(1, 1, 10, 17, 1), &.{1000002}, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 1);
    defer second.deinit(a);
    try std.testing.expect(try history.apply(&session, .{ .kind = .created_table_stage, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .created_table = &second }));
    const rows = try snapshots.read(a, &session, 0);
    defer snapshots.deinit(a, rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqualStrings("9007199254740993", rows[0].identity);
    try std.testing.expectEqual(@as(usize, 2), rows[0].host_paragraph);
    try std.testing.expectEqual(@as(u32, 51), rows[0].cells[0].width);
    try std.testing.expectEqual(@as(u32, 50), rows[0].cells[1].width);
    try std.testing.expectEqualStrings("현재😀", rows[0].cells[1].text);
    const text = rows[0].cells[1].text;
    text[0] = 'x';
    try std.testing.expectEqualStrings("현재😀", session.sections[0].created_tables.entries.items[0].table.cells[1].text);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const @import("editor_session.zig").Session) !void {
            const result = try snapshots.read(allocator, state, 0);
            defer snapshots.deinit(allocator, result);
            try std.testing.expectEqualStrings("현재😀", result[0].cells[1].text);
        }
    }.run, .{&session});
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const empty = try snapshots.read(a, &session, 0);
    defer snapshots.deinit(a, empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const restored = try snapshots.read(a, &session, 0);
    defer snapshots.deinit(a, restored);
    try std.testing.expectEqualStrings("현재😀", restored[0].cells[1].text);
    try std.testing.expectError(error.InvalidSectionIndex, snapshots.read(a, &session, 99));
}
