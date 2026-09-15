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
    const value = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 2), value.records);
    try t.expectEqual(@as(u32, 108), value.header.bytes);
    try t.expectEqual(@as(i32, -1), value.header.bounds.left);
    try t.expectEqual(@as(i32, 20), value.header.bounds.bottom);
    try t.expectEqual(@as(i32, 1920), value.header.device.width);
    try t.expectEqual(@as(i32, 285), value.header.millimeters.height);
    try t.expectEqual(@import("header_payload.zig").Variant.base, value.header_payload.variant);
}

test "EMF framing validates and counts ALPHABLEND records" {
    const original = fixture();
    var bytes = [_]u8{0} ** 272;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.alphablend), .little);
    std.mem.writeInt(u32, bytes[92..96], 164, .little);
    std.mem.writeInt(i32, bytes[120..124], 2, .little);
    std.mem.writeInt(i32, bytes[124..128], 2, .little);
    bytes[130] = 0xff;
    bytes[131] = 1;
    std.mem.writeInt(u32, bytes[172..176], 108, .little);
    std.mem.writeInt(u32, bytes[176..180], 40, .little);
    std.mem.writeInt(u32, bytes[180..184], 148, .little);
    std.mem.writeInt(u32, bytes[184..188], 16, .little);
    std.mem.writeInt(i32, bytes[188..192], 2, .little);
    std.mem.writeInt(i32, bytes[192..196], 2, .little);
    std.mem.writeInt(u32, bytes[196..200], 40, .little);
    std.mem.writeInt(i32, bytes[200..204], 2, .little);
    std.mem.writeInt(i32, bytes[204..208], 2, .little);
    std.mem.writeInt(u16, bytes[208..210], 1, .little);
    std.mem.writeInt(u16, bytes[210..212], 32, .little);
    @memcpy(bytes[252..272], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.alpha_blend_records);

    bytes[131] = 2;
    try t.expectError(error.UnsupportedEmfAlphaFormat, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates and counts TRANSPARENTBLT records" {
    const original = fixture();
    var bytes = [_]u8{0} ** 244;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.transparentblt), .little);
    std.mem.writeInt(u32, bytes[92..96], 136, .little);
    bytes[128..132].* = .{ 10, 20, 30, 0 };
    std.mem.writeInt(u32, bytes[168..172], @intFromEnum(@import("dib_colors.zig").Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[172..176], 108, .little);
    std.mem.writeInt(u32, bytes[176..180], 12, .little);
    std.mem.writeInt(u32, bytes[180..184], 128, .little);
    std.mem.writeInt(u32, bytes[184..188], 8, .little);
    std.mem.writeInt(u32, bytes[196..200], 12, .little);
    std.mem.writeInt(u16, bytes[200..202], 2, .little);
    std.mem.writeInt(u16, bytes[202..204], 2, .little);
    std.mem.writeInt(u16, bytes[204..206], 1, .little);
    std.mem.writeInt(u16, bytes[206..208], 1, .little);
    @memcpy(bytes[224..244], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.transparent_blt_records);

    bytes[131] = 1;
    try t.expectError(error.InvalidWmfColorReserved, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates SETLAYOUT payloads" {
    const original = fixture();
    var bytes = [_]u8{0} ** 120;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.setlayout), .little);
    std.mem.writeInt(u32, bytes[92..96], 12, .little);
    std.mem.writeInt(u32, bytes[96..100], 0x00000009, .little);
    @memcpy(bytes[100..120], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &bytes)).records);

    bytes[98] = 1;
    try t.expectError(error.InvalidEmfLayoutMode, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates and counts SETLINKEDUFIS arrays" {
    const original = fixture();
    var bytes = [_]u8{0} ** 144;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.setlinkedufis), .little);
    std.mem.writeInt(u32, bytes[92..96], 36, .little);
    std.mem.writeInt(u32, bytes[96..100], 2, .little);
    std.mem.writeInt(u32, bytes[100..104], 1, .little);
    std.mem.writeInt(u32, bytes[104..108], 10, .little);
    std.mem.writeInt(u32, bytes[108..112], 2, .little);
    std.mem.writeInt(u32, bytes[112..116], 20, .little);
    bytes[116..124].* = .{ 9, 8, 7, 6, 5, 4, 3, 2 };
    @memcpy(bytes[124..144], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.linked_ufi_records);
    try t.expectEqual(@as(usize, 2), summary.linked_ufis);

    std.mem.writeInt(u32, bytes[96..100], 3, .little);
    try t.expectError(error.InvalidEmfSetLinkedUfisRecordSize, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects all fixed clipping records" {
    const original = fixture();
    var bytes = [_]u8{0} ** 180;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 6, .little);

    var at: usize = 88;
    inline for (.{
        .{ @import("records.zig").RecordType.offsetcliprgn, @as(usize, 16) },
        .{ @import("records.zig").RecordType.setmetargn, @as(usize, 8) },
        .{ @import("records.zig").RecordType.excludecliprect, @as(usize, 24) },
        .{ @import("records.zig").RecordType.intersectcliprect, @as(usize, 24) },
    }) |case| {
        std.mem.writeInt(u32, bytes[at..][0..4], @intFromEnum(case[0]), .little);
        std.mem.writeInt(u32, bytes[at + 4 ..][0..4], @intCast(case[1]), .little);
        at += case[1];
    }
    @memcpy(bytes[at..], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 4), summary.clipping_records);

    std.mem.writeInt(u32, bytes[92..96], 12, .little);
    std.mem.writeInt(u32, bytes[48..52], 176, .little);
    try t.expectError(error.InvalidEmfOffsetClipRegionSize, framing.validate(t.allocator, bytes[0..176]));
}

