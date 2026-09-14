const std = @import("std");
const bmp_header = @import("../bmp/header.zig");
const dib_colors = @import("dib_colors.zig");

pub const Options = struct { max_pixels: u64 = 100_000_000, require_monochrome: bool = false };

pub const Payload = struct {
    header: bmp_header.Header,
    usage: dib_colors.Usage,
    header_extra: []const u8,
    bits: []const u8,
};

fn rowStride(width: u32, planes: u16, bit_count: u16) u64 {
    return ((@as(u64, width) * planes * bit_count + 31) / 32) * 4;
}

pub fn parse(bmi: []const u8, bits: []const u8, usage: dib_colors.Usage, options: Options) !Payload {
    const header = try bmp_header.parse(bmi, .{ .max_pixels = options.max_pixels });
    if (options.require_monochrome and header.bit_count != 1) return error.InvalidEmfMonochromeBrushBitCount;

    var minimum_bmi: u64 = header.raw.len;
    if (header.kind == .info and header.compression == .bitfields) minimum_bmi += 12;
    const palette_entries = if (usage == .palette_indices) 0 else header.paletteCount();
    const palette_entry_bytes: u64 = switch (usage) {
        .rgb_colors => if (header.kind == .core) 3 else 4,
        .palette_colors => 2,
        .palette_indices => 0,
    };
    minimum_bmi += @as(u64, palette_entries) * palette_entry_bytes;
    if (minimum_bmi > bmi.len) return error.TruncatedEmfDibHeaderInfo;

    const expected_bits: u64 = if (header.kind == .core or header.uncompressed())
        rowStride(header.width, 1, header.bit_count) * header.height
    else blk: {
        const declared = header.info.?.image_bytes;
        if (declared == 0) return error.InvalidEmfDibImageSize;
        break :blk declared;
    };
    if (header.info) |info| {
        if (header.uncompressed() and info.image_bytes != 0 and info.image_bytes != expected_bits)
            return error.InvalidEmfDibImageSize;
    }
    if (expected_bits != bits.len) return error.InvalidEmfDibBitsSize;
    return .{
        .header = header,
        .usage = usage,
        .header_extra = bmi[header.raw.len..],
        .bits = bits,
    };
}

fn coreHeader(bit_count: u16) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[0..4], 12, .little);
    std.mem.writeInt(u16, bytes[4..6], 2, .little);
    std.mem.writeInt(u16, bytes[6..8], 2, .little);
    std.mem.writeInt(u16, bytes[8..10], 1, .little);
    std.mem.writeInt(u16, bytes[10..12], bit_count, .little);
    return bytes;
}

test "DIB payload validates core palette and exact row bytes" {
    const core = coreHeader(1);
    var bmi = [_]u8{0} ** 18;
    @memcpy(bmi[0..12], &core);
    const bits = [_]u8{0} ** 8;
    const value = try parse(&bmi, &bits, .rgb_colors, .{ .require_monochrome = true });
    try std.testing.expectEqual(@as(u32, 2), value.header.width);
    try std.testing.expectEqual(@as(usize, 6), value.header_extra.len);

    try std.testing.expectError(error.TruncatedEmfDibHeaderInfo, parse(bmi[0..17], &bits, .rgb_colors, .{}));
    try std.testing.expectError(error.InvalidEmfDibBitsSize, parse(&bmi, bits[0..7], .rgb_colors, .{}));
}

test "DIB payload distinguishes usage and monochrome policy" {
    const core = coreHeader(4);
    var rgb_bmi = [_]u8{0} ** 60;
    @memcpy(rgb_bmi[0..12], &core);
    const bits = [_]u8{0} ** 8;
    _ = try parse(&rgb_bmi, &bits, .rgb_colors, .{});
    try std.testing.expectError(error.InvalidEmfMonochromeBrushBitCount, parse(&rgb_bmi, &bits, .rgb_colors, .{ .require_monochrome = true }));

    var palette_bmi = [_]u8{0} ** 44;
    @memcpy(palette_bmi[0..12], &core);
    _ = try parse(&palette_bmi, &bits, .palette_colors, .{});
    _ = try parse(&core, &bits, .palette_indices, .{});
}

fn infoHeader(compression: bmp_header.Compression, bit_count: u16, image_bytes: u32) [40]u8 {
    var bytes = [_]u8{0} ** 40;
    std.mem.writeInt(u32, bytes[0..4], 40, .little);
    std.mem.writeInt(i32, bytes[4..8], 2, .little);
    std.mem.writeInt(i32, bytes[8..12], 2, .little);
    std.mem.writeInt(u16, bytes[12..14], 1, .little);
    std.mem.writeInt(u16, bytes[14..16], bit_count, .little);
    std.mem.writeInt(u32, bytes[16..20], @intFromEnum(compression), .little);
    std.mem.writeInt(u32, bytes[20..24], image_bytes, .little);
    return bytes;
}

test "DIB payload accepts every specified CMYK compression size policy" {
    const cmyk = infoHeader(.cmyk, 32, 16);
    const raw = [_]u8{0} ** 16;
    _ = try parse(&cmyk, &raw, .palette_indices, .{});
    var wrong_cmyk = cmyk;
    std.mem.writeInt(u32, wrong_cmyk[20..24], 12, .little);
    try std.testing.expectError(error.InvalidEmfDibImageSize, parse(&wrong_cmyk, &raw, .palette_indices, .{}));

    const cmyk_rle8 = infoHeader(.cmyk_rle8, 8, 3);
    const compressed = [_]u8{ 1, 0, 1 };
    _ = try parse(&cmyk_rle8, &compressed, .palette_indices, .{});
    try std.testing.expectError(error.InvalidEmfDibBitsSize, parse(&cmyk_rle8, compressed[0..2], .palette_indices, .{}));

    const cmyk_rle4 = infoHeader(.cmyk_rle4, 4, 3);
    _ = try parse(&cmyk_rle4, &compressed, .palette_indices, .{});
}
