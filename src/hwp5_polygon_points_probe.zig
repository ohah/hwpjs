test {
    _ = @import("hwp5/edit/drawing_polygon_points.zig");
}

test "polygon session lookup follows current input save reopen and history" {
    const std = @import("std");
    const a = std.testing.allocator;
    const points = @import("hwp5/edit/drawing_polygon_points.zig");
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/sungeo.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    try std.testing.expectError(error.InvalidSection, session.drawingPolygonPoints(a, session.sectionCount(), .observed_i32_points));
    const before = try session.drawingPolygonPoints(a, 0, .observed_i32_points);
    defer points.free(a, before);
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "좌표검증" } }));
    const changed = try session.drawingPolygonPoints(a, 0, .observed_i32_points);
    defer points.free(a, changed);
    try std.testing.expectEqualDeep(before, changed);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const after = try reopened.drawingPolygonPoints(a, 0, .observed_i32_points);
    defer points.free(a, after);
    try std.testing.expectEqual(before.len, after.len);
    for (before, after) |old, current| {
        try std.testing.expectEqualDeep(old.raw_points, current.raw_points);
        try std.testing.expectEqualDeep(old.points, current.points);
        try std.testing.expectEqual(old.extra_bytes, current.extra_bytes);
    }
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