test "EMF framing connects path and extended clipping selection" {
    const original = fixture();
    var bytes = [_]u8{0} ** 184;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 4, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.selectclippath), .little);
    std.mem.writeInt(u32, bytes[92..96], 12, .little);
    std.mem.writeInt(u32, bytes[96..100], @intFromEnum(@import("region_mode.zig").RegionMode.diff_region), .little);
    std.mem.writeInt(u32, bytes[100..104], @intFromEnum(@import("records.zig").RecordType.extselectcliprgn), .little);
    std.mem.writeInt(u32, bytes[104..108], 64, .little);
    std.mem.writeInt(u32, bytes[108..112], 48, .little);
    std.mem.writeInt(u32, bytes[112..116], @intFromEnum(@import("region_mode.zig").RegionMode.xor_region), .little);
    std.mem.writeInt(u32, bytes[116..120], @import("region_data.zig").header_size, .little);
    std.mem.writeInt(u32, bytes[120..124], @import("region_data.zig").rectangle_type, .little);
    std.mem.writeInt(u32, bytes[124..128], 1, .little);
    std.mem.writeInt(u32, bytes[128..132], @import("region_data.zig").rectangle_size, .little);
    @memcpy(bytes[164..184], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 2), summary.clipping_selection_records);

    std.mem.writeInt(u32, bytes[116..120], 28, .little);
    try t.expectError(error.InvalidEmfRegionDataHeaderSize, framing.validate(t.allocator, &bytes));
    std.mem.writeInt(u32, bytes[108..112], 0, .little);
    std.mem.writeInt(u32, bytes[112..116], @intFromEnum(@import("region_mode.zig").RegionMode.and_region), .little);
    try t.expectError(error.MissingEmfExtSelectClipRegionData, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects all RegionData drawing records and brush references" {
    const original = fixture();
    var bytes = [_]u8{0} ** 428;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 6, .little);

    var at: usize = 88;
    inline for (.{
        .{ @import("records.zig").RecordType.fillrgn, @as(usize, 32) },
        .{ @import("records.zig").RecordType.framergn, @as(usize, 40) },
        .{ @import("records.zig").RecordType.invertrgn, @as(usize, 28) },
        .{ @import("records.zig").RecordType.paintrgn, @as(usize, 28) },
    }) |case| {
        const record_size = case[1] + 48;
        std.mem.writeInt(u32, bytes[at..][0..4], @intFromEnum(case[0]), .little);
        std.mem.writeInt(u32, bytes[at + 4 ..][0..4], @intCast(record_size), .little);
        std.mem.writeInt(u32, bytes[at + 24 ..][0..4], 48, .little);
        if (case[0] == .fillrgn or case[0] == .framergn)
            std.mem.writeInt(u32, bytes[at + 28 ..][0..4], @intFromEnum(@import("stock_object.zig").StockObject.white_brush), .little);
        const region_at = at + case[1];
        std.mem.writeInt(u32, bytes[region_at..][0..4], @import("region_data.zig").header_size, .little);
        std.mem.writeInt(u32, bytes[region_at + 4 ..][0..4], @import("region_data.zig").rectangle_type, .little);
        std.mem.writeInt(u32, bytes[region_at + 8 ..][0..4], 1, .little);
        std.mem.writeInt(u32, bytes[region_at + 12 ..][0..4], @import("region_data.zig").rectangle_size, .little);
        at += record_size;
    }
    @memcpy(bytes[at..], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 4), summary.region_drawing_records);
    try t.expectEqual(@as(usize, 2), summary.objects.region_brush_uses);

    std.mem.writeInt(u32, bytes[120..124], 28, .little);
    try t.expectError(error.InvalidEmfRegionDataHeaderSize, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects all path drawing records" {
    const original = fixture();
    var bytes = [_]u8{0} ** 180;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 5, .little);

    var at: usize = 88;
    inline for (.{
        @import("records.zig").RecordType.fillpath,
        @import("records.zig").RecordType.strokeandfillpath,
        @import("records.zig").RecordType.strokepath,
    }) |kind| {
        std.mem.writeInt(u32, bytes[at..][0..4], @intFromEnum(kind), .little);
        std.mem.writeInt(u32, bytes[at + 4 ..][0..4], 24, .little);
        std.mem.writeInt(i32, bytes[at + 8 ..][0..4], -1, .little);
        std.mem.writeInt(i32, bytes[at + 20 ..][0..4], 2, .little);
        at += 24;
    }
    @memcpy(bytes[at..], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 3), summary.path_drawing_records);

    std.mem.writeInt(u32, bytes[92..96], 20, .little);
    std.mem.writeInt(u32, bytes[48..52], 176, .little);
    try t.expectError(error.InvalidEmfPathDrawingSize, framing.validate(t.allocator, bytes[0..176]));
}

