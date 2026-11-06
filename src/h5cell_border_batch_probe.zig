//! Focused multi-owner transaction and synchronous-request lifetime regression.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("hwp5/edit/style_preservation.zig");
const Request = @import("hwp5/edit/h5cell_border_batch.zig").Request;
const History = @import("hwp5/edit/editor_history.zig").History;
fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(8_000_000));
}
fn requests(session: *const edit.Session) ![2]Request {
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    var out: [2]Request = undefined;
    var n: usize = 0;
    for ([_]bool{ true, false }) |first| for (rows) |row| {
        if (row.protected) continue;
        const known = row.table_record_node == 200 and row.list_node == 201;
        if (known != first) continue;
        out[n] = .{ .section = 0, .table_node = @intCast(row.table_record_node), .list_node = @intCast(row.list_node), .edges = if (n == 0) 5 else 10, .style = if (n == 0) .SOLID else .DOUBLE_SLIM, .width_hundredth_mm = if (n == 0) 25 else 50, .color = if (n == 0) 0x123456 else 0 };
        n += 1;
        if (n == 2) return out;
    };
    return error.MissingOriginalCells;
}
fn saved(session: *const edit.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn expectBytes(session: *const edit.Session, expected: []const u8) !void {
    const bytes = try saved(session);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}
fn expectRequested(session: *const edit.Session, req: []const Request) !void {
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    var info = try session.formattingSource(a);
    defer info.deinit();
    for (req, 0..) |request, index| {
        var found = false;
        for (rows) |row| {
            if (row.table_record_node != request.table_node or row.list_node != request.list_node) continue;
            const payload = try @import("hwp5/edit/border_fill_docinfo_patch.zig").resource(info.bytes, row.border_fill_id);
            const value = try @import("hwp5/edit/border_fill_payload_patch.zig").observe(payload);
            const patch = try @import("hwp5/edit/cell_border_values.zig").toPatch(request);
            try std.testing.expect(@import("model/border_fill_patch.zig").matches(value, patch));
            if (index == 0) try std.testing.expectEqual(@as(u32, 0xaabbcc), value.background.?.solid.color);
            found = true;
        }
        try std.testing.expect(found);
    }
}
test "cell border batch HWP5 mixed originals background and owned history survive borrowed input" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        var req = try requests(session);
        try session.apply(.{ .set_cell_background = .{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .color = 0xaabbcc } });
        const before = try saved(session);
        defer a.free(before);
        if (mode == 2) session.enableHistoryDelta();
        var history = if (mode == 0) try History.init(a, session, 16, 8_000_000) else try History.initV2(a, session, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 64_000_000 });
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .set_cell_borders = &req }));
        try expectRequested(session, &req);
        const changed = try saved(session);
        defer a.free(changed);
        try std.testing.expect(!std.mem.eql(u8, before, changed));
        try std.testing.expect(!try history.apply(session, .{ .set_cell_borders = &req }));
        try std.testing.expect(!try history.apply(session, .{ .set_cell_borders = &.{} }));
        req[0].table_node = std.math.maxInt(u32);
        req[1].color = 0xff00ff;
        try std.testing.expect(try history.undo(session));
        try expectBytes(session, before);
        try std.testing.expect(!try history.undo(session));
        try std.testing.expect(try history.redo(session));
        try expectBytes(session, changed);
        try std.testing.expect(!try history.redo(session));
        const reopened = try edit.Session.open(a, changed);
        defer reopened.close();
        try expectBytes(reopened, changed);
    }
}
test "cell border batch HWP5 invalid trailing owner duplicate overflow and empty are atomic" {
    const bytes = try fixture();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    var req = try requests(session);
    const before = try saved(session);
    defer a.free(before);
    req[1].list_node = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidCellDisplayOwner, session.applyCellBorders(&req));
    try expectBytes(session, before);
    req[1] = req[0];
    try std.testing.expectError(error.DuplicateCellBorderOwner, session.applyCellBorders(&req));
    try expectBytes(session, before);
    const overflow = try a.alloc(Request, 4097);
    defer a.free(overflow);
    @memset(overflow, req[0]);
    try std.testing.expectError(error.LimitExceeded, session.applyCellBorders(overflow));
    try session.applyCellBorders(&.{});
    try expectBytes(session, before);
}

test "cell border batch HWP5 allocation failures retain state revision and redo" {
    const bytes = try fixture();
    defer a.free(bytes);
    var measured = std.testing.FailingAllocator.init(a, .{});
    const baseline = try edit.Session.open(measured.allocator(), bytes);
    defer baseline.close();
    const req = try requests(baseline);
    var baseline_history = try History.init(measured.allocator(), baseline, 8, 8_000_000);
    defer baseline_history.deinit();
    try std.testing.expect(try baseline_history.apply(baseline, .{ .set_cell_border = req[0] }));
    try std.testing.expect(try baseline_history.undo(baseline));
    const start = measured.alloc_index;
    try std.testing.expect(try baseline_history.apply(baseline, .{ .set_cell_borders = &req }));
    const count = measured.alloc_index - start;
    try std.testing.expect(count > 3);
    for ([_]usize{ 0, count / 2, count - 1 }) |offset| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const session = try edit.Session.open(failing.allocator(), bytes);
        defer session.close();
        var history = try History.init(failing.allocator(), session, 8, 8_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .set_cell_border = req[0] }));
        try std.testing.expect(try history.undo(session));
        const before = try saved(session);
        defer a.free(before);
        const revision = history.revision();
        failing.fail_index = failing.alloc_index + offset;
        const result = history.apply(session, .{ .set_cell_borders = &req });
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expectError(error.OutOfMemory, result);
        try std.testing.expectEqual(revision, history.revision());
        try expectBytes(session, before);
        try std.testing.expect(try history.redo(session));
        try std.testing.expect(try history.undo(session));
        try std.testing.expect(try history.apply(session, .{ .set_cell_borders = &req }));
    }
}
