const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const snapshots = @import("formula_snapshot.zig");

fn failures(a: std.mem.Allocator, session: *Session) !void {
    const rows = try session.formulaSources(a, 0);
    defer snapshots.deinit(a, rows);
    try std.testing.expectEqual(@as(usize, 13), rows.len);
    try std.testing.expectEqual(@as(u32, 118), rows[0].source_node);
    try std.testing.expectEqualStrings("=AVG(B?:E?)", rows[0].formula);
    try std.testing.expectEqualStrings("16.875", rows[0].last_result);
    try std.testing.expect(rows[0].derived);
}

test "HWP5 formula snapshot owns current values and leaves edited source unchanged through all read allocations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    const original = try session.formulaSources(a, 0);
    defer snapshots.deinit(a, original);
    try std.testing.expectEqualStrings("=SUM(B?:E?)", original[0].formula);
    try std.testing.expectEqualStrings("67.5", original[0].last_result);
    try std.testing.expect(!original[0].derived);
    try session.apply(.{ .set_formula_definition = .{ .section = 0, .source_node = 118, .formula = "=AVG(B?:E?)" } });
    const before = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    try @import("../../testing/allocation_failures.zig").check(failures, .{session});
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
    try std.testing.expectEqualStrings("=SUM(B?:E?)", original[0].formula);
    try std.testing.expectError(error.InvalidSection, session.formulaSources(a, 99));
}