test "EMF framing connects EXTFLOODFILL structure and field validation" {
    const original = fixture();
    var bytes = [_]u8{0} ** 132;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.extfloodfill), .little);
    std.mem.writeInt(u32, bytes[92..96], 24, .little);
    std.mem.writeInt(i32, bytes[96..100], -2, .little);
    bytes[104..108].* = .{ 1, 2, 3, 0 };
    std.mem.writeInt(u32, bytes[108..112], @intFromEnum(@import("flood_fill_mode.zig").FloodFillMode.border), .little);
    @memcpy(bytes[112..132], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.flood_fill_records);

    std.mem.writeInt(u32, bytes[108..112], 2, .little);
    try t.expectError(error.InvalidEmfFloodFillMode, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects GRADIENTFILL arrays and index validation" {
    const original = fixture();
    var bytes = [_]u8{0} ** 188;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.gradientfill), .little);
    std.mem.writeInt(u32, bytes[92..96], 80, .little);
    std.mem.writeInt(u32, bytes[112..116], 2, .little);
    std.mem.writeInt(u32, bytes[116..120], 1, .little);
    std.mem.writeInt(u32, bytes[120..124], @intFromEnum(@import("gradient_fill_mode.zig").GradientFillMode.rectangle_vertical), .little);
    std.mem.writeInt(u32, bytes[156..160], 0, .little);
    std.mem.writeInt(u32, bytes[160..164], 1, .little);
    bytes[164..168].* = .{ 9, 8, 7, 6 };
    @memcpy(bytes[168..188], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.gradient_fill_records);

    std.mem.writeInt(u32, bytes[160..164], 2, .little);
    try t.expectError(error.EmfGradientVertexIndexOutOfBounds, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects BITBLT and propagates missing source errors" {
    const original = fixture();
    var bytes = [_]u8{0} ** 208;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.bitblt), .little);
    std.mem.writeInt(u32, bytes[92..96], 100, .little);
    std.mem.writeInt(u32, bytes[128..132], 0x00f00021, .little); // PATCOPY needs no source bitmap.
    @memcpy(bytes[188..208], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.bit_block_transfer_records);

    std.mem.writeInt(u32, bytes[128..132], 0x00cc0020, .little);
    try t.expectError(error.MissingEmfBitBltSourceBitmap, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects STRETCHBLT and propagates missing source errors" {
    const original = fixture();
    var bytes = [_]u8{0} ** 216;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.stretchblt), .little);
    std.mem.writeInt(u32, bytes[92..96], 108, .little);
    std.mem.writeInt(u32, bytes[128..132], 0x00f00021, .little);
    std.mem.writeInt(i32, bytes[188..192], -7, .little);
    std.mem.writeInt(i32, bytes[192..196], 9, .little);
    @memcpy(bytes[196..216], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.stretch_block_transfer_records);

    std.mem.writeInt(u32, bytes[128..132], 0x00cc0020, .little);
    try t.expectError(error.MissingEmfStretchBltSourceBitmap, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects MASKBLT and propagates bitmap-pair errors" {
    const original = fixture();
    var bytes = [_]u8{0} ** 284;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.maskblt), .little);
    std.mem.writeInt(u32, bytes[92..96], 176, .little);
    std.mem.writeInt(u32, bytes[128..132], 0xccf00000, .little);
    std.mem.writeInt(u32, bytes[168..172], 2, .little);
    std.mem.writeInt(u32, bytes[172..176], 132, .little);
    std.mem.writeInt(u32, bytes[176..180], 12, .little);
    std.mem.writeInt(u32, bytes[180..184], 144, .little);
    std.mem.writeInt(u32, bytes[184..188], 8, .little);
    std.mem.writeInt(u32, bytes[196..200], 2, .little);
    std.mem.writeInt(u32, bytes[200..204], 156, .little);
    std.mem.writeInt(u32, bytes[204..208], 12, .little);
    std.mem.writeInt(u32, bytes[208..212], 168, .little);
    std.mem.writeInt(u32, bytes[212..216], 8, .little);
    for ([_]usize{ 220, 244 }) |at| {
        std.mem.writeInt(u32, bytes[at..][0..4], 12, .little);
        std.mem.writeInt(u16, bytes[at + 4 ..][0..2], 2, .little);
        std.mem.writeInt(u16, bytes[at + 6 ..][0..2], 2, .little);
        std.mem.writeInt(u16, bytes[at + 8 ..][0..2], 1, .little);
        std.mem.writeInt(u16, bytes[at + 10 ..][0..2], 1, .little);
    }
    @memcpy(bytes[264..284], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.mask_block_transfer_records);

    @memset(bytes[200..216], 0);
    try t.expectError(error.MissingEmfMaskBltMaskBitmap, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects PLGBLT and propagates bitmap-pair errors" {
    const original = fixture();
    var bytes = [_]u8{0} ** 292;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.plgblt), .little);
    std.mem.writeInt(u32, bytes[92..96], 184, .little);
    std.mem.writeInt(u32, bytes[180..184], 2, .little);
    std.mem.writeInt(u32, bytes[184..188], 144, .little);
    std.mem.writeInt(u32, bytes[188..192], 12, .little);
    std.mem.writeInt(u32, bytes[192..196], 156, .little);
    std.mem.writeInt(u32, bytes[196..200], 8, .little);
    std.mem.writeInt(u32, bytes[208..212], 2, .little);
    std.mem.writeInt(u32, bytes[212..216], 164, .little);
    std.mem.writeInt(u32, bytes[216..220], 12, .little);
    std.mem.writeInt(u32, bytes[220..224], 176, .little);
    std.mem.writeInt(u32, bytes[224..228], 8, .little);
    for ([_]usize{ 232, 252 }) |at| {
        std.mem.writeInt(u32, bytes[at..][0..4], 12, .little);
        std.mem.writeInt(u16, bytes[at + 4 ..][0..2], 2, .little);
        std.mem.writeInt(u16, bytes[at + 6 ..][0..2], 2, .little);
        std.mem.writeInt(u16, bytes[at + 8 ..][0..2], 1, .little);
        std.mem.writeInt(u16, bytes[at + 10 ..][0..2], 1, .little);
    }
    @memcpy(bytes[272..292], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.parallelogram_block_transfer_records);
    @memset(bytes[212..228], 0);
    try t.expectError(error.MissingEmfPlgBltMaskBitmap, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects SETDIBITSTODEVICE and propagates source errors" {
    const original = fixture();
    var bytes = [_]u8{0} ** 212;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.setdibitstodevice), .little);
    std.mem.writeInt(u32, bytes[92..96], 104, .little);
    std.mem.writeInt(u32, bytes[136..140], 80, .little);
    std.mem.writeInt(u32, bytes[140..144], 12, .little);
    std.mem.writeInt(u32, bytes[144..148], 96, .little);
    std.mem.writeInt(u32, bytes[148..152], 8, .little);
    std.mem.writeInt(u32, bytes[152..156], 2, .little);
    std.mem.writeInt(u32, bytes[160..164], 2, .little);
    std.mem.writeInt(u32, bytes[168..172], 12, .little);
    std.mem.writeInt(u16, bytes[172..174], 2, .little);
    std.mem.writeInt(u16, bytes[174..176], 2, .little);
    std.mem.writeInt(u16, bytes[176..178], 1, .little);
    std.mem.writeInt(u16, bytes[178..180], 1, .little);
    @memcpy(bytes[192..212], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.set_dibits_to_device_records);
    @memset(bytes[136..152], 0);
    try t.expectError(error.MissingEmfSetDibitsToDeviceSourceBitmap, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects STRETCHDIBITS and propagates ROP source errors" {
    const original = fixture();
    var bytes = [_]u8{0} ** 216;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.stretchdibits), .little);
    std.mem.writeInt(u32, bytes[92..96], 108, .little);
    std.mem.writeInt(u32, bytes[136..140], 84, .little);
    std.mem.writeInt(u32, bytes[140..144], 12, .little);
    std.mem.writeInt(u32, bytes[144..148], 100, .little);
    std.mem.writeInt(u32, bytes[148..152], 8, .little);
    std.mem.writeInt(u32, bytes[152..156], 2, .little);
    std.mem.writeInt(u32, bytes[156..160], 0x00cc0020, .little);
    std.mem.writeInt(u32, bytes[172..176], 12, .little);
    std.mem.writeInt(u16, bytes[176..178], 2, .little);
    std.mem.writeInt(u16, bytes[178..180], 2, .little);
    std.mem.writeInt(u16, bytes[180..182], 1, .little);
    std.mem.writeInt(u16, bytes[182..184], 1, .little);
    @memcpy(bytes[196..216], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.stretch_dibits_records);
    @memset(bytes[136..152], 0);
    try t.expectError(error.MissingEmfStretchDibitsSourceBitmap, framing.validate(t.allocator, &bytes));
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
    std.mem.writeInt(u16, bytes[112..114], 40, .little);
    std.mem.writeInt(u16, bytes[114..116], 1, .little);
    std.mem.writeInt(u32, bytes[116..120], 0x20, .little);
    bytes[120] = 0;
    bytes[121] = 24;
    bytes[122..128].* = .{ 8, 16, 8, 8, 8, 0 };
    @memcpy(bytes[152..172], base[88..108]);
    const value = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@import("header_payload.zig").Variant.extension2, value.header_payload.variant);
    try t.expectEqualSlices(u8, &.{ 'A', 0, 0, 0 }, value.header_payload.description_utf16le.?);
    try t.expect(value.header_payload.extension1.?.open_gl);
    const pixel = value.header_payload.extension1.?.pixel_format.?;
    try t.expectEqual(@as(usize, 40), pixel.raw.len);
    try t.expectEqual(@import("pixel_format.zig").PixelType.rgba, pixel.pixel_type);
    try t.expect(pixel.flags.support_opengl);
    try t.expectEqual(@as(u8, 24), pixel.color_bits);
    try t.expectEqual(@as(i32, 508000), value.header_payload.extension2.?.micrometers.width);

    bytes[110] = 1;
    try t.expectError(error.MissingEmfDescriptionTerminator, framing.validate(t.allocator, &bytes));
    bytes[108..112].* = .{ 0, 0xd8, 0, 0 };
    try t.expectError(error.InvalidUnicodeEncoding, framing.validate(t.allocator, &bytes));
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
    const value = try framing.validate(t.allocator, &bytes);
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
    try t.expectError(error.InvalidEmfOpenGlFlag, framing.validate(t.allocator, &bytes));

    std.mem.writeInt(u32, bytes[96..100], 0, .little);
    std.mem.writeInt(u32, bytes[88..92], 39, .little);
    std.mem.writeInt(u32, bytes[92..96], 100, .little);
    var with_pixel = bytes ++ [_]u8{0} ** 40;
    std.mem.writeInt(u32, with_pixel[4..8], 140, .little);
    std.mem.writeInt(u32, with_pixel[48..52], with_pixel.len, .little);
    @memcpy(with_pixel[140..160], original[88..108]);
    try t.expectError(error.InvalidEmfPixelFormatSize, framing.validate(t.allocator, &with_pixel));
}

