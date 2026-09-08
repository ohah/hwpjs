const std = @import("std");
const t = std.testing;
const reject = @import("inspection_test_helpers.zig").expectRejected;
fn inspect(a: std.mem.Allocator, valid: bool) !void {
    const raw = try @import("../icc/v2_text_fixture.zig").make(a);
    defer a.free(raw);
    if (valid) std.mem.writeInt(u16, raw[178..180], 0xfeff, .big);
    const payload = try @import("embedded_profile_fixture.zig").payload(a, "P", raw);
    defer a.free(payload);
    const bytes = try @import("pixels_fixture.zig").withEarlyMetadata(a, 0, &.{.{ .name = "iCCP", .bytes = payload }});
    defer a.free(bytes);
    const pixels = @import("pixels.zig");
    var options: pixels.Options = .{ .profile = .{ .layout = .bounded, .payloads = .{ .edition = .v2_2001, .max_unicode_bytes = 4 } } };
    const plain = try pixels.inspect(a, bytes, options);
    try t.expect(plain.profile != null and plain.profile.?.payloads != null);
    try t.expect(!plain.profile.?.payloads.?.v2_unicode_utf16be_selected);
    try t.expectEqual(@as(usize, 4), plain.profile.?.payloads.?.v2_unicode_bytes_deferred);
    options.profile.payloads.?.v2_unicode_utf16be = true;
    if (valid) {
        const out = try pixels.inspect(a, bytes, options);
        try t.expect(out.profile != null and out.profile.?.payloads != null);
        const r = out.profile.?.payloads.?;
        try t.expect(r.v2_unicode_utf16be_selected);
        try t.expectEqual(@as(usize, 1), r.v2_unicode_descriptions_checked);
        try t.expectEqual(@as(usize, 4), r.unicode_bytes);
        try t.expectEqual(@as(usize, 0), r.v2_unicode_bytes_deferred);
        try t.expectEqual(@as(usize, 2), r.v2_unicode_scalars);
        try t.expectEqual(@as(usize, 1), r.v2_unicode_nul_scalars);
        try t.expectEqual(@as(usize, 1), r.v2_unicode_bom_scalars);
        try t.expectEqual(@as(usize, 67), r.v2_script_bytes_deferred);
        try t.expectEqual(@as(usize, 1), r.v2_trailing_bytes_deferred);
        try t.expect(r.semantics_deferred and out.color_semantics_deferred);
    } else try reject(a, bytes, options, error.InvalidUnicodeEncoding);
    options.profile.payloads.?.max_unicode_bytes = 3;
    try reject(a, bytes, options, error.LimitExceeded);
}
test "PNG explicit v2 UTF16BE selection preserves deferrals and cleans all failures" {
    for ([_]bool{ false, true }) |valid| {
        try inspect(t.allocator, valid);
        try t.checkAllAllocationFailures(t.allocator, inspect, .{valid});
    }
}
