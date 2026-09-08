const std = @import("std");
const t = std.testing;
const api = @import("text_description.zig");
const fixture = @import("text_description_fixture.zig").make;
test "ICC v2 description preserves unaligned counted regions and raw metadata" {
    for (1..9) |ascii| for ([_]usize{ 0, 1, 2, 3 }) |units| for ([_]u8{ 0, 1, 66, 67 }) |script| {
        const bytes = try fixture(t.allocator, ascii, units, script);
        defer t.allocator.free(bytes);
        const r = try api.parse(bytes, .{ .max_bytes = bytes.len });
        try t.expectEqual(ascii, r.ascii.len);
        try t.expectEqual(units * 2, r.unicode.len);
        try t.expectEqual(@as(usize, script), r.script.len);
        try t.expectEqual(@as(usize, 67 - script), r.script_unused.len);
        try t.expectEqual(@as(u32, 0x12345678), r.unicode_language);
        try t.expectEqual(@as(u16, 42), r.script_code);
        try t.expectEqual(@intFromPtr(bytes.ptr) + 12, @intFromPtr(r.ascii.ptr));
        try t.expectEqual(@intFromPtr(bytes.ptr) + 20 + ascii, @intFromPtr(r.unicode.ptr));
        try t.expectEqual(@as(usize, 0), r.trailing.len);
        try t.expect(r.unicode_deferred and r.script_deferred and r.language_deferred);
        try t.expectError(error.LimitExceeded, api.parse(bytes, .{ .max_bytes = bytes.len - 1 }));
    };
}
test "ICC v2 description truncation counts and terminators cannot escape bounds" {
    const bytes = try fixture(t.allocator, 3, 2, 2);
    defer t.allocator.free(bytes);
    for (0..bytes.len) |n| {
        if (api.parse(bytes[0..n], .{})) |_| return error.TestExpectedError else |_| {}
    }
    bytes[14] = 'x';
    try t.expectError(error.InvalidIccTextTerminator, api.parse(bytes, .{}));
    bytes[14] = 0;
    bytes[12] = 128;
    try t.expectError(error.InvalidIccAscii, api.parse(bytes, .{}));
    bytes[12] = 'a';
    bytes[26] = 1;
    try t.expectError(error.InvalidIccTextTerminator, api.parse(bytes, .{}));
    bytes[26] = 0;
    bytes[29] = 68;
    try t.expectError(error.InvalidIccScriptCount, api.parse(bytes, .{}));
    bytes[29] = 2;
    bytes[31] = 1;
    try t.expectError(error.InvalidIccTextTerminator, api.parse(bytes, .{}));
    bytes[31] = 0;
    std.mem.writeInt(u32, bytes[19..23], std.math.maxInt(u32), .big);
    try t.expectError(error.UnexpectedEnd, api.parse(bytes, .{}));
    std.mem.writeInt(u32, bytes[19..23], 2, .big);
    std.mem.writeInt(u32, bytes[8..12], std.math.maxInt(u32), .big);
    try t.expectError(error.UnexpectedEnd, api.parse(bytes, .{}));
}
test "ICC v2 description retains uninspected unused bytes and trailing data" {
    const bytes = try fixture(t.allocator, 1, 0, 0);
    defer t.allocator.free(bytes);
    bytes[bytes.len - 1] = 0xff;
    const extra = try t.allocator.alloc(u8, bytes.len + 1);
    defer t.allocator.free(extra);
    @memcpy(extra[0..bytes.len], bytes);
    extra[bytes.len] = 0xa5;
    const r = try api.parse(extra, .{});
    try t.expectEqual(@as(u8, 0xff), r.script_unused[66]);
    try t.expectEqualSlices(u8, &.{0xa5}, r.trailing);
    try t.expect(r.script_deferred);
}