test "EMF framing rejects fixed header and EOF invariant drift" {
    var bytes = fixture();
    bytes[40] = 0;
    try t.expectError(error.InvalidEmfSignature, framing.validate(t.allocator, &bytes));
    bytes = fixture();
    bytes[58] = 1;
    try t.expectError(error.InvalidEmfHeaderReserved, framing.validate(t.allocator, &bytes));
    bytes = fixture();
    bytes[48] -= 1;
    try t.expectError(error.InvalidEmfDeclaredBytes, framing.validate(t.allocator, &bytes));
    bytes = fixture();
    bytes[52] = 3;
    try t.expectError(error.InvalidEmfDeclaredRecords, framing.validate(t.allocator, &bytes));
    bytes = fixture();
    bytes[104] = 19;
    try t.expectError(error.InvalidEmfEofSizeLast, framing.validate(t.allocator, &bytes));
}

test "EMF record iterator rejects truncation alignment and data after EOF" {
    const bytes = fixture();
    try t.expectError(error.MissingEmfHeader, framing.validate(t.allocator, bytes[0..0]));
    for (1..88) |cut| try t.expectError(error.TruncatedEmfRecord, framing.validate(t.allocator, bytes[0..cut]));
    var header_only = bytes[0..88].*;
    std.mem.writeInt(u32, header_only[48..52], header_only.len, .little);
    try t.expectError(error.MissingEmfEof, framing.validate(t.allocator, &header_only));
    for (89..108) |cut| {
        var truncated = bytes;
        std.mem.writeInt(u32, truncated[48..52], @intCast(cut), .little);
        try t.expectError(error.TruncatedEmfRecord, framing.validate(t.allocator, truncated[0..cut]));
    }
    var invalid = bytes;
    invalid[4] = 87;
    try t.expectError(error.InvalidEmfRecordSize, framing.validate(t.allocator, &invalid));
    invalid = bytes;
    std.mem.writeInt(u32, invalid[92..96], 16, .little);
    try t.expectError(error.InvalidEmfEofSize, framing.validate(t.allocator, &invalid));

    var trailing = bytes ++ [_]u8{0} ** 4;
    std.mem.writeInt(u32, trailing[48..52], trailing.len, .little);
    try t.expectError(error.DataAfterEmfEof, framing.validate(t.allocator, &trailing));
}

test "EMF framing validates parameterless path bracket records and trailing data" {
    const original = fixture();
    var valid = [_]u8{0} ** 124;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 4, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.beginpath), .little);
    std.mem.writeInt(u32, valid[92..96], 8, .little);
    std.mem.writeInt(u32, valid[96..100], @intFromEnum(@import("records.zig").RecordType.endpath), .little);
    std.mem.writeInt(u32, valid[100..104], 8, .little);
    @memcpy(valid[104..124], original[88..108]);
    try t.expectEqual(@as(usize, 4), (try framing.validate(t.allocator, &valid)).records);

    var invalid = [_]u8{0} ** 120;
    @memcpy(invalid[0..88], original[0..88]);
    std.mem.writeInt(u32, invalid[48..52], invalid.len, .little);
    std.mem.writeInt(u32, invalid[52..56], 3, .little);
    std.mem.writeInt(u32, invalid[88..92], @intFromEnum(@import("records.zig").RecordType.closefigure), .little);
    std.mem.writeInt(u32, invalid[92..96], 12, .little);
    @memcpy(invalid[100..120], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &invalid)).records);

    var unclosed = [_]u8{0} ** 116;
    @memcpy(unclosed[0..96], valid[0..96]);
    std.mem.writeInt(u32, unclosed[48..52], unclosed.len, .little);
    std.mem.writeInt(u32, unclosed[52..56], 3, .little);
    @memcpy(unclosed[96..116], original[88..108]);
    try t.expectError(error.UnclosedEmfPathBracket, framing.validate(t.allocator, &unclosed));
}

