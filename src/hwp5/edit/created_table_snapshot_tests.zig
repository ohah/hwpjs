const std = @import("std");
const editor = @import("style_preservation.zig");
const snapshot = @import("created_table_snapshot.zig");
const a = std.testing.allocator;
fn readOwned(allocator: std.mem.Allocator, session: *const editor.Session) !void {
    const rows = try session.createdTables(allocator, 0);
    defer snapshot.deinit(allocator, rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqualStrings("18446744073709551615", rows[0].table.identity);
    try std.testing.expectEqualStrings("표😀", rows[0].options.common.description);
    try std.testing.expectEqualStrings("셀😀", rows[0].table.cells[1].text);
    try std.testing.expectEqual(@as(u32, 51), rows[0].table.cells[0].width);
    try std.testing.expectEqual(@as(u32, 50), rows[0].table.cells[1].width);
}
test "HWP5 created table snapshot owns values preserves wide identity and follows native history" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try editor.Session.open(a, input);
    defer session.close();
    var ids = try session.planTableIds(2);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, std.math.maxInt(u64), ids.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 2, 101, 17, 2), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 2);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "셀😀", 100);
    const options: @import("created_table_records.zig").Options = .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표😀" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    };
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 1, .unit = 0, .table = &table, .options = options } }));
    try std.testing.checkAllAllocationFailures(a, readOwned, .{session});
    const rows = try session.createdTables(a, 0);
    defer snapshot.deinit(a, rows);
    try std.testing.expectEqual(@as(usize, 1), rows[0].table.host_paragraph);
    rows[0].table.cells[1].text[0] = 'x';
    @constCast(rows[0].options.common.description)[0] = 'x';
    try readOwned(a, session);
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "A" } }));
    const moved = try session.createdTables(a, 0);
    defer snapshot.deinit(a, moved);
    try std.testing.expectEqual(@as(u32, 1), moved[0].table.anchor_unit);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    const empty = try session.createdTables(a, 0);
    defer snapshot.deinit(a, empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    try std.testing.expect(try history.redo(session));
    try readOwned(a, session);
    try std.testing.expectError(error.InvalidSection, session.createdTables(a, 99));
}
