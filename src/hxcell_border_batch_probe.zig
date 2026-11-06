//! Main-owned serialized Native execution only. No fixture discovery.
const std = @import("std");
const t = std.testing;
const editor = @import("hwpx/editor_session.zig");
const history = @import("hwpx/editor_history.zig");
const Request = @import("hwpx/hxcell_border_batch.zig").Request;
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx";
fn two(session: *editor.Session) ![2]Request {
    const bindings = try @import("hwpx/table_display_bindings.zig").read(session.allocator, session, 0);
    defer session.allocator.free(bindings);
    var result: [2]Request = undefined;
    var count: usize = 0;
    for (bindings) |binding| {
        if (count != 0 and result[0].list_node == binding.owner.list_node) continue;
        result[count] = .{ .section = 0, .table_node = @intCast(binding.owner.table_node), .list_node = @intCast(binding.owner.list_node), .edges = 15, .style = .DOUBLE_SLIM, .width_hundredth_mm = 500, .color = 0x123456 };
        count += 1;
        if (count == 2) return result;
    }
    return error.MissingTestCell;
}
fn command(requests: []const Request) history.Command {
    return .{ .kind = .cell_borders, .cell_borders = requests, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
test "HWPX original border batch atomic duplicate limit late invalid owner and save failure" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const requests = try two(&session);
    try t.expect(!try session.applyCellBorders(&.{}));
    try t.expectError(error.DuplicateCellBorderTarget, session.applyCellBorders(&.{ requests[0], requests[0] }));
    const large = try a.alloc(Request, 4097);
    defer a.free(large);
    @memset(large, requests[0]);
    try t.expectError(error.LimitExceeded, session.applyCellBorders(large));
    var invalid = requests;
    invalid[1].table_node = std.math.maxInt(u32);
    try t.expectError(error.InvalidCellBackgroundOwner, session.applyCellBorders(&invalid));
    try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
    const limit = session.options.max_output_bytes;
    session.options.max_output_bytes = 1;
    try t.expectError(error.LimitExceeded, session.applyCellBorders(&requests));
    session.options.max_output_bytes = limit;
    const unchanged = try session.save();
    defer a.free(unchanged);
    try t.expectEqualSlices(u8, input, unchanged);
}
test "HWPX original border batch V1 V2 one history owned request lifetime noop redo save reopen" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = v2;
        var requests = try two(&session);
        requests[1].edges = 5;
        requests[1].style = .NONE;
        requests[1].width_hundredth_mm = 12;
        requests[1].color = 0;
        try t.expect(try session.setCellBackground(requests[0].section, requests[0].table_node, requests[0].list_node, 0x654321));
        const baseline = try session.save();
        defer a.free(baseline);
        var h = if (v2) try history.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try history.History.init(&session, 8, 8_000_000);
        defer h.deinit();
        try t.expect(try h.apply(&session, command(&requests)));
        try t.expectEqual(@as(usize, 2), session.cell_backgrounds.items.len);
        try t.expectEqual(@as(?u32, 0x654321), session.cell_backgrounds.items[0].color);
        const revision = h.revision();
        try t.expect(!try h.apply(&session, command(&requests)));
        try t.expectEqual(revision, h.revision());
        const saved = try session.save();
        defer a.free(saved);
        // The synchronous borrowed buffer is not a retained history payload.
        requests[0].color = 0xffffff;
        requests[1].table_node = std.math.maxInt(u32);
        try t.expect(try h.undo(&session));
        try t.expect(!try h.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try t.expectEqualSlices(u8, baseline, undone);
        try t.expect(try h.redo(&session));
        try t.expect(!try h.redo(&session));
        try t.expectEqual(revision, h.revision());
        const redone = try session.save();
        defer a.free(redone);
        try t.expectEqualSlices(u8, saved, redone);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const resaved = try reopened.save();
        defer a.free(resaved);
        try t.expectEqualSlices(u8, saved, resaved);
    }
}

test "HWPX original border batch binding sizes indexed first duplicate wins unrelated invalid retained" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const binding = @import("hwpx/table_display_bindings.zig");
    const before = try binding.read(a, &session, 0);
    defer a.free(before);
    try t.expect(before.len > 0);
    const node = before[0].owner.cell_node;
    const sizes = &session.sections[0].cell_sizes;
    try sizes.append(a, .{ .cell_node = std.math.maxInt(usize), .size = .{ .width = 99, .height = 88 } });
    try sizes.append(a, .{ .cell_node = node, .size = .{ .width = 123, .height = 456 } });
    try sizes.append(a, .{ .cell_node = node, .size = .{ .width = 777, .height = 888 } });
    const after = try binding.read(a, &session, 0);
    defer a.free(after);
    try t.expectEqual(before.len, after.len);
    for (before, after) |old, now| {
        try t.expectEqual(old.owner.cell_node, now.owner.cell_node);
        try t.expectEqual(old.owner.list_node, now.owner.list_node);
        if (now.owner.cell_node == node) {
            try t.expectEqual(@as(?u32, 123), now.owner.cell.width);
            try t.expectEqual(@as(?u32, 456), now.owner.cell.height);
        } else {
            try t.expectEqual(old.owner.cell.width, now.owner.cell.width);
            try t.expectEqual(old.owner.cell.height, now.owner.cell.height);
        }
    }
}

test "HWPX original border batch sampled OOM retains background revision and redo" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |managed| {
        var measured = std.testing.FailingAllocator.init(a, .{});
        var baseline = try editor.open(measured.allocator(), input, .{});
        defer baseline.deinit();
        baseline.history_delta_managed = managed;
        const req = try two(&baseline);
        try t.expect(try baseline.setCellBackground(req[0].section, req[0].table_node, req[0].list_node, 0x654321));
        var baseline_history = if (managed) try history.History.initV2(&baseline, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try history.History.init(&baseline, 8, 8_000_000);
        defer baseline_history.deinit();
        try t.expect(try baseline_history.apply(&baseline, command(req[0..1])));
        try t.expect(try baseline_history.undo(&baseline));
        const start = measured.alloc_index;
        try t.expect(try baseline_history.apply(&baseline, command(&req)));
        const count = measured.alloc_index - start;
        try t.expect(count > 3);
        for ([_]usize{ 0, count / 2, count - 1 }) |offset| {
            var failing = std.testing.FailingAllocator.init(a, .{});
            {
                var session = try editor.open(failing.allocator(), input, .{});
                defer session.deinit();
                session.history_delta_managed = managed;
                try t.expect(try session.setCellBackground(req[0].section, req[0].table_node, req[0].list_node, 0x654321));
                var h = if (managed) try history.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try history.History.init(&session, 8, 8_000_000);
                defer h.deinit();
                try t.expect(try h.apply(&session, command(req[0..1])));
                try t.expect(try h.undo(&session));
                const revision = h.revision();
                const before = try session.save();
                defer failing.allocator().free(before);
                failing.fail_index = failing.alloc_index + offset;
                const result = h.apply(&session, command(&req));
                failing.fail_index = std.math.maxInt(usize);
                try t.expectError(error.OutOfMemory, result);
                try t.expect(failing.has_induced_failure);
                try t.expectEqual(revision, h.revision());
                const after = try session.save();
                defer failing.allocator().free(after);
                try t.expectEqualSlices(u8, before, after);
                try t.expectEqual(@as(?u32, 0x654321), session.cell_backgrounds.items[0].color);
                try t.expect(try h.redo(&session));
                try t.expect(try h.undo(&session));
                try t.expect(try h.apply(&session, command(&req)));
            }
            try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
        }
    }
}
