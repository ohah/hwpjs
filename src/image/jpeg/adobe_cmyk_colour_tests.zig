const std = @import("std");
const colour = @import("adobe_cmyk_colour.zig");

test "JPEG Adobe complemented CMYK and YCCK fixed unmanaged RGB corners" {
    const t = std.testing;
    try t.expectEqual([3]u8{ 255, 255, 255 }, colour.complementedCmyk(255, 255, 255, 255));
    try t.expectEqual([3]u8{ 0, 255, 255 }, colour.complementedCmyk(0, 255, 255, 255));
    try t.expectEqual([3]u8{ 255, 0, 0 }, colour.complementedCmyk(255, 0, 0, 255));
    try t.expectEqual([3]u8{ 0, 0, 0 }, colour.complementedCmyk(255, 255, 255, 0));
    try t.expectEqual([3]u8{ 255, 255, 255 }, colour.ycck(0, 128, 128, 255));
    try t.expectEqual([3]u8{ 0, 0, 0 }, colour.ycck(255, 128, 128, 255));
    try t.expectEqual([3]u8{ 0, 0, 0 }, colour.ycck(0, 128, 128, 0));
    try t.expectEqual([3]u8{ 64, 64, 64 }, colour.ycck(127, 128, 128, 128));
}
