const std = @import("std");
const t = std.testing;
const p = @import("parser.zig");
const put = @import("../document/test_fixture.zig").put;
pub fn fixture() [92]u8 {
    var b = [_]u8{0} ** 92;
    put(&b, 0, u16, 0xfffe);
    put(&b, 24, u32, 1);
    @memcpy(b[28..44], &@import("header.zig").hwp_fmt);
    put(&b, 44, u32, 48);
    put(&b, 48, u32, 44);
    put(&b, 52, u32, 2);
    put(&b, 56, u32, 14);
    put(&b, 60, u32, 24);
    put(&b, 64, u32, 12);
    put(&b, 68, u32, 32);
    put(&b, 72, u32, 3);
    put(&b, 76, i32, -1);
    put(&b, 80, u32, 64);
    put(&b, 84, u64, std.math.maxInt(u64));
    return b;
}
fn success(a: std.mem.Allocator, b: []const u8) !void {
    var doc = try p.Document.parse(a, b, 2);
    defer doc.deinit(a);
    try t.expectEqual(-1, doc.properties[0].value.i32);
    try t.expectEqual(std.math.maxInt(u64), doc.properties[1].value.filetime);
    try t.expect(doc.raw.ptr == b.ptr);
}
fn failure(a: std.mem.Allocator, b: []const u8) !void {
    var doc = p.Document.parse(a, b, 2) catch |err| switch (err) {
        error.DuplicateSummaryProperty => return,
        else => return err,
    };
    defer doc.deinit(a);
    return error.ExpectedSummaryFailure;
}
test "summary typed values preserve signed and 64-bit wire values and all allocation failures" {
    var b = fixture();
    try t.checkAllAllocationFailures(t.allocator, success, .{&b});
    put(&b, 64, u32, 14);
    try t.checkAllAllocationFailures(t.allocator, failure, .{&b});
}
test "summary rejects offsets into directory, unaligned/equal/reversed and declared overflow" {
    var b = fixture();
    for ([_]u32{ 0, 23, 25, 44, 0xffffffff }) |offset| {
        put(&b, 60, u32, offset);
        try t.expectError(error.InvalidSummaryOffset, p.Document.parse(t.allocator, &b, 2));
    }
    b = fixture();
    put(&b, 52, u32, 0xffffffff);
    try t.expectError(error.LimitExceeded, p.Document.parse(t.allocator, &b, 2));
    b = fixture();
    put(&b, 68, u32, 24);
    try t.expectError(error.InvalidSummaryOffset, p.Document.parse(t.allocator, &b, 2));
    b = fixture();
    put(&b, 60, u32, 32);
    put(&b, 68, u32, 24);
    try t.expectError(error.InvalidSummaryOffset, p.Document.parse(t.allocator, &b, 2));
    for (0..92) |n| {
        b = fixture();
        if (p.Document.parse(t.allocator, b[0..n], 2)) |value| {
            var unexpected = value;
            unexpected.deinit(t.allocator);
            return error.AcceptedTruncatedSummary;
        } else |_| {}
    }
}
test "summary typed text preserves zero-length versus terminator, raw surrogates and tails" {
    const v = @import("value.zig");
    const zero = try v.parse(2, &.{ 31, 0, 0, 0, 0, 0, 0, 0 });
    try t.expectEqual(0, zero.value.utf16.len);
    const terminated = try v.parse(2, &.{ 31, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 255 });
    try t.expectEqual(2, terminated.value.utf16.len);
    try t.expectEqualSlices(u8, &.{255}, terminated.extra);
    const unpaired = try v.parse(2, &.{ 31, 0, 0, 0, 2, 0, 0, 0, 0, 0xd8, 0, 0 });
    try t.expectEqualSlices(u8, &.{ 0, 0xd8, 0, 0 }, unpaired.value.utf16);
    const dictionary = try v.parse(0, &.{1});
    try t.expect(dictionary.value == .dictionary);
    const unknown = try v.parse(999, &.{ 0xff, 0xff, 0, 0, 1, 2 });
    try t.expect(unknown.value == .unsupported);
}
