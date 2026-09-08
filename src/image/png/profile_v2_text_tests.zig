const std = @import("std");
const t = std.testing;
fn inspect(a: std.mem.Allocator) !void {
    const raw = try @import("../icc/v2_text_fixture.zig").make(a);
    defer a.free(raw);
    const dispatch = @import("../icc/tag_payload.zig");
    const description = try dispatch.parse("desc".*, raw[156..253], .v2_2001, .{});
    try t.expect(description == .description_v2);
    try t.expectEqual(@intFromPtr(raw.ptr) + 168, @intFromPtr(description.description_v2.ascii.ptr));
    try t.expect(description.description_v2.unicode_deferred);
    const copyright = try dispatch.parse("cprt".*, raw[256..266], .v2_2001, .{});
    try t.expect(copyright == .copyright_v2);
    try t.expectEqualSlices(u8, "B\x00", copyright.copyright_v2);
    const payload = try @import("embedded_profile_fixture.zig").payload(a, "P", raw);
    defer a.free(payload);
    const bytes = try @import("pixels_fixture.zig").withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = payload }});
    defer a.free(bytes);
    const out = try @import("pixels.zig").inspect(a, bytes, .{ .profile = .{ .layout = .bounded, .payloads = .{ .edition = .v2_2001, .max_payload_bytes = 107 } } });
    try t.expect(out.profile != null);
    try t.expect(out.profile.?.payloads != null);
    const r = out.profile.?.payloads.?;
    try t.expectEqual(@as(usize, 2), r.tags);
    try t.expectEqual(@as(usize, 107), r.payload_bytes);
    try t.expectEqual(@as(usize, 1), r.v2_description);
    try t.expectEqual(@as(usize, 1), r.v2_copyright);
    try t.expectEqual(@as(usize, 4), r.v2_unicode_bytes_deferred);
    try t.expectEqual(@as(usize, 67), r.v2_script_bytes_deferred);
    try t.expectEqual(@as(usize, 1), r.v2_trailing_bytes_deferred);
    try t.expectEqual(@as(usize, 0), r.unicode_bytes);
    try t.expectEqual(@as(usize, 0), r.unsupported_edition);
    try t.expect(r.semantics_deferred and out.color_semantics_deferred);
    try t.expectEqual(@as(usize, 1), out.structure.ancillary_chunks_deferred);
}
test "PNG v2 text keeps raw Unicode deferred after profile cleanup" {
    try inspect(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, inspect, .{});
}
