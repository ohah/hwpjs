const std = @import("std");

pub const Kind = enum { brush, pen, font, palette, color_space };

pub const StockObject = enum(u32) {
    white_brush = 0x80000000,
    light_gray_brush = 0x80000001,
    gray_brush = 0x80000002,
    dark_gray_brush = 0x80000003,
    black_brush = 0x80000004,
    null_brush = 0x80000005,
    white_pen = 0x80000006,
    black_pen = 0x80000007,
    null_pen = 0x80000008,
    oem_fixed_font = 0x8000000a,
    ansi_fixed_font = 0x8000000b,
    ansi_variable_font = 0x8000000c,
    system_font = 0x8000000d,
    device_default_font = 0x8000000e,
    default_palette = 0x8000000f,
    system_fixed_font = 0x80000010,
    default_gui_font = 0x80000011,
    dc_brush = 0x80000012,
    dc_pen = 0x80000013,
};

pub fn parse(value: u32) !StockObject {
    return std.enums.fromInt(StockObject, value) orelse error.InvalidEmfStockObject;
}

pub fn kind(value: StockObject) Kind {
    return switch (value) {
        .white_brush, .light_gray_brush, .gray_brush, .dark_gray_brush, .black_brush, .null_brush, .dc_brush => .brush,
        .white_pen, .black_pen, .null_pen, .dc_pen => .pen,
        .oem_fixed_font, .ansi_fixed_font, .ansi_variable_font, .system_font, .device_default_font, .system_fixed_font, .default_gui_font => .font,
        .default_palette => .palette,
    };
}

test "stock object enumeration preserves gaps and selection categories" {
    const official = [_]u32{
        0x80000000, 0x80000001, 0x80000002, 0x80000003, 0x80000004, 0x80000005,
        0x80000006, 0x80000007, 0x80000008, 0x8000000a, 0x8000000b, 0x8000000c,
        0x8000000d, 0x8000000e, 0x8000000f, 0x80000010, 0x80000011, 0x80000012,
        0x80000013,
    };
    try std.testing.expectEqual(official.len, std.meta.fields(StockObject).len);
    inline for (std.meta.fields(StockObject), 0..) |field, index| {
        try std.testing.expectEqual(official[index], field.value);
        try std.testing.expect((field.value & 0x80000000) != 0);
        try std.testing.expectEqual(field.value, @intFromEnum(try parse(field.value)));
    }
    try std.testing.expectEqual(Kind.brush, kind(try parse(0x80000000)));
    try std.testing.expectEqual(Kind.pen, kind(try parse(0x80000013)));
    try std.testing.expectEqual(Kind.font, kind(try parse(0x8000000a)));
    try std.testing.expectEqual(Kind.palette, kind(try parse(0x8000000f)));
    for ([_]u32{ 0, 0x80000009, 0x80000014, 0xffffffff }) |value|
        try std.testing.expectError(error.InvalidEmfStockObject, parse(value));
}
