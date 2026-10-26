const std = @import("std");
const Session = @import("style_preservation.zig").Session;
test "HWP5 current form anchors preserve repeated token order across prefix and reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/calendar_monthly.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const s = try Session.open(a, input);
    defer s.close();
    const original = try s.formAnchors(a, 0);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 4), original.len);
    try std.testing.expectEqual(original[0].paragraph, original[1].paragraph);
    try std.testing.expect(original[0].current_unit < original[1].current_unit);
    try std.testing.expect(original[1].current_unit < original[2].current_unit);
    const sources = try s.formSources(a, 0);
    defer a.free(sources);
    const paragraph = original[0].paragraph;
    try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "양식😀" } });
    const changed = try s.formAnchors(a, 0);
    defer a.free(changed);
    for (original, changed) |before, after| {
        try std.testing.expectEqual(before.control_node, after.control_node);
        try std.testing.expectEqual(before.object_node, after.object_node);
        try std.testing.expectEqual(before.source_unit, after.source_unit);
        try std.testing.expectEqual(before.current_unit + @as(u32, if (before.paragraph == paragraph) 4 else 0), after.current_unit);
    }
    const stable = try s.formSources(a, 0);
    defer a.free(stable);
    try std.testing.expectEqualDeep(sources, stable);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, session: *const Session, expected: []const @import("form_anchor_positions.zig").Anchor) !void {
            const rows = try session.formAnchors(allocator, 0);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(expected, rows);
        }
    }.run, .{ s, changed });
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.formAnchors(a, 0);
    defer a.free(restored);
    for (changed, restored) |before, after| {
        try std.testing.expectEqual(before.paragraph, after.paragraph);
        try std.testing.expectEqual(before.current_unit, after.current_unit);
        try std.testing.expectEqual(after.source_unit, after.current_unit);
    }
    try std.testing.expectError(error.InvalidSection, s.formAnchors(a, 1));
}
