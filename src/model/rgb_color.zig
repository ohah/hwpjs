//! Canonical 0xRRGGBB intent; format-specific representations stay at edges.
const std = @import("std");
pub fn validate(value: u32) !void {
    if (value > 0xffffff) return error.InvalidCharacterColor;
}
pub fn hwp5(value: u32) u32 {
    return ((value >> 16) & 255) | (value & 0xff00) | ((value & 255) << 16);
}
pub fn xml(value: []const u8) ?u32 {
    if (value.len != 7 or value[0] != '#') return null;
    for (value[1..]) |c| if (!std.ascii.isHex(c)) return null;
    return std.fmt.parseInt(u32, value[1..], 16) catch null;
}
pub fn format(a: std.mem.Allocator, value: u32) ![]u8 {
    try validate(value);
    return std.fmt.allocPrint(a, "#{x:0>6}", .{value});
}
test "RGB colors distinguish black from omission and preserve byte ordering" {
    const a = std.testing.allocator;
    for ([_]u32{ 0, 0xffffff, 0x123456, 0xff0000, 0x00ff00, 0x0000ff }) |value| {
        const text = try format(a, value);
        defer a.free(text);
        try std.testing.expectEqual(@as(?u32, value), xml(text));
        try std.testing.expectEqual(value, hwp5(hwp5(value)));
    }
    try std.testing.expectEqual(@as(u32, 0x563412), hwp5(0x123456));
    try std.testing.expectEqual(@as(?u32, 0xaabbcc), xml("#AaBbCc"));
    for ([_][]const u8{ "#+12345", "#12345", "#1234567", "#gggggg", "123456", "# 12345" }) |value| try std.testing.expectEqual(@as(?u32, null), xml(value));
    try std.testing.expectError(error.InvalidCharacterColor, format(a, 0x1000000));
}
