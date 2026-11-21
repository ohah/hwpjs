//! Native source/History tests, awaiting a coordinated compiler slot.
const std = @import("std");
const t = @import("../../model/object_geometry.zig");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
fn observe(s: *const edit.Session, revision: u64) !t.Observation {
    const rows = try s.drawingSources(a, 0);
    defer a.free(rows);
    for (rows) |row| if (row.kind_id == 0x24726563) return s.objectGeometry(a, .{ .kind = .drawing, .section = 0, .node = @intCast(row.component_node) }, revision, .{ .session = "native-test", .serial = "0" });
    return error.MissingTextbox;
}
fn request(value: t.Observation) t.Request {
    return .{ .selector = value.selector, .owner = value.owner, .expected = value.frame, .historyRevision = value.historyRevision, .binding = value.binding, .patch = .{ .width = 20000, .height = 12000, .horizontalOffset = -500, .verticalOffset = 300, .treatAsCharacter = false } };
}
test "object geometry H5 textbox geometry preserves live text and supports one history transaction save undo redo reopen" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox.hwp", a, .limited(8_000_000));
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var initial = try observe(s, h.revision());
    defer initial.deinit(a);
    try std.testing.expect(try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = initial.owner.paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "앞😀" } }));
    var before = try observe(s, h.revision());
    defer before.deinit(a);
    try std.testing.expectEqual(initial.owner.anchorUnit + 3, before.owner.anchorUnit);
    const saved_before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved_before.bytes);
    const r = request(before);
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &r }));
    try std.testing.expectEqual(@as(u32, 2), h.revision());
    var after = try observe(s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqualDeep(try t.after(before.frame, r.patch), after.frame);
    try std.testing.expectEqual(before.owner.anchorUnit, after.owner.anchorUnit);
    const saved_after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved_after.bytes);
    const reopened = try edit.Session.open(a, saved_after.bytes);
    defer reopened.close();
    var restored = try observe(reopened, 0);
    defer restored.deinit(a);
    try std.testing.expectEqualDeep(after.frame, restored.frame);
    try std.testing.expectEqual(after.owner.anchorUnit, restored.owner.anchorUnit);
    try std.testing.expect(try h.undo(s));
    const undo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, saved_before.bytes, undo.bytes);
    try std.testing.expect(try h.redo(s));
    const redo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, saved_after.bytes, redo.bytes);
    try std.testing.expectError(error.StaleObjectGeometryBinding, h.apply(s, .{ .edit_object_geometry = &r }));
}
test "object geometry H5 late allocation failures retain original source and revision" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox.hwp", a, .limited(8_000_000));
    defer a.free(bytes);
    var tested: usize = 0;
    var completed = false;
    for (0..10000) |point| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const f = failing.allocator();
        const s = try edit.Session.open(f, bytes);
        defer s.close();
        s.enableHistoryDelta();
        var h = try History.initV2(f, s, .{});
        defer h.deinit();
        var before = try observe(s, h.revision());
        defer before.deinit(a);
        const saved_before = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved_before.bytes);
        const r = request(before);
        failing.fail_index = failing.alloc_index + point;
        const changed = h.apply(s, .{ .edit_object_geometry = &r }) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            if (err != error.OutOfMemory) return err;
            const after = try s.save(a, .{ .allow_stale_layout = true });
            defer a.free(after.bytes);
            try std.testing.expectEqualSlices(u8, saved_before.bytes, after.bytes);
            try std.testing.expectEqual(@as(u32, 0), h.revision());
            tested += 1;
            continue;
        };
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expect(changed);
        completed = true;
        break;
    }
    try std.testing.expect(completed and tested > 0);
}

comptime {
    _ = @import("chart_geometry_resize_tests.zig");
    _ = @import("chart_geometry_independent_tests.zig");
}
