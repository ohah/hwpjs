const std = @import("std");
const t = std.testing;
const api = @import("text_type.zig");
test "ICC v2 text preserves ASCII and requires final NUL" {
    var bytes = [_]u8{ 't', 'e', 'x', 't', 0, 0, 0, 0, 'a', 0, 'b', 0 };
    const view = try api.parse(&bytes, .{ .max_bytes = bytes.len });
    try t.expectEqualSlices(u8, bytes[8..], view);
    try t.expectEqual(@intFromPtr(&bytes) + 8, @intFromPtr(view.ptr));
    try t.expectError(error.LimitExceeded, api.parse(&bytes, .{ .max_bytes = bytes.len - 1 }));
    try t.expectError(error.InvalidIccTextTerminator, api.parse(bytes[0..8], .{}));
    try t.expectError(error.InvalidIccTextTerminator, api.parse(bytes[0..11], .{}));
    bytes[8] = 128;
    try t.expectError(error.InvalidIccAscii, api.parse(&bytes, .{}));
    bytes[8] = 0;
    try t.expectEqual(@as(usize, 1), (try api.parse(bytes[0..9], .{})).len);
    bytes[0] = 'd';
    try t.expectError(error.InvalidIccTextType, api.parse(&bytes, .{}));
}