test "EMF framing validates world transform records" {
    const original = fixture();
    var valid = [_]u8{0} ** 140;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 3, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.setworldtransform), .little);
    std.mem.writeInt(u32, valid[92..96], 32, .little);
    std.mem.writeInt(u32, valid[96..100], 0x3f800000, .little);
    @memcpy(valid[120..140], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &valid)).records);

    var invalid = [_]u8{0} ** 144;
    @memcpy(invalid[0..88], original[0..88]);
    std.mem.writeInt(u32, invalid[48..52], invalid.len, .little);
    std.mem.writeInt(u32, invalid[52..56], 3, .little);
    std.mem.writeInt(u32, invalid[88..92], @intFromEnum(@import("records.zig").RecordType.modifyworldtransform), .little);
    std.mem.writeInt(u32, invalid[92..96], 36, .little);
    @memcpy(invalid[124..144], original[88..108]);
    try t.expectError(error.InvalidEmfModifyWorldTransformMode, framing.validate(t.allocator, &invalid));
}

test "EMF framing validates fixed point state records and trailing data" {
    const original = fixture();
    var valid = [_]u8{0} ** 124;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 3, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.movetoex), .little);
    std.mem.writeInt(u32, valid[92..96], 16, .little);
    std.mem.writeInt(i32, valid[96..100], -7, .little);
    std.mem.writeInt(i32, valid[100..104], 9, .little);
    @memcpy(valid[104..124], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &valid)).records);

    var invalid = [_]u8{0} ** 128;
    @memcpy(invalid[0..88], original[0..88]);
    std.mem.writeInt(u32, invalid[48..52], invalid.len, .little);
    std.mem.writeInt(u32, invalid[52..56], 3, .little);
    std.mem.writeInt(u32, invalid[88..92], @intFromEnum(@import("records.zig").RecordType.movetoex), .little);
    std.mem.writeInt(u32, invalid[92..96], 20, .little);
    @memcpy(invalid[108..128], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &invalid)).records);
}

test "EMF framing validates strict modes and preserves unknown stretch modes" {
    const original = fixture();
    var valid = [_]u8{0} ** 120;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 3, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.setstretchbltmode), .little);
    std.mem.writeInt(u32, valid[92..96], 12, .little);
    std.mem.writeInt(u32, valid[96..100], std.math.maxInt(u32), .little);
    @memcpy(valid[100..120], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &valid)).records);

    var invalid = valid;
    std.mem.writeInt(u32, invalid[88..92], @intFromEnum(@import("records.zig").RecordType.setmapmode), .little);
    std.mem.writeInt(u32, invalid[96..100], 0, .little);
    try t.expectError(error.InvalidEmfMapMode, framing.validate(t.allocator, &invalid));
}

test "EMF framing validates ColorRef state records" {
    const original = fixture();
    var valid = [_]u8{0} ** 120;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 3, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.settextcolor), .little);
    std.mem.writeInt(u32, valid[92..96], 12, .little);
    valid[96..100].* = .{ 1, 2, 3, 0 };
    @memcpy(valid[100..120], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &valid)).records);

    valid[99] = 1;
    try t.expectError(error.InvalidWmfColorReserved, framing.validate(t.allocator, &valid));
}

test "EMF framing validates mapper flags and miter limit records" {
    const original = fixture();
    var valid = [_]u8{0} ** 132;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 4, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.setmapperflags), .little);
    std.mem.writeInt(u32, valid[92..96], 12, .little);
    valid[96] = 1;
    std.mem.writeInt(u32, valid[100..104], @intFromEnum(@import("records.zig").RecordType.setmiterlimit), .little);
    std.mem.writeInt(u32, valid[104..108], 12, .little);
    std.mem.writeInt(u32, valid[108..112], 0x7fc01234, .little);
    @memcpy(valid[112..132], original[88..108]);
    try t.expectEqual(@as(usize, 4), (try framing.validate(t.allocator, &valid)).records);

    var invalid_mapper = valid;
    invalid_mapper[96] = 2;
    try t.expectError(error.InvalidEmfMapperFlags, framing.validate(t.allocator, &invalid_mapper));

    var extended_miter = [_]u8{0} ** 136;
    @memcpy(extended_miter[0..100], valid[0..100]);
    std.mem.writeInt(u32, extended_miter[48..52], extended_miter.len, .little);
    std.mem.writeInt(u32, extended_miter[100..104], @intFromEnum(@import("records.zig").RecordType.setmiterlimit), .little);
    std.mem.writeInt(u32, extended_miter[104..108], 16, .little);
    @memcpy(extended_miter[116..136], original[88..108]);
    try t.expectEqual(@as(usize, 4), (try framing.validate(t.allocator, &extended_miter)).records);
}

test "EMF framing validates text alignment components" {
    const original = fixture();
    var valid = [_]u8{0} ** 120;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 3, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.settextalign), .little);
    std.mem.writeInt(u32, valid[92..96], 12, .little);
    std.mem.writeInt(u32, valid[96..100], 0x011f, .little);
    @memcpy(valid[100..120], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &valid)).records);

    std.mem.writeInt(u32, valid[96..100], 0x0004, .little);
    try t.expectError(error.InvalidEmfTextAlignmentFlags, framing.validate(t.allocator, &valid));
}

test "EMF framing validates text justification and extent scaling" {
    const original = fixture();
    var valid = [_]u8{0} ** 148;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 4, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.settextjustification), .little);
    std.mem.writeInt(u32, valid[92..96], 16, .little);
    std.mem.writeInt(i32, valid[96..100], -9, .little);
    std.mem.writeInt(i32, valid[100..104], 3, .little);
    std.mem.writeInt(u32, valid[104..108], @intFromEnum(@import("records.zig").RecordType.scaleviewportextex), .little);
    std.mem.writeInt(u32, valid[108..112], 24, .little);
    std.mem.writeInt(i32, valid[112..116], -1, .little);
    std.mem.writeInt(i32, valid[116..120], 2, .little);
    std.mem.writeInt(i32, valid[120..124], 3, .little);
    std.mem.writeInt(i32, valid[124..128], -4, .little);
    @memcpy(valid[128..148], original[88..108]);
    try t.expectEqual(@as(usize, 4), (try framing.validate(t.allocator, &valid)).records);

    var invalid_scale = valid;
    std.mem.writeInt(i32, invalid_scale[112..116], 0, .little);
    try t.expectError(error.InvalidEmfScaleExtentRatio, framing.validate(t.allocator, &invalid_scale));

    var extended_text = [_]u8{0} ** 152;
    @memcpy(extended_text[0..88], original[0..88]);
    std.mem.writeInt(u32, extended_text[48..52], extended_text.len, .little);
    std.mem.writeInt(u32, extended_text[52..56], 3, .little);
    std.mem.writeInt(u32, extended_text[88..92], @intFromEnum(@import("records.zig").RecordType.settextjustification), .little);
    std.mem.writeInt(u32, extended_text[92..96], 44, .little);
    @memcpy(extended_text[132..152], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &extended_text)).records);

    var short_text = [_]u8{0} ** 120;
    @memcpy(short_text[0..88], original[0..88]);
    std.mem.writeInt(u32, short_text[48..52], short_text.len, .little);
    std.mem.writeInt(u32, short_text[52..56], 3, .little);
    std.mem.writeInt(u32, short_text[88..92], @intFromEnum(@import("records.zig").RecordType.settextjustification), .little);
    std.mem.writeInt(u32, short_text[92..96], 12, .little);
    @memcpy(short_text[100..120], original[88..108]);
    try t.expectError(error.InvalidEmfTextJustificationRecordSize, framing.validate(t.allocator, &short_text));
}

