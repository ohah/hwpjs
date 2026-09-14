const std = @import("std");
const t = std.testing;
const framing = @import("framing.zig");

fn fixture() [108]u8 {
    var bytes = [_]u8{0} ** 108;
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    std.mem.writeInt(u32, bytes[4..8], 88, .little);
    std.mem.writeInt(i32, bytes[8..12], -1, .little);
    std.mem.writeInt(i32, bytes[20..24], 20, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x464d4520, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x00010000, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 2, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    std.mem.writeInt(i32, bytes[72..76], 1920, .little);
    std.mem.writeInt(i32, bytes[76..80], 1080, .little);
    std.mem.writeInt(i32, bytes[80..84], 508, .little);
    std.mem.writeInt(i32, bytes[84..88], 285, .little);
    std.mem.writeInt(u32, bytes[88..92], 14, .little);
    std.mem.writeInt(u32, bytes[92..96], 20, .little);
    std.mem.writeInt(u32, bytes[104..108], 20, .little);
    return bytes;
}

test "EMF framing validates header declarations and terminal EOF" {
    const bytes = fixture();
    const value = try framing.validate(&bytes);
    try t.expectEqual(@as(usize, 2), value.records);
    try t.expectEqual(@as(u32, 108), value.header.bytes);
    try t.expectEqual(@as(i32, -1), value.header.bounds.left);
    try t.expectEqual(@as(i32, 20), value.header.bounds.bottom);
    try t.expectEqual(@as(i32, 1920), value.header.device.width);
    try t.expectEqual(@as(i32, 285), value.header.millimeters.height);
    try t.expectEqual(@import("header_payload.zig").Variant.base, value.header_payload.variant);
}

test "EMF header variant uses variable field offsets and validates UTF-16" {
    var bytes = [_]u8{0} ** 172;
    const base = fixture();
    @memcpy(bytes[0..88], base[0..88]);
    std.mem.writeInt(u32, bytes[4..8], 152, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[60..64], 2, .little);
    std.mem.writeInt(u32, bytes[64..68], 108, .little);
    std.mem.writeInt(u32, bytes[88..92], 40, .little);
    std.mem.writeInt(u32, bytes[92..96], 112, .little);
    std.mem.writeInt(u32, bytes[96..100], 1, .little);
    std.mem.writeInt(i32, bytes[100..104], 508000, .little);
    std.mem.writeInt(i32, bytes[104..108], 285000, .little);
    bytes[108..112].* = .{ 'A', 0, 0, 0 };
    for (112..152) |index| bytes[index] = @intCast(index);
    @memcpy(bytes[152..172], base[88..108]);
    const value = try framing.validate(&bytes);
    try t.expectEqual(@import("header_payload.zig").Variant.extension2, value.header_payload.variant);
    try t.expectEqualSlices(u8, &.{ 'A', 0, 0, 0 }, value.header_payload.description_utf16le.?);
    try t.expect(value.header_payload.extension1.?.open_gl);
    try t.expectEqual(@as(usize, 40), value.header_payload.extension1.?.pixel_format.?.len);
    try t.expectEqual(@as(i32, 508000), value.header_payload.extension2.?.micrometers.width);

    bytes[110] = 1;
    try t.expectError(error.MissingEmfDescriptionTerminator, framing.validate(&bytes));
    bytes[108..112].* = .{ 0, 0xd8, 0, 0 };
    try t.expectError(error.InvalidUnicodeEncoding, framing.validate(&bytes));
}

test "EMF HeaderSize flowchart keeps a long description in the base variant" {
    const original = fixture();
    var bytes = [_]u8{0} ** 132;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[4..8], 112, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[60..64], 12, .little);
    std.mem.writeInt(u32, bytes[64..68], 88, .little);
    bytes[108..112].* = .{ 'B', 0, 0, 0 };
    @memcpy(bytes[112..132], original[88..108]);
    const value = try framing.validate(&bytes);
    try t.expectEqual(@import("header_payload.zig").Variant.base, value.header_payload.variant);
    try t.expect(value.header_payload.extension1 == null);
}

test "EMF header extension rejects OpenGL and pixel format metadata drift" {
    var bytes = [_]u8{0} ** 120;
    const original = fixture();
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[4..8], 100, .little);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[96..100], 2, .little);
    @memcpy(bytes[100..120], original[88..108]);
    try t.expectError(error.InvalidEmfOpenGlFlag, framing.validate(&bytes));

    std.mem.writeInt(u32, bytes[96..100], 0, .little);
    std.mem.writeInt(u32, bytes[88..92], 39, .little);
    std.mem.writeInt(u32, bytes[92..96], 100, .little);
    var with_pixel = bytes ++ [_]u8{0} ** 40;
    std.mem.writeInt(u32, with_pixel[4..8], 140, .little);
    std.mem.writeInt(u32, with_pixel[48..52], with_pixel.len, .little);
    @memcpy(with_pixel[140..160], original[88..108]);
    try t.expectError(error.InvalidEmfPixelFormatSize, framing.validate(&with_pixel));
}

