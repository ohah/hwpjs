const std = @import("std");
const t = std.testing;
const f = @import("document/test_fixture.zig");
const policy = @import("feature_policy.zig");
const Header = @import("file_header.zig").Header;
test "distribution policy preserves encryption DRM and version rejection precedence" {
    var bytes = f.header();
    for (0..64) |bits| {
        const positions = [_]u5{ 1, 2, 4, 8, 10, 14 };
        var flags: u32 = 0;
        for (positions, 0..) |position, i| if (bits & (@as(usize, 1) << @intCast(i)) != 0) {
            flags |= @as(u32, 1) << position;
        };
        f.put(&bytes, 36, u32, flags);
        const h = try Header.parse(&bytes);
        for ([_]policy.Distribution{ .reject, .observed_viewtext }) |selected| {
            const expected: ?anyerror = if (flags & (2 | 256) != 0) error.UnsupportedEncryption else if (flags & (16 | 1024) != 0) error.UnsupportedDrm else if (flags & 4 != 0 and selected == .reject) error.UnsupportedDistribution else null;
            if (expected) |err| try t.expectError(err, policy.requireSupported(&h, selected)) else try policy.requireSupported(&h, selected);
            try t.expectEqualSlices(u8, &bytes, &h.raw);
        }
    }
    f.put(&bytes, 32, u32, 0x06000000);
    const unsupported = try Header.parse(&bytes);
    try t.expectError(error.UnsupportedVersion, policy.requireSupported(&unsupported, .observed_viewtext));
}
test "distribution policy ordinary decoding stays explicit bounded and owned" {
    const stream = @import("stream.zig");
    var bytes = f.header();
    f.put(&bytes, 36, u32, 4);
    const h = try Header.parse(&bytes);
    try t.expectError(error.UnsupportedDistribution, stream.decode(t.allocator, &h, "abc", 3));
    var input = [_]u8{ 'a', 'b', 'c' };
    const plain = try stream.decodeWithPolicy(t.allocator, &h, &input, 3, .observed_viewtext);
    defer t.allocator.free(plain);
    input[0] = 'z';
    try t.expectEqualSlices(u8, "abc", plain);
    try t.expectError(error.LimitExceeded, stream.decodeWithPolicy(t.allocator, &h, &input, 2, .observed_viewtext));
    try t.expectEqualSlices(u8, &bytes, &h.raw);
}
fn decoded(a: std.mem.Allocator) !void {
    var header = f.header();
    f.put(&header, 36, u32, 4);
    const doc = try f.docInfo(a, 1);
    defer a.free(doc);
    const body = try f.section(a);
    defer a.free(body);
    const d = @import("document/validation.zig");
    const input: d.Input = .{ .header = &header, .doc_info = doc, .sections = &.{.{ .index = 0, .bytes = body }} };
    var options: d.Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
    try t.expectError(error.UnsupportedDistribution, d.inspectDecoded(a, input, options));
    options.distribution = .observed_viewtext;
    var report = try d.inspectDecoded(a, input, options);
    defer report.deinit(a);
    try t.expectEqualSlices(u8, &header, &report.header.raw);
    try t.expect(report.header.has(.distribution));
    try t.expectEqual(@as(usize, 1), report.sections.len);
}
test "distribution policy decoded document retains original header through allocation failures" {
    try decoded(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, decoded, .{});
}
