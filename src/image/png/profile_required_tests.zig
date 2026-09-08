const std = @import("std");
const t = std.testing;
fn inspect(a: std.mem.Allocator) !void {
    const fixture = @import("embedded_profile_fixture.zig");
    var raw = fixture.emptyProfile("RGB ".*);
    raw[12..16].* = "mntr".*;
    raw[20..24].* = "XYZ ".*;
    const payload = try fixture.payload(a, "P", &raw);
    defer a.free(payload);
    const bytes = try @import("pixels_fixture.zig").withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = payload }});
    defer a.free(bytes);
    const pixels = @import("pixels.zig");
    const plain = try pixels.inspect(a, bytes, .{});
    try t.expect(plain.profile != null);
    try t.expect(plain.profile.?.required == null);
    const checked = try pixels.inspect(a, bytes, .{ .profile = .{ .layout = .bounded, .required = .{ .edition = .v4_2022, .model = .matrix, .measurement_white = .different } } });
    try t.expect(checked.profile != null);
    try t.expect(checked.profile.?.required != null);
    const r = checked.profile.?.required.?;
    try t.expectEqual(@as(usize, 10), r.missing.count());
    try t.expect(r.missing.contains(.chad));
    try t.expect(!r.adaptation_condition_deferred);
    try t.expect(r.payloads_deferred and r.computational_model_deferred);
    try t.expect(checked.profile.?.semantics_deferred and checked.color_semantics_deferred);
    try t.expectEqual(@as(usize, 1), checked.structure.ancillary_chunks_deferred);
}
test "PNG required selection survives owned profile cleanup and allocation failures" {
    try inspect(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, inspect, .{});
}