test "EMF framing validates device-context save and relative restore" {
    const original = fixture();
    var valid = [_]u8{0} ** 128;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 4, .little);
    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.savedc), .little);
    std.mem.writeInt(u32, valid[92..96], 8, .little);
    std.mem.writeInt(u32, valid[96..100], @intFromEnum(@import("records.zig").RecordType.restoredc), .little);
    std.mem.writeInt(u32, valid[100..104], 12, .little);
    std.mem.writeInt(i32, valid[104..108], -1, .little);
    @memcpy(valid[108..128], original[88..108]);
    try t.expectEqual(@as(usize, 4), (try framing.validate(t.allocator, &valid)).records);

    var missing_save = valid;
    std.mem.writeInt(u32, missing_save[88..92], @intFromEnum(@import("records.zig").RecordType.realizepalette), .little);
    try t.expectError(error.InvalidEmfRestoreDcDepth, framing.validate(t.allocator, &missing_save));

    var nonnegative = valid;
    std.mem.writeInt(i32, nonnegative[104..108], 0, .little);
    try t.expectError(error.InvalidEmfRestoreDcIndex, framing.validate(t.allocator, &nonnegative));

    var extended_save = [_]u8{0} ** 132;
    @memcpy(extended_save[0..88], original[0..88]);
    std.mem.writeInt(u32, extended_save[48..52], extended_save.len, .little);
    std.mem.writeInt(u32, extended_save[52..56], 3, .little);
    std.mem.writeInt(u32, extended_save[88..92], @intFromEnum(@import("records.zig").RecordType.savedc), .little);
    std.mem.writeInt(u32, extended_save[92..96], 24, .little);
    @memcpy(extended_save[112..132], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &extended_save)).records);
}

test "EMF framing validates logical palette record wire contracts" {
    const original = fixture();
    var valid = [_]u8{0} ** 188;
    @memcpy(valid[0..88], original[0..88]);
    std.mem.writeInt(u32, valid[48..52], valid.len, .little);
    std.mem.writeInt(u32, valid[52..56], 7, .little);
    std.mem.writeInt(u16, valid[56..58], 2, .little);

    std.mem.writeInt(u32, valid[88..92], @intFromEnum(@import("records.zig").RecordType.createpalette), .little);
    std.mem.writeInt(u32, valid[92..96], 20, .little);
    std.mem.writeInt(u32, valid[96..100], 1, .little);
    std.mem.writeInt(u16, valid[100..102], 0x0300, .little);
    std.mem.writeInt(u16, valid[102..104], 1, .little);
    valid[104..108].* = .{ 0, 30, 20, 10 };

    std.mem.writeInt(u32, valid[108..112], @intFromEnum(@import("records.zig").RecordType.setpaletteentries), .little);
    std.mem.writeInt(u32, valid[112..116], 24, .little);
    std.mem.writeInt(u32, valid[116..120], 1, .little);
    std.mem.writeInt(u32, valid[120..124], 0, .little);
    std.mem.writeInt(u32, valid[124..128], 1, .little);
    valid[128..132].* = .{ 9, 60, 50, 40 };

    std.mem.writeInt(u32, valid[132..136], @intFromEnum(@import("records.zig").RecordType.resizepalette), .little);
    std.mem.writeInt(u32, valid[136..140], 16, .little);
    std.mem.writeInt(u32, valid[140..144], 1, .little);
    std.mem.writeInt(u32, valid[144..148], 0x400, .little);

    std.mem.writeInt(u32, valid[148..152], @intFromEnum(@import("records.zig").RecordType.selectpalette), .little);
    std.mem.writeInt(u32, valid[152..156], 12, .little);
    std.mem.writeInt(u32, valid[156..160], 1, .little);
    std.mem.writeInt(u32, valid[160..164], @intFromEnum(@import("records.zig").RecordType.realizepalette), .little);
    std.mem.writeInt(u32, valid[164..168], 8, .little);
    @memcpy(valid[168..188], original[88..108]);
    const summary = try framing.validate(t.allocator, &valid);
    try t.expectEqual(@as(usize, 7), summary.records);
    try t.expectEqual(@as(usize, 1), summary.objects.creates);
    try t.expectEqual(@as(usize, 1), summary.objects.palette_selects);
    try t.expectEqual(@as(usize, 2), summary.objects.palette_updates);
    try t.expectEqual(@as(usize, 1), summary.objects.peak_live);
    try t.expectEqual(@as(usize, 1), summary.objects.final_live);

    var bad_version = valid;
    std.mem.writeInt(u16, bad_version[100..102], 0x0200, .little);
    try t.expectError(error.InvalidEmfLogPaletteVersion, framing.validate(t.allocator, &bad_version));
    var bad_resize = valid;
    std.mem.writeInt(u32, bad_resize[144..148], 0, .little);
    try t.expectError(error.InvalidEmfPaletteEntryCount, framing.validate(t.allocator, &bad_resize));
    var no_object_slot = valid;
    std.mem.writeInt(u16, no_object_slot[56..58], 0, .little);
    try t.expectError(error.EmfObjectHandleOutOfBounds, framing.validate(t.allocator, &no_object_slot));
    var wrong_object_type = valid;
    std.mem.writeInt(u32, wrong_object_type[88..92], @intFromEnum(@import("records.zig").RecordType.createpen), .little);
    try t.expectError(error.InvalidEmfCreatePenRecordSize, framing.validate(t.allocator, &wrong_object_type));
    var update_past_end = valid;
    std.mem.writeInt(u32, update_past_end[120..124], 1, .little);
    try t.expectError(error.EmfPaletteUpdateOutOfBounds, framing.validate(t.allocator, &update_past_end));
    var extended_realize = [_]u8{0} ** 192;
    @memcpy(extended_realize[0..160], valid[0..160]);
    std.mem.writeInt(u32, extended_realize[48..52], extended_realize.len, .little);
    std.mem.writeInt(u32, extended_realize[160..164], @intFromEnum(@import("records.zig").RecordType.realizepalette), .little);
    std.mem.writeInt(u32, extended_realize[164..168], 12, .little);
    @memcpy(extended_realize[172..192], original[88..108]);
    try t.expectEqual(@as(usize, 7), (try framing.validate(t.allocator, &extended_realize)).records);

    var no_memory: [0]u8 = .{};
    var fba = std.heap.FixedBufferAllocator.init(&no_memory);
    try t.expectError(error.OutOfMemory, framing.validate(fba.allocator(), &valid));
}

