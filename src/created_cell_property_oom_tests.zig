//! Separate, unexecuted actual-mutation OOM cohort; never part of the wire filter.
const std = @import("std");
const a = std.testing.allocator;
const Table = @import("model/created_table.zig");
const Request = @import("model/created_cell_properties_values.zig").Request;
fn run(comptime hwp5: bool) !void {
    const input = if (hwp5) try @import("new_document/root.zig").hwp5(a) else try @import("new_document/root.zig").hwpx(a);
    defer a.free(input);
    var offset: usize = 0;
    while (true) : (offset += 1) {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        defer std.testing.expectEqual(failing.allocated_bytes, failing.freed_bytes) catch @panic("property OOM trial leaked");
        const Session = if (hwp5) @import("hwp5/edit/style_preservation.zig").Session else @import("hwpx/editor_session.zig").Session;
        const History = if (hwp5) @import("hwp5/edit/editor_history.zig").History else @import("hwpx/editor_history.zig").History;
        var hx_session: if (hwp5) void else Session = if (hwp5) {} else try @import("hwpx/editor_session.zig").open(fa, input, .{});
        const session = if (hwp5) try Session.open(fa, input) else &hx_session;
        defer {
            if (hwp5) session.close() else session.deinit();
        }
        if (hwp5) session.enableHistoryDelta() else session.history_delta_managed = true;
        var history = if (hwp5) try History.initV2(fa, session, .{}) else try History.initV2(session, .{});
        defer history.deinit();
        var table = if (hwp5) block: {
            var ids = try session.planTableIdsWithAllocator(fa, 4);
            defer ids.deinit(fa);
            break :block try Table.create(fa, ids.identity, ids.instance_id, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
        } else try @import("hwpx/created_table_prepare.zig").prepare(session, 0, 1, 0, 2, 2, 200, 20, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
        defer table.deinit(fa);
        if (hwp5) {
            try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 16, .table = &table, .options = @import("new_document/hwp5_profile_test_options.zig").creationOptions() } }));
        } else {
            try std.testing.expect(try history.apply(session, .{ .kind = .created_table_stage, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
        }
        // Leave a real prior redo branch; rejected property mutation must retain it.
        var request: Request = .{ .address = .{ .section = 0, .identity = table.identity, .row = 0, .column = 1 }, .expected_ticket = if (hwp5) try session.historyTicket() else try session.createdCellPropertiesTicket(), .expected = .{ .width = 100, .height = 20 }, .size = .{ .width = 110 }, .appearance = .{ .background = .{ .solid = .{ .color = 0x123456 } } } };
        if (hwp5) {
            try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = request }));
        } else {
            try std.testing.expect(try history.apply(session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
        }
        try std.testing.expect(try history.undo(session));
        request.expected_ticket = if (hwp5) try session.historyTicket() else try session.createdCellPropertiesTicket();
        const before = if (hwp5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
        defer if (hwp5) a.free(before) else fa.free(before);
        const revision = history.revision();
        failing.fail_index = try std.math.add(usize, failing.alloc_index, offset);
        failing.resize_fail_index = try std.math.add(usize, failing.resize_index, offset);
        const changed = (if (hwp5) history.apply(session, .{ .edit_created_cell_properties = request }) else history.apply(session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request })) catch |err| {
            const induced = failing.has_induced_failure;
            failing.fail_index = std.math.maxInt(usize);
            failing.resize_fail_index = std.math.maxInt(usize);
            if (err != error.OutOfMemory or !induced) return err;
            try std.testing.expectEqual(revision, history.revision());
            const after = if (hwp5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
            defer if (hwp5) a.free(after) else fa.free(after);
            try std.testing.expectEqualSlices(u8, before, after);
            try std.testing.expect(try history.redo(session));
            continue;
        };
        failing.fail_index = std.math.maxInt(usize);
        failing.resize_fail_index = std.math.maxInt(usize);
        try std.testing.expect(changed);
        if (!failing.has_induced_failure) break;
    }
}
test "created cell actual mutation OOM H5 full saved bytes and valid prior redo" {
    try run(true);
}
test "created cell actual mutation OOM HX full saved bytes and valid prior redo" {
    try run(false);
}
