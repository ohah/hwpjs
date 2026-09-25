const std = @import("std");
const t = std.testing;
const pcx = @import("structure.zig");

fn header(version: u8, bits: u8, width: u16, height: u16, planes: u8, bytes_per_line: u16) [128]u8 {
    var bytes = [_]u8{0} ** 128;
    bytes[0] = 0x0a;
    bytes[1] = version;
    bytes[2] = 1;
    bytes[3] = bits;
    std.mem.writeInt(u16, bytes[8..10], width - 1, .little);
    std.mem.writeInt(u16, bytes[10..12], height - 1, .little);
    bytes[65] = planes;
    std.mem.writeInt(u16, bytes[66..68], bytes_per_line, .little);
    return bytes;
}

test "PCX structure counts RLE within scan lines across planes" {
    var bytes = [_]u8{0} ** 132;
    const h = header(5, 1, 8, 2, 2, 2);
    @memcpy(bytes[0..128], &h);
    @memcpy(bytes[128..], &[_]u8{ 0xc4, 0xff, 0xc4, 0 });
    const report = try pcx.inspect(&bytes, .{});
    try t.expectEqual(@as(usize, 8), report.decoded_bytes);
    try t.expectEqual(@as(usize, 4), report.encoded_bytes);
    try t.expectEqual(@as(usize, 2), report.planes);
    try t.expect(!report.has_vga_palette and report.pixels_deferred);
    try t.expectEqual(@as(usize, 8), (try pcx.inspect(&bytes, .{ .max_decoded_bytes = 8 })).decoded_bytes);
    try t.expectError(error.LimitExceeded, pcx.inspect(&bytes, .{ .max_decoded_bytes = 7 }));
    try t.expectError(error.LimitExceeded, pcx.inspect(&bytes, .{ .max_bytes = 131 }));
    bytes[128] = 0xc5;
    bytes[130] = 0xc3;
    try t.expectError(error.PcxRunCrossesScanLine, pcx.inspect(&bytes, .{}));
}

test "PCX structure checks header geometry and rejects RLE defects" {
    var bytes = [_]u8{0} ** 130;
    const h = header(5, 8, 2, 1, 1, 2);
    @memcpy(bytes[0..128], &h);
    @memcpy(bytes[128..], &[_]u8{ 1, 2 });
    try t.expectEqual(@as(usize, 2), (try pcx.inspect(&bytes, .{})).decoded_bytes);
    try t.expectError(error.TruncatedPcxHeader, pcx.inspect(bytes[0..127], .{}));
    bytes[0] = 0;
    try t.expectError(error.InvalidPcxManufacturer, pcx.inspect(&bytes, .{}));
    bytes = h ++ [_]u8{ 1, 2 };
    bytes[1] = 6;
    try t.expectError(error.UnsupportedPcxVersion, pcx.inspect(&bytes, .{}));
    bytes[1] = 5;
    bytes[2] = 0;
    try t.expectError(error.UnsupportedPcxEncoding, pcx.inspect(&bytes, .{}));
    bytes[2] = 1;
    bytes[3] = 3;
    try t.expectError(error.UnsupportedPcxDepth, pcx.inspect(&bytes, .{}));
    bytes[3] = 8;
    std.mem.writeInt(u16, bytes[8..10], 0xffff, .little);
    try t.expectError(error.InvalidPcxBytesPerLine, pcx.inspect(&bytes, .{}));
    std.mem.writeInt(u16, bytes[8..10], 1, .little);
    std.mem.writeInt(u16, bytes[4..6], 2, .little);
    try t.expectError(error.InvalidPcxDimensions, pcx.inspect(&bytes, .{}));
    bytes = h ++ [_]u8{ 1, 2 };
    bytes[65] = 0;
    try t.expectError(error.UnsupportedPcxPlanes, pcx.inspect(&bytes, .{}));
    bytes = h ++ [_]u8{ 1, 2 };
    bytes[66] = 1;
    try t.expectError(error.InvalidPcxBytesPerLine, pcx.inspect(&bytes, .{}));
    bytes = h ++ [_]u8{ 0xc0, 1 };
    try t.expectError(error.InvalidPcxRun, pcx.inspect(&bytes, .{}));
    bytes = h ++ [_]u8{ 0xc3, 1 };
    try t.expectError(error.PcxRunOverrun, pcx.inspect(&bytes, .{}));
    bytes = h ++ [_]u8{ 0xc2, 1 };
    try t.expectEqual(@as(usize, 2), (try pcx.inspect(&bytes, .{})).decoded_bytes);
    try t.expectError(error.TruncatedPcxRun, pcx.inspect(bytes[0..129], .{}));
    try t.expectError(error.TruncatedPcxImage, pcx.inspect(bytes[0..128], .{}));
}

test "PCX structure distinguishes optional VGA palette from unexplained trailing bytes" {
    var bytes = [_]u8{0} ** (128 + 2 + 769);
    const h = header(5, 8, 2, 1, 1, 2);
    @memcpy(bytes[0..128], &h);
    @memcpy(bytes[128..130], &[_]u8{ 1, 2 });
    bytes[130] = 0x0c;
    try t.expect((try pcx.inspect(&bytes, .{})).has_vga_palette);
    bytes[130] = 0;
    try t.expectError(error.InvalidPcxTrailer, pcx.inspect(&bytes, .{}));
    bytes[130] = 0x0c;
    bytes[3] = 1;
    try t.expectError(error.InvalidPcxTrailer, pcx.inspect(&bytes, .{}));

    var truncated = [_]u8{0} ** (128 + 1 + 769);
    const wide = header(5, 8, 1, 1, 1, 770);
    @memcpy(truncated[0..128], &wide);
    truncated[128] = 1;
    truncated[129] = 0x0c;
    try t.expectError(error.TruncatedPcxImage, pcx.inspect(&truncated, .{}));
}

test "PCX structure accepts nonzero origins and documented versions" {
    for ([_]u8{ 0, 2, 3, 4, 5 }) |version| {
        var bytes = [_]u8{0} ** 130;
        const h = header(version, 1, 8, 1, 1, 2);
        @memcpy(bytes[0..128], &h);
        std.mem.writeInt(u16, bytes[4..6], 100, .little);
        std.mem.writeInt(u16, bytes[6..8], 200, .little);
        std.mem.writeInt(u16, bytes[8..10], 107, .little);
        std.mem.writeInt(u16, bytes[10..12], 200, .little);
        bytes[128] = 0xc2;
        bytes[129] = 0;
        const report = try pcx.inspect(&bytes, .{});
        try t.expectEqual(version, report.version);
        try t.expectEqual(@as(usize, 8), report.width);
        try t.expectEqual(@as(usize, 1), report.height);
    }
}
