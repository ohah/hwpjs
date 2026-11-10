const std = @import("std");
const edit = @import("hwp5/edit/style_preservation.zig");
const History = @import("hwp5/edit/editor_history.zig").History;
const a = std.testing.allocator;
fn fixture() ![]u8 {
    const path = std.process.Environ.getPosix(std.testing.environ, "HWPJS_TEST_SOURCE_GRID_HWP5") orelse return error.MissingRequiredFixtureEnvironment;
    if (!std.fs.path.isAbsolute(path) or std.mem.indexOf(u8, path, "hwpers") != null or std.mem.indexOf(u8, path, "title-column-roundtrip") != null or std.mem.indexOf(u8, path, "/../") != null or !std.mem.endsWith(u8, path, "/zig-out/verification/created-table-ui-r1/browser-public-r1/vanilla-hwp5.hwp")) return error.UnapprovedSourceGridFixture;
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024));
}
fn tableNode(input: []const u8) !usize {
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = @import("hwp5/record.zig").Iterator.init(raw, .{});
    var node: usize = 0;
    var target: ?usize = null;
    while (try it.next()) |record| : (node += 1) if (record.tag == 77) {
        if (target != null) return error.DuplicateTestTable;
        target = node;
    };
    return target orelse error.MissingTestTable;
}
fn save(s: *edit.Session) ![]u8 {
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn expectSaved(s: *edit.Session, expected: []const u8) !void {
    const actual = try save(s);
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
}
fn historyCase(mode: u8) !void {
    const input = try fixture();
    defer a.free(input);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    const s = try edit.Session.open(a, input);
    defer s.close();
    if (mode == 2) s.enableHistoryDelta();
    var h = if (mode == 0) try History.init(a, s, 16, 32 * 1024 * 1024) else try History.initV2(a, s, .{ .max_entries = 16, .max_checkpoint_bytes = 32 * 1024 * 1024 });
    defer h.deinit();
    var snapshots: std.ArrayList([]u8) = .empty;
    defer {
        for (snapshots.items) |b| a.free(b);
        snapshots.deinit(a);
    }
    try snapshots.append(a, try save(s));
    _ = try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "A" } });
    try snapshots.append(a, try save(s));
    _ = try h.apply(s, .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true } } });
    try snapshots.append(a, try save(s));
    _ = try h.apply(s, .{ .edit_source_table_grid = .{ .section = 0, .table_node = try tableNode(snapshots.items[0]), .expected_rows = 2, .expected_columns = 2, .command = .{ .insert_row = 1 }, .layout = .observed8 } });
    try snapshots.append(a, try save(s));
    try std.testing.expectEqual(@as(usize, 7), try s.paragraphCount(0));
    _ = try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 0, .utf8 = "B" } });
    try snapshots.append(a, try save(s));
    _ = try h.apply(s, .{ .set_character_properties = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .properties = .{ .italic = true } } });
    try snapshots.append(a, try save(s));
    var remaining = snapshots.items.len - 1;
    while (remaining != 0) {
        try std.testing.expect(try h.undo(s));
        remaining -= 1;
        try expectSaved(s, snapshots.items[remaining]);
    }
    try std.testing.expect(!try h.undo(s));
    for (snapshots.items[1..]) |expected| {
        try std.testing.expect(try h.redo(s));
        try expectSaved(s, expected);
    }
    try std.testing.expect(!try h.redo(s));
    try std.testing.expectEqualSlices(u8, original, input);
}
test "HWP5 live source grid v1 mixed text formatting grid undo redo exact save" {
    try historyCase(0);
}
test "HWP5 live source grid v2 snapshots mixed text formatting grid undo redo exact save" {
    try historyCase(1);
}
test "HWP5 live source grid v2 managed mixed text formatting grid undo redo exact save" {
    try historyCase(2);
}
const Grid = @import("model/table_grid_edit_plan.zig").Command;
const grid_cases = [_]struct { command: Grid, paragraphs: usize }{
    .{ .command = .{ .insert_row = 1 }, .paragraphs = 7 },
    .{ .command = .{ .delete_row = 0 }, .paragraphs = 3 },
    .{ .command = .{ .insert_column = 1 }, .paragraphs = 7 },
    .{ .command = .{ .delete_column = 0 }, .paragraphs = 3 },
};
fn gridCommand(node: usize, command: Grid) edit.Command {
    return .{ .edit_source_table_grid = .{ .section = 0, .table_node = node, .expected_rows = 2, .expected_columns = 2, .command = command, .layout = .observed8 } };
}
test "HWP5 live source grid four commands restore deleted text and old checkpoints" {
    const input = try fixture();
    defer a.free(input);
    const node = try tableNode(input);
    for ([_]bool{ false, true }) |v2| for (grid_cases) |case| {
        const s = try edit.Session.open(a, input);
        defer s.close();
        if (v2) s.enableHistoryDelta();
        var h = if (v2) try History.initV2(a, s, .{ .max_entries = 8 }) else try History.init(a, s, 8, 32 * 1024 * 1024);
        defer h.deinit();
        _ = try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "deleted🙂" } });
        const before = try save(s);
        defer a.free(before);
        _ = try h.apply(s, gridCommand(node, case.command));
        try std.testing.expectEqual(case.paragraphs, try s.paragraphCount(0));
        const after = try save(s);
        defer a.free(after);
        try std.testing.expect(try h.undo(s));
        try expectSaved(s, before);
        try std.testing.expect(try h.undo(s));
        try expectSaved(s, input);
        try std.testing.expect(try h.redo(s));
        try expectSaved(s, before);
        try std.testing.expect(try h.redo(s));
        try expectSaved(s, after);
    };
}
fn allocationAttempt(allocator: std.mem.Allocator, input: []const u8, node: usize, command: Grid) !void {
    const s = try edit.Session.open(allocator, input);
    defer s.close();
    var h = try History.init(allocator, s, 4, 32 * 1024 * 1024);
    defer h.deinit();
    _ = h.apply(s, gridCommand(node, command)) catch |err| {
        try std.testing.expectEqual(@as(u32, 0), h.revision());
        try expectSaved(s, input);
        return err;
    };
    try std.testing.expect(try h.undo(s));
    try expectSaved(s, input);
}
test "HWP5 live source grid allocation failures preserve source and undo chain" {
    const input = try fixture();
    defer a.free(input);
    const node = try tableNode(input);
    for (grid_cases) |case| try @import("testing/allocation_failures.zig").check(allocationAttempt, .{ input, node, case.command });
}
test "HWP5 live source grid rejected bounds and stale dimensions retain redo" {
    const input = try fixture();
    defer a.free(input);
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{ .max_entries = 8 });
    defer h.deinit();
    _ = try h.apply(s, gridCommand(try tableNode(input), .{ .insert_row = 1 }));
    const after = try save(s);
    defer a.free(after);
    try std.testing.expect(try h.undo(s));
    const revisions = h.revisionCount();
    try std.testing.expectError(error.InvalidTableGridEdit, h.apply(s, gridCommand(try tableNode(input), .{ .delete_row = 2 })));
    try std.testing.expectEqual(revisions, h.revisionCount());
    try expectSaved(s, input);
    try std.testing.expect(try h.redo(s));
    try expectSaved(s, after);
}
