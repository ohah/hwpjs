const std = @import("std");
const t = std.testing;
const mluc = @import("mluc.zig");
const unicode = @import("mluc_unicode.zig");
fn fixture() [50]u8 {
    var b: [50]u8 = @splat(0);
    @memcpy(b[0..4], "mluc");
    std.mem.writeInt(u32, b[8..12], 2, .big);
    std.mem.writeInt(u32, b[12..16], 12, .big);
    for ([_]usize{ 16, 28 }) |o| {
        @memcpy(b[o..][0..4], "enUS");
        std.mem.writeInt(u32, b[o + 4 ..][0..4], 10, .big);
        std.mem.writeInt(u32, b[o + 8 ..][0..4], 40, .big);
    }
    @memcpy(b[40..], &[_]u8{ 0xfe, 0xff, 0, 0, 0xd8, 0, 0xdc, 0, 0, 0 });
    return b;
}
fn allocationCheck(a: std.mem.Allocator) !void {
    const b = fixture();
    const r = try unicode.inspect(a, try mluc.parse(&b, .{}), .{});
    try t.expectEqual(@as(usize, 1), r.unique_strings);
}
test "mluc Unicode exact deduplication retains per-record counts and limits" {
    const b = fixture();
    const view = try mluc.parse(&b, .{});
    const r = try unicode.inspect(t.allocator, view, .{ .max_unique_bytes = 10 });
    try t.expectEqual(@as(usize, 1), r.unique_strings);
    try t.expectEqual(@as(usize, 10), r.inspected_bytes);
    try t.expectEqual(@as(u64, 8), r.scalars);
    try t.expectEqual(@as(u64, 4), r.nul_scalars);
    try t.expectEqual(@as(u64, 2), r.bom_scalars);
    try t.expectEqual(@as(usize, 2), r.nul_terminated_records);
    try t.expect(r.locale_deferred);
    try t.expectError(error.LimitExceeded, unicode.inspect(t.allocator, view, .{ .max_unique_bytes = 9 }));
    try t.expectError(error.LimitExceeded, unicode.inspect(t.allocator, view, .{ .max_records = 1 }));
    try t.checkAllAllocationFailures(t.allocator, allocationCheck, .{});
}
test "overlap cannot hide an unpaired surrogate and failure releases cache" {
    for ([_]u32{ 44, 46 }, [_]anyerror{ error.UnexpectedEnd, error.InvalidUnicodeEncoding }) |offset, err| {
        var b = fixture();
        std.mem.writeInt(u32, b[32..36], 2, .big);
        std.mem.writeInt(u32, b[36..40], offset, .big);
        try t.expectError(err, unicode.inspect(t.allocator, try mluc.parse(&b, .{}), .{}));
    }
}
