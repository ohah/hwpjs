const std = @import("std");
const t = std.testing;
const fixture = @import("embedded_profile_fixture.zig");
const png = @import("pixels_fixture.zig");
const pixels = @import("pixels.zig");
fn inspect(a: std.mem.Allocator) !void {
    const payload = try fixture.payload(a, "Profile", &fixture.emptyProfile("RGB ".*));
    defer a.free(payload);
    const bytes = try png.withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = payload }});
    defer a.free(bytes);
    const report = try pixels.inspect(a, bytes, .{});
    try t.expect(report.profile != null);
    try t.expect(report.profile.?.semantics_deferred and report.color_semantics_deferred);
    try t.expectEqual(@as(usize, 132), report.profile.?.profile_bytes);
    try t.expectEqual(@as(usize, 1), report.structure.ancillary_chunks_deferred);
    try t.expectEqual(payload.len, report.structure.ancillary_bytes_deferred);
}
test "PNG pixel inspection connects ICC bounds without clearing deferred semantics" {
    try inspect(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, inspect, .{});
}
test "PNG pixel inspection rejects duplicate late mismatched and oversized profiles" {
    const a = t.allocator;
    const payload = try fixture.payload(a, "P", &fixture.emptyProfile("RGB ".*));
    defer a.free(payload);
    const extra = png.Extra{ .name = "iCCP", .bytes = payload };
    const duplicate = try png.withEarlyMetadata(a, 0, &.{ extra, extra });
    defer a.free(duplicate);
    try t.expectError(error.DuplicatePngProfile, pixels.inspect(a, duplicate, .{}));
    const late = try png.withMetadata(a, 0, &.{extra});
    defer a.free(late);
    try t.expectError(error.InvalidPngProfileOrder, pixels.inspect(a, late, .{}));
    const good = try png.withEarlyMetadata(a, 0, &.{extra});
    defer a.free(good);
    try t.expectError(error.LimitExceeded, pixels.inspect(a, good, .{ .profile = .{ .layout = .bounded, .envelope = .{ .max_profile_bytes = 131 } } }));
    const gray = try fixture.payload(a, "P", &fixture.emptyProfile("GRAY".*));
    defer a.free(gray);
    const mismatch = try png.withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = gray }});
    defer a.free(mismatch);
    try t.expectError(error.InvalidPngProfileColorSpace, pixels.inspect(a, mismatch, .{}));
}
test "PNG profile collector rejects profile after IDAT without allocating" {
    var c: @import("profile_collector.zig").Collector = .{};
    const h = @import("header.zig").Header{ .width = 1, .height = 1, .bit_depth = 8, .color_type = 2, .interlace = 0 };
    try c.consume(t.allocator, h, .{ .name = "IDAT".*, .payload = &.{}, .raw = &.{} }, .{ .layout = .bounded });
    try t.expectError(error.InvalidPngProfileOrder, c.consume(t.allocator, h, .{ .name = "iCCP".*, .payload = &.{}, .raw = &.{} }, .{ .layout = .bounded }));
}