test "EMF framing connects SELECTOBJECT activation deletion and default restoration" {
    const original = fixture();
    var bytes = [_]u8{0} ** 160;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 5, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.createpen), .little);
    std.mem.writeInt(u32, bytes[92..96], 28, .little);
    std.mem.writeInt(u32, bytes[96..100], 1, .little);
    std.mem.writeInt(i32, bytes[104..108], 1, .little);
    std.mem.writeInt(u32, bytes[116..120], @intFromEnum(@import("records.zig").RecordType.selectobject), .little);
    std.mem.writeInt(u32, bytes[120..124], 12, .little);
    std.mem.writeInt(u32, bytes[124..128], 1, .little);
    std.mem.writeInt(u32, bytes[128..132], @intFromEnum(@import("records.zig").RecordType.deleteobject), .little);
    std.mem.writeInt(u32, bytes[132..136], 12, .little);
    std.mem.writeInt(u32, bytes[136..140], 1, .little);
    @memcpy(bytes[140..160], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.objects.selections);
    try t.expectEqual(@as(usize, 1), summary.objects.default_restores);
    try t.expectEqual(@as(usize, 0), summary.objects.final_explicit_selected);

    var stock = [_]u8{0} ** 120;
    @memcpy(stock[0..88], original[0..88]);
    std.mem.writeInt(u32, stock[48..52], stock.len, .little);
    std.mem.writeInt(u32, stock[52..56], 3, .little);
    std.mem.writeInt(u32, stock[88..92], @intFromEnum(@import("records.zig").RecordType.selectobject), .little);
    std.mem.writeInt(u32, stock[92..96], 12, .little);
    std.mem.writeInt(u32, stock[96..100], 0x80000013, .little);
    @memcpy(stock[100..120], original[88..108]);
    const stock_summary = try framing.validate(t.allocator, &stock);
    try t.expectEqual(@as(usize, 1), stock_summary.objects.stock_selections);
    try t.expectEqual(@as(usize, 0), stock_summary.objects.final_explicit_selected);
}

test "EMF framing validates extended pen payload before object creation" {
    const original = fixture();
    var bytes = [_]u8{0} ** 164;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.extcreatepen), .little);
    std.mem.writeInt(u32, bytes[92..96], 56, .little);
    std.mem.writeInt(u32, bytes[96..100], 1, .little);
    std.mem.writeInt(u32, bytes[120..124], 1, .little);
    bytes[140..144].* = .{ 1, 2, 3, 4 };
    @memcpy(bytes[144..164], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.objects.creates);
    try t.expectEqual(@as(usize, 1), summary.objects.final_live);

    var truncated_style = bytes;
    std.mem.writeInt(u32, truncated_style[136..140], 2, .little);
    try t.expectError(error.TruncatedEmfPenStyleEntries, framing.validate(t.allocator, &truncated_style));
}

test "EMF framing validates monochrome bitmap brush before object creation" {
    const original = fixture();
    var bytes = [_]u8{0} ** 172;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.createmonobrush), .little);
    std.mem.writeInt(u32, bytes[92..96], 64, .little);
    std.mem.writeInt(u32, bytes[96..100], 1, .little);
    std.mem.writeInt(u32, bytes[104..108], 32, .little);
    std.mem.writeInt(u32, bytes[108..112], 18, .little);
    std.mem.writeInt(u32, bytes[112..116], 50, .little);
    std.mem.writeInt(u32, bytes[116..120], 8, .little);
    std.mem.writeInt(u32, bytes[120..124], 12, .little);
    std.mem.writeInt(u16, bytes[124..126], 2, .little);
    std.mem.writeInt(u16, bytes[126..128], 2, .little);
    std.mem.writeInt(u16, bytes[128..130], 1, .little);
    std.mem.writeInt(u16, bytes[130..132], 1, .little);
    bytes[148..152].* = .{ 1, 2, 3, 4 };
    @memcpy(bytes[152..172], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.objects.creates);
    try t.expectEqual(@as(usize, 1), summary.objects.final_live);

    var not_monochrome = bytes;
    std.mem.writeInt(u16, not_monochrome[130..132], 4, .little);
    try t.expectError(error.InvalidEmfMonochromeBrushBitCount, framing.validate(t.allocator, &not_monochrome));
}

test "EMF framing validates extended font payload before object creation" {
    const original = fixture();
    const font_size = @import("font_creation.zig").minimum_size;
    var bytes: [88 + font_size + 20]u8 = undefined;
    @memset(&bytes, 0);
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    @memset(bytes[88 .. 88 + font_size], 0);
    std.mem.writeInt(u32, bytes[96..100], 1, .little);
    std.mem.writeInt(i32, bytes[116..120], 400, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.extcreatefontindirectw), .little);
    std.mem.writeInt(u32, bytes[92..96], font_size, .little);
    @memcpy(bytes[88 + font_size ..], original[88..108]);

    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.objects.creates);
    try t.expectEqual(@as(usize, 1), summary.objects.final_live);
    var invalid = bytes;
    invalid[88 + 12 + 20] = 2;
    try t.expectError(error.InvalidEmfFontBoolean, framing.validate(t.allocator, &invalid));
}

