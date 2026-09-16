pub const ImageDataType = enum(u32) { unknown = 0, bitmap = 1, metafile = 2 };

pub fn imageDataType(raw: u32) !ImageDataType {
    if (raw > @intFromEnum(ImageDataType.metafile)) return error.InvalidEmfPlusImageDataType;
    return @enumFromInt(raw);
}

pub const BitmapDataType = enum(u32) { pixel = 0, compressed = 1 };

pub fn bitmapDataType(raw: u32) !BitmapDataType {
    if (raw > @intFromEnum(BitmapDataType.compressed)) return error.InvalidEmfPlusBitmapDataType;
    return @enumFromInt(raw);
}

pub const MetafileDataType = enum(u32) {
    wmf = 1,
    wmf_placeable = 2,
    emf = 3,
    emf_plus_only = 4,
    emf_plus_dual = 5,
};

pub fn metafileDataType(raw: u32) !MetafileDataType {
    if (raw < @intFromEnum(MetafileDataType.wmf) or raw > @intFromEnum(MetafileDataType.emf_plus_dual))
        return error.InvalidEmfPlusMetafileDataType;
    return @enumFromInt(raw);
}

pub const PixelFormat = enum(u32) {
    undefined = 0x00000000,
    indexed_1bpp = 0x00030101,
    indexed_4bpp = 0x00030402,
    indexed_8bpp = 0x00030803,
    grayscale_16bpp = 0x00101004,
    rgb555_16bpp = 0x00021005,
    rgb565_16bpp = 0x00021006,
    argb1555_16bpp = 0x00061007,
    rgb_24bpp = 0x00021808,
    rgb_32bpp = 0x00022009,
    argb_32bpp = 0x0026200a,
    pargb_32bpp = 0x000e200b,
    rgb_48bpp = 0x0010300c,
    argb_64bpp = 0x0034400d,
    pargb_64bpp = 0x001a400e,

    pub fn bitsPerPixel(self: PixelFormat) u8 {
        return @truncate(@intFromEnum(self) >> 8);
    }

    pub fn indexed(self: PixelFormat) bool {
        return @intFromEnum(self) & 0x0001_0000 != 0;
    }
};

pub fn pixelFormat(raw: u32) !PixelFormat {
    return switch (raw) {
        0x00000000,
        0x00030101,
        0x00030402,
        0x00030803,
        0x00101004,
        0x00021005,
        0x00021006,
        0x00061007,
        0x00021808,
        0x00022009,
        0x0026200a,
        0x000e200b,
        0x0010300c,
        0x0034400d,
        0x001a400e,
        => @enumFromInt(raw),
        else => error.InvalidEmfPlusPixelFormat,
    };
}

pub const PaletteStyle = packed struct(u32) {
    has_alpha: bool,
    grayscale: bool,
    halftone: bool,
    reserved: u29,

    pub fn parse(raw_value: u32) !PaletteStyle {
        if (raw_value & ~@as(u32, 0x7) != 0) return error.InvalidEmfPlusPaletteStyle;
        return @bitCast(raw_value);
    }

    pub fn raw(self: PaletteStyle) u32 {
        return @bitCast(self);
    }
};

test "EMF+ image enums and pixel formats accept only official values" {
    const std = @import("std");
    for (0..3) |raw| try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try imageDataType(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusImageDataType, imageDataType(3));
    for (0..2) |raw| try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try bitmapDataType(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusBitmapDataType, bitmapDataType(2));
    for (1..6) |raw| try std.testing.expectEqual(@as(u32, @intCast(raw)), @intFromEnum(try metafileDataType(@intCast(raw))));
    try std.testing.expectError(error.InvalidEmfPlusMetafileDataType, metafileDataType(0));
    try std.testing.expectError(error.InvalidEmfPlusMetafileDataType, metafileDataType(6));

    const formats = [_]u32{ 0, 0x00030101, 0x00030402, 0x00030803, 0x00101004, 0x00021005, 0x00021006, 0x00061007, 0x00021808, 0x00022009, 0x0026200a, 0x000e200b, 0x0010300c, 0x0034400d, 0x001a400e };
    for (formats) |raw| try std.testing.expectEqual(raw, @intFromEnum(try pixelFormat(raw)));
    try std.testing.expectError(error.InvalidEmfPlusPixelFormat, pixelFormat(0x0003200a));
    try std.testing.expectEqual(@as(u8, 8), PixelFormat.indexed_8bpp.bitsPerPixel());
    try std.testing.expect(PixelFormat.indexed_8bpp.indexed());
    try std.testing.expect(!PixelFormat.argb_32bpp.indexed());
}

test "EMF+ palette style rejects undefined bits" {
    const std = @import("std");
    const all = try PaletteStyle.parse(7);
    try std.testing.expect(all.has_alpha and all.grayscale and all.halftone);
    try std.testing.expectEqual(@as(u32, 7), all.raw());
    try std.testing.expectError(error.InvalidEmfPlusPaletteStyle, PaletteStyle.parse(8));
    try std.testing.expectError(error.InvalidEmfPlusPaletteStyle, PaletteStyle.parse(0x80000000));
}