test "EMF framing rejects fixed header and EOF invariant drift" {
    var bytes = fixture();
    bytes[40] = 0;
    try t.expectError(error.InvalidEmfSignature, framing.validate(&bytes));
    bytes = fixture();
    bytes[58] = 1;
    try t.expectError(error.InvalidEmfHeaderReserved, framing.validate(&bytes));
    bytes = fixture();
    bytes[48] -= 1;
    try t.expectError(error.InvalidEmfDeclaredBytes, framing.validate(&bytes));
    bytes = fixture();
    bytes[52] = 3;
    try t.expectError(error.InvalidEmfDeclaredRecords, framing.validate(&bytes));
    bytes = fixture();
    bytes[104] = 19;
    try t.expectError(error.InvalidEmfEofSizeLast, framing.validate(&bytes));
}

test "EMF record iterator rejects truncation alignment and data after EOF" {
    const bytes = fixture();
    try t.expectError(error.MissingEmfHeader, framing.validate(bytes[0..0]));
    for (1..88) |cut| try t.expectError(error.TruncatedEmfRecord, framing.validate(bytes[0..cut]));
    var header_only = bytes[0..88].*;
    std.mem.writeInt(u32, header_only[48..52], header_only.len, .little);
    try t.expectError(error.MissingEmfEof, framing.validate(&header_only));
    for (89..108) |cut| {
        var truncated = bytes;
        std.mem.writeInt(u32, truncated[48..52], @intCast(cut), .little);
        try t.expectError(error.TruncatedEmfRecord, framing.validate(truncated[0..cut]));
    }
    var invalid = bytes;
    invalid[4] = 87;
    try t.expectError(error.InvalidEmfRecordSize, framing.validate(&invalid));
    invalid = bytes;
    std.mem.writeInt(u32, invalid[92..96], 16, .little);
    try t.expectError(error.InvalidEmfEofSize, framing.validate(&invalid));

    var trailing = bytes ++ [_]u8{0} ** 4;
    std.mem.writeInt(u32, trailing[48..52], trailing.len, .little);
    try t.expectError(error.DataAfterEmfEof, framing.validate(&trailing));
}

test "EMF EOF palette preserves undefined spaces and reserved-blue-green-red order" {
    const original = fixture();
    var bytes = [_]u8{0} ** 124;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[68..72], 2, .little);
    std.mem.writeInt(u32, bytes[88..92], 14, .little);
    std.mem.writeInt(u32, bytes[92..96], 36, .little);
    std.mem.writeInt(u32, bytes[96..100], 2, .little);
    std.mem.writeInt(u32, bytes[100..104], 20, .little);
    bytes[104..108].* = .{ 9, 8, 7, 6 };
    bytes[108..116].* = .{ 5, 10, 20, 30, 6, 40, 50, 60 };
    bytes[116..120].* = .{ 1, 2, 3, 4 };
    std.mem.writeInt(u32, bytes[120..124], 36, .little);
    const value = try framing.validate(&bytes);
    try t.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, value.palette.undefined_before);
    try t.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.palette.undefined_after);
    const second = try value.palette.entry(1);
    try t.expectEqual(@as(u8, 6), second.reserved);
    try t.expectEqual(@as(u8, 40), second.blue);
    try t.expectEqual(@as(u8, 50), second.green);
    try t.expectEqual(@as(u8, 60), second.red);
    try t.expectError(error.EmfPaletteIndexOutOfBounds, value.palette.entry(2));
    var invalid_offset = bytes;
    std.mem.writeInt(u32, invalid_offset[100..104], 15, .little);
    try t.expectError(error.InvalidEmfPaletteOffset, framing.validate(&invalid_offset));
}

test "EMF EOF palette validates header count offset and SizeLast boundary" {
    var bytes = fixture();
    bytes[68] = 1;
    try t.expectError(error.InvalidEmfPaletteCount, framing.validate(&bytes));
    bytes = fixture();
    bytes[68] = 1;
    bytes[96] = 1;
    bytes[100] = 15;
    try t.expectError(error.InvalidEmfPaletteOffset, framing.validate(&bytes));
    bytes = fixture();
    bytes[68] = 1;
    bytes[96] = 1;
    bytes[100] = 16;
    try t.expectError(error.InvalidEmfPaletteRange, framing.validate(&bytes));
}