test "EMF framing validates 32-bit poly drawing arrays" {
    const original = fixture();
    var bytes = [_]u8{0} ** 156;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.polyline), .little);
    std.mem.writeInt(u32, bytes[92..96], 48, .little);
    std.mem.writeInt(i32, bytes[96..100], -20, .little);
    std.mem.writeInt(u32, bytes[112..116], 2, .little);
    std.mem.writeInt(i32, bytes[116..120], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, bytes[128..132], std.math.maxInt(i32), .little);
    bytes[132..136].* = .{ 1, 2, 3, 4 };
    @memcpy(bytes[136..156], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &bytes)).records);

    std.mem.writeInt(u32, bytes[112..116], 3, .little);
    try t.expectError(error.InvalidEmfPolyRecordSize, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates 16-bit poly drawing arrays" {
    const original = fixture();
    var bytes = [_]u8{0} ** 148;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.polyline16), .little);
    std.mem.writeInt(u32, bytes[92..96], 40, .little);
    std.mem.writeInt(u32, bytes[112..116], 2, .little);
    std.mem.writeInt(i16, bytes[116..118], std.math.minInt(i16), .little);
    std.mem.writeInt(i16, bytes[120..122], std.math.maxInt(i16), .little);
    bytes[124..128].* = .{ 1, 2, 3, 4 };
    @memcpy(bytes[128..148], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &bytes)).records);

    std.mem.writeInt(u32, bytes[112..116], 4, .little);
    try t.expectError(error.InvalidEmfPoly16RecordSize, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates POLYDRAW type arrays and alignment" {
    const original = fixture();
    var bytes = [_]u8{0} ** 148;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.polydraw16), .little);
    std.mem.writeInt(u32, bytes[92..96], 40, .little);
    std.mem.writeInt(u32, bytes[112..116], 1, .little);
    std.mem.writeInt(i16, bytes[116..118], -7, .little);
    bytes[120] = 3;
    bytes[121..124].* = .{ 0xaa, 0xbb, 0xcc };
    bytes[124..128].* = .{ 1, 2, 3, 4 };
    @memcpy(bytes[128..148], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &bytes)).records);

    bytes[120] = 7;
    try t.expectError(error.InvalidEmfPointType, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates LINETO and SETPIXELV payloads" {
    const original = fixture();
    var bytes = [_]u8{0} ** 144;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 4, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.lineto), .little);
    std.mem.writeInt(u32, bytes[92..96], 16, .little);
    std.mem.writeInt(i32, bytes[96..100], -1, .little);
    std.mem.writeInt(u32, bytes[104..108], @intFromEnum(@import("records.zig").RecordType.setpixelv), .little);
    std.mem.writeInt(u32, bytes[108..112], 20, .little);
    std.mem.writeInt(i32, bytes[112..116], 2, .little);
    bytes[120..124].* = .{ 10, 20, 30, 0 };
    @memcpy(bytes[124..144], original[88..108]);
    try t.expectEqual(@as(usize, 4), (try framing.validate(t.allocator, &bytes)).records);

    bytes[123] = 1;
    try t.expectError(error.InvalidWmfColorReserved, framing.validate(t.allocator, &bytes));
}

test "EMF framing validates basic shape payloads" {
    const original = fixture();
    var bytes = [_]u8{0} ** 140;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 3, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.roundrect), .little);
    std.mem.writeInt(u32, bytes[92..96], 32, .little);
    std.mem.writeInt(i32, bytes[96..100], -4, .little);
    std.mem.writeInt(i32, bytes[116..120], 8, .little);
    @memcpy(bytes[120..140], original[88..108]);
    try t.expectEqual(@as(usize, 3), (try framing.validate(t.allocator, &bytes)).records);

    std.mem.writeInt(u32, bytes[92..96], 28, .little);
    try t.expectError(error.InvalidEmfRoundRectRecordSize, framing.validate(t.allocator, &bytes));
}

test "EMF framing connects color-space set and dedicated deletion" {
    const original = fixture();
    var bytes = [_]u8{0} ** 476;
    @memcpy(bytes[0..88], original[0..88]);
    std.mem.writeInt(u32, bytes[48..52], bytes.len, .little);
    std.mem.writeInt(u32, bytes[52..56], 5, .little);
    std.mem.writeInt(u16, bytes[56..58], 1, .little);
    std.mem.writeInt(u32, bytes[88..92], @intFromEnum(@import("records.zig").RecordType.createcolorspace), .little);
    std.mem.writeInt(u32, bytes[92..96], 344, .little);
    std.mem.writeInt(u32, bytes[96..100], 1, .little);
    std.mem.writeInt(u32, bytes[100..104], @import("log_color_space.zig").signature, .little);
    std.mem.writeInt(u32, bytes[104..108], @import("log_color_space.zig").version, .little);
    std.mem.writeInt(u32, bytes[108..112], @import("log_color_space.zig").ansi_size, .little);
    std.mem.writeInt(u32, bytes[112..116], @intFromEnum(@import("color_space_values.zig").LogicalColorSpace.srgb), .little);
    std.mem.writeInt(u32, bytes[116..120], @intFromEnum(@import("color_space_values.zig").GamutMappingIntent.images), .little);
    bytes[428..432].* = .{ 1, 2, 3, 4 };
    std.mem.writeInt(u32, bytes[432..436], @intFromEnum(@import("records.zig").RecordType.setcolorspace), .little);
    std.mem.writeInt(u32, bytes[436..440], 12, .little);
    std.mem.writeInt(u32, bytes[440..444], 1, .little);
    std.mem.writeInt(u32, bytes[444..448], @intFromEnum(@import("records.zig").RecordType.deletecolorspace), .little);
    std.mem.writeInt(u32, bytes[448..452], 12, .little);
    std.mem.writeInt(u32, bytes[452..456], 1, .little);
    @memcpy(bytes[456..476], original[88..108]);
    const summary = try framing.validate(t.allocator, &bytes);
    try t.expectEqual(@as(usize, 1), summary.objects.color_space_sets);
    try t.expectEqual(@as(usize, 1), summary.objects.color_space_deletes);
    try t.expectEqual(@as(usize, 1), summary.objects.default_restores);
    try t.expectEqual(@as(usize, 0), summary.objects.final_live);
    try t.expectEqual(@as(usize, 0), summary.objects.final_explicit_selected);
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
    const value = try framing.validate(t.allocator, &bytes);
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
    try t.expectError(error.InvalidEmfPaletteOffset, framing.validate(t.allocator, &invalid_offset));
}

test "EMF EOF palette validates header count offset and SizeLast boundary" {
    var bytes = fixture();
    bytes[68] = 1;
    try t.expectError(error.InvalidEmfPaletteCount, framing.validate(t.allocator, &bytes));
    bytes = fixture();
    bytes[68] = 1;
    bytes[96] = 1;
    bytes[100] = 15;
    try t.expectError(error.InvalidEmfPaletteOffset, framing.validate(t.allocator, &bytes));
    bytes = fixture();
    bytes[68] = 1;
    bytes[96] = 1;
    bytes[100] = 16;
    try t.expectError(error.InvalidEmfPaletteRange, framing.validate(t.allocator, &bytes));
}
