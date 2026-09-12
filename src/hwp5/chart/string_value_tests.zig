const std = @import("std");
const t = std.testing;
const text = @import("string_value.zig");

// Odd UTF-16 offset, deliberately mismatching legacy text, BOM, spaces,
// ideographic space, embedded NUL, supplementary scalar, tab and newline.
const source = [_]u8{ 'X', 0, 0, 0xff, 0xfe, 0x20, 0, 0, 0x30, 0, 0, 0x3d, 0xd8, 0, 0xde, 9, 0, 10, 0, 0x20, 0, 0, 0 };
const wanted = "\u{feff} \u{3000}\x00\u{1f600}\t\n ";
fn success(a: std.mem.Allocator) !void {
    var bytes = source;
    var value = try text.readObservedDual(a, &bytes, .{ .max_bytes = bytes.len, .max_utf8_bytes = wanted.len, .max_scalars = 8 });
    defer value.deinit();
    try t.expectEqualStrings(wanted, value.utf8);
    try t.expectEqual(@as(usize, 8), value.scalar_count);
    try t.expectEqual(@as(usize, 3), value.utf16_offset);
    try t.expect(value.legacy_bytes.ptr == bytes[0..].ptr);
    try t.expect(value.utf16le.ptr == bytes[3..].ptr);
    try t.expectEqual(@as(usize, 18), value.utf16le.len);
    bytes[3] = 0;
    bytes[0] = 'Y';
    try t.expectEqualStrings(wanted, value.utf8);
    try t.expectEqualStrings("Y", value.legacy_bytes);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, options: text.Options, expected: anyerror) !void {
    var value = text.readObservedDual(a, bytes, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    defer value.deinit();
    return error.ExpectedChartStringRejection;
}

test "chart string dual preserves Unicode source slices and owned UTF8" {
    try success(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, success, .{});
    for ([_]usize{ 0, 1, 2, 17, 256 }) |prefix| {
        const bytes = try t.allocator.alloc(u8, prefix + 8);
        defer t.allocator.free(bytes);
        @memset(bytes, 'x');
        @memcpy(bytes[prefix..][0..8], &[_]u8{ 0, 0, 0, 0xac, 0x20, 0, 0, 0 });
        var value = try text.readObservedDual(t.allocator, bytes, .{});
        defer value.deinit();
        try t.expectEqualStrings("가 ", value.utf8);
        try t.expectEqual(prefix + 2, value.utf16_offset);
    }
}

test "chart string dual distinguishes absent Unicode from empty and rejects invalid Unicode" {
    for ([_][]const u8{ &.{}, &.{0}, &.{ 0, 0 }, &.{ 0, 0, 0 }, "abc", &.{ 0, 0, 65, 0 }, &.{ 0, 0, 65, 0, 0 } }) |bytes|
        try reject(t.allocator, bytes, .{}, error.InvalidChartStringLayout);
    var empty = try text.readObservedDual(t.allocator, &.{ 0, 0, 0, 0 }, .{ .max_scalars = 0, .max_utf8_bytes = 0 });
    defer empty.deinit();
    try t.expectEqual(@as(usize, 0), empty.utf8.len);
    try t.expectEqual(@as(usize, 0), empty.scalar_count);
    // A valid first scalar allocates output before the late Unicode failure.
    try t.checkAllAllocationFailures(t.allocator, reject, .{ &[_]u8{ 'a', 0, 0, 65, 0, 0, 0xdc, 0, 0 }, text.Options{}, error.InvalidUnicodeEncoding });
    try t.checkAllAllocationFailures(t.allocator, reject, .{ &[_]u8{ 'a', 0, 0, 65, 0, 0, 0xd8, 0, 0 }, text.Options{}, error.UnexpectedEnd });
}

test "chart string dual independent budgets clean up partial UTF8 allocations" {
    for ([_]text.Options{ .{ .max_bytes = source.len - 1 }, .{ .max_utf8_bytes = wanted.len - 1 }, .{ .max_scalars = 7 } }) |options| {
        try t.checkAllAllocationFailures(t.allocator, reject, .{ &source, options, error.LimitExceeded });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("chart string leak");
        try reject(gpa.allocator(), &source, options, error.LimitExceeded);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}

test "chart string dual all cuts distinguish an earlier complete frame from truncation" {
    for (0..source.len) |cut| {
        if (cut == 11) {
            // Embedded NUL can terminate a shorter explicitly bounded input.
            var value = try text.readObservedDual(t.allocator, source[0..cut], .{});
            defer value.deinit();
            try t.expectEqualStrings("\u{feff} \u{3000}", value.utf8);
        } else try reject(t.allocator, source[0..cut], .{}, error.InvalidChartStringLayout);
    }
    const bytes = try t.allocator.alloc(u8, 65535);
    defer t.allocator.free(bytes);
    @memset(bytes, 'x');
    @memcpy(bytes[65527..][0..8], &[_]u8{ 0, 0, 0x3d, 0xd8, 0, 0xde, 0, 0 });
    var value = try text.readObservedDual(t.allocator, bytes, .{ .max_bytes = bytes.len, .max_utf8_bytes = 4, .max_scalars = 1 });
    defer value.deinit();
    try t.expectEqualStrings("\u{1f600}", value.utf8);
    try t.expectEqual(@as(usize, 65529), value.utf16_offset);
}
