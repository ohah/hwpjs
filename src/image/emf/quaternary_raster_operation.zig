const std = @import("std");
const ternary = @import("ternary_raster_operation.zig");

pub const Operation = struct {
    raw: u32,
    reserved: u16,
    background_index: u8,
    foreground_index: u8,
};

pub fn parse(raw: u32) !Operation {
    const background: u8 = @truncate(raw >> 16);
    const foreground: u8 = @truncate(raw >> 24);
    if (!ternary.isDefinedIndex(background) or !ternary.isDefinedIndex(foreground))
        return error.InvalidEmfQuaternaryRasterOperation;
    return .{ .raw = raw, .reserved = @truncate(raw), .background_index = background, .foreground_index = foreground };
}

test "quaternary raster operation preserves ignored reserved and validates both ROP3 indexes" {
    const value = try parse(0xccf01234);
    try std.testing.expectEqual(@as(u16, 0x1234), value.reserved);
    try std.testing.expectEqual(@as(u8, 0xf0), value.background_index);
    try std.testing.expectEqual(@as(u8, 0xcc), value.foreground_index);
    try std.testing.expectError(error.InvalidEmfQuaternaryRasterOperation, parse(0x5dcc0000));
    try std.testing.expectError(error.InvalidEmfQuaternaryRasterOperation, parse(0xcc5d0000));
}
