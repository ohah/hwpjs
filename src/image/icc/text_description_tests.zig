const std = @import("std");
const t = std.testing;
const api = @import("text_description.zig");
fn fixture(a: std.mem.Allocator, ascii_count: usize, unicode_units: usize, script_count: u8) ![]u8 {
    const b = try a.alloc(u8, 90 + ascii_count + 2 * unicode_units);
    @memset(b, 0);
    b[0..4].* = "desc".*;
    std.mem.writeInt(u32, b[8..12], @intCast(ascii_count), .big);
    if (ascii_count > 0) @memset(b[12 .. 12 + ascii_count - 1], 'a');
    const at = 12 + ascii_count;
    std.mem.writeInt(u32, b[at..][0..4], 0x12345678, .big);
    std.mem.writeInt(u32, b[at + 4 ..][0..4], @intCast(unicode_units), .big);
    if (unicode_units > 1) std.mem.writeInt(u16, b[at + 8 ..][0..2], 0xac00, .big);
    const script = at + 8 + unicode_units * 2;
    std.mem.writeInt(u16, b[script..][0..2], 42, .big);
    b[script + 2] = script_count;
    return b;
}
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
