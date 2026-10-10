//! Explicit none/RGB ABI; do not overload white or an invalid RGB sentinel.
const std = @import("std");
pub fn decode(kind: u32, color: u32) !@import("../model/shade_color.zig").Intent {
    if (kind == 0) {
        if (color != 0) return error.InvalidCharacterShade;
        return .none;
    }
    if (kind != 1) return error.InvalidCharacterShade;
    try @import("../model/rgb_color.zig").validate(color);
    return .{ .color = color };
}
test "shade ABI distinguishes none black white and refuses mixed intent" {
    try std.testing.expectEqualDeep(@import("../model/shade_color.zig").Intent.none, try decode(0, 0));
    for ([_]u32{ 0, 0xffffff, 0x123456 }) |color| try std.testing.expectEqualDeep(@import("../model/shade_color.zig").Intent{ .color = color }, try decode(1, color));
    try std.testing.expectError(error.InvalidCharacterShade, decode(0, 0xffffff));
    try std.testing.expectError(error.InvalidCharacterShade, decode(2, 0));
    try std.testing.expectError(error.InvalidCharacterColor, decode(1, 0xffffffff));
}
