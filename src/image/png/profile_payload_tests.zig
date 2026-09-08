const std = @import("std");
const t = std.testing;
const expectRejected = @import("inspection_test_helpers.zig").expectRejected;
fn inspect(a: std.mem.Allocator) !void {
    const raw = try @import("../icc/tag_fixture.zig").make(a, 156, &.{.{ .signature = "rTRC".*, .offset = 144, .size = 12 }});
    defer a.free(raw);
    raw[12..16].* = "mntr".*;
    raw[16..20].* = "RGB ".*;
    raw[20..24].* = "XYZ ".*;
    raw[144..148].* = "curv".*;
    const payload = try @import("embedded_profile_fixture.zig").payload(a, "P", raw);
    defer a.free(payload);
    const bytes = try @import("pixels_fixture.zig").withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = payload }});
    defer a.free(bytes);
    const pixels = @import("pixels.zig");
    const plain = try pixels.inspect(a, bytes, .{});
    try t.expect(plain.profile != null);
    try t.expect(plain.profile.?.payloads == null);
    const checked = try pixels.inspect(a, bytes, .{ .profile = .{ .layout = .bounded, .payloads = .{ .edition = .v4_2022 } } });
    try t.expect(checked.profile != null);
    try t.expect(checked.profile.?.payloads != null);
    const report = checked.profile.?.payloads.?;
    try t.expectEqual(@as(usize, 1), report.tags);
    try t.expectEqual(@as(usize, 1), report.trc);
    try t.expectEqual(@as(usize, 12), report.payload_bytes);
    try t.expect(report.semantics_deferred and checked.color_semantics_deferred);
    try t.expectEqual(@as(usize, 1), checked.structure.ancillary_chunks_deferred);
    try expectRejected(a, bytes, .{ .profile = .{ .layout = .bounded, .payloads = .{ .edition = .v4_2022, .max_payload_bytes = 11 } } }, error.LimitExceeded);
    try expectRejected(a, bytes, .{ .profile = .{ .layout = .bounded, .payloads = .{ .edition = .v2_2001 } } }, error.IccEditionMismatch);
}
test "PNG payload selection survives cleanup and checks all allocation failures" {
    try inspect(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, inspect, .{});
}
