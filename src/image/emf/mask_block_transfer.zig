const std = @import("std");
const bitmap_pair = @import("bitmap_pair.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const quaternary = @import("quaternary_raster_operation.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const xform = @import("xform.zig");
const color_ref = @import("../wmf/color_ref.zig");

pub const fixed_size = 128;
pub const MaskBlt = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    destination_size: geometry.SizeL,
    raster_operation: quaternary.Operation,
    source: geometry.PointL,
    source_transform: xform.XForm,
    source_background: color_ref.ColorRef,
    source_usage: dib_colors.Usage,
    mask_origin: geometry.PointL,
    mask_usage: dib_colors.Usage,
    bitmaps: bitmap_pair.Pair,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?MaskBlt {
    if (record.kind != .maskblt) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfMaskBltSize;
    const source_usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[80..84], .little));
    const mask_usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[108..112], .little));
    const pair = bitmap_pair.parse(record.bytes, end, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[84..88], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[88..92], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[92..96], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[96..100], .little),
    }, source_usage, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[112..116], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[116..120], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[120..124], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[124..128], .little),
    }, mask_usage) catch |err| switch (err) {
        error.MissingEmfBitmapPairSource => return error.MissingEmfMaskBltSourceBitmap,
        error.MissingEmfBitmapPairMask => return error.MissingEmfMaskBltMaskBitmap,
        else => return err,
    };
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .destination = try geometry.parsePointL(record.bytes[24..32]),
        .destination_size = try geometry.parseSizeL(record.bytes[32..40]),
        .raster_operation = try quaternary.parse(std.mem.readInt(u32, record.bytes[40..44], .little)),
        .source = try geometry.parsePointL(record.bytes[44..52]),
        .source_transform = try xform.parse(record.bytes[52..76]),
        .source_background = try color_ref.parse(record.bytes[76..80], .specified_zero),
        .source_usage = source_usage,
        .mask_origin = try geometry.parsePointL(record.bytes[100..108]),
        .mask_usage = mask_usage,
        .bitmaps = pair,
        .trailing_data = record.bytes[pair.semantic_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn writeCoreHeader(bytes: []u8, at: usize, bit_count: u16) void {
    std.mem.writeInt(u32, bytes[at..][0..4], 12, .little);
    std.mem.writeInt(u16, bytes[at + 4 ..][0..2], 2, .little);
    std.mem.writeInt(u16, bytes[at + 6 ..][0..2], 2, .little);
    std.mem.writeInt(u16, bytes[at + 8 ..][0..2], 1, .little);
    std.mem.writeInt(u16, bytes[at + 10 ..][0..2], bit_count, .little);
}

fn validRecord() [176]u8 {
    var bytes = [_]u8{0} ** 176;
    std.mem.writeInt(u32, bytes[40..44], 0xccf00000, .little);
    std.mem.writeInt(u32, bytes[80..84], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[84..88], 132, .little);
    std.mem.writeInt(u32, bytes[88..92], 12, .little);
    std.mem.writeInt(u32, bytes[92..96], 144, .little);
    std.mem.writeInt(u32, bytes[96..100], 8, .little);
    std.mem.writeInt(u32, bytes[108..112], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[112..116], 156, .little);
    std.mem.writeInt(u32, bytes[116..120], 12, .little);
    std.mem.writeInt(u32, bytes[120..124], 168, .little);
    std.mem.writeInt(u32, bytes[124..128], 8, .little);
    writeCoreHeader(&bytes, 132, 1);
    writeCoreHeader(&bytes, 156, 1);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfMaskBltParseError else |_| return;
}

test "MASKBLT preserves fixed fields ROP4 and either bitmap order" {
    var bytes = validRecord();
    std.mem.writeInt(i32, bytes[24..28], -2, .little);
    std.mem.writeInt(i32, bytes[100..104], -7, .little);
    bytes[76..80].* = .{ 1, 2, 3, 0 };
    const value = (try parse(fixture(.maskblt, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -2), value.destination.x);
    try std.testing.expectEqual(@as(i32, -7), value.mask_origin.x);
    try std.testing.expectEqual(@as(u8, 0xcc), value.raster_operation.foreground_index);
    try std.testing.expectEqual(@as(u8, 0xf0), value.raster_operation.background_index);
    try std.testing.expectEqual(@as(u8, 3), value.source_background.blue);
    try std.testing.expect(value.bitmaps.source.start < value.bitmaps.mask.start);

    var extended: [180]u8 = undefined;
    @memcpy(extended[0..176], &bytes);
    extended[176..].* = .{ 9, 8, 7, 6 };
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try parse(fixture(.maskblt, &extended))).?.trailing_data);

    var reversed = bytes;
    std.mem.writeInt(u32, reversed[84..88], 156, .little);
    std.mem.writeInt(u32, reversed[92..96], 168, .little);
    std.mem.writeInt(u32, reversed[112..116], 132, .little);
    std.mem.writeInt(u32, reversed[120..124], 144, .little);
    try std.testing.expect((try parse(fixture(.maskblt, &reversed))).?.bitmaps.mask.start < (try parse(fixture(.maskblt, &reversed))).?.bitmaps.source.start);
}

test "MASKBLT rejects missing non-mono overlapping truncated and unrelated records" {
    var bytes = validRecord();
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfMaskBltSize, parse(fixture(.maskblt, bytes[0..cut])));
    for (fixed_size..bytes.len) |cut| try expectParseError(fixture(.maskblt, bytes[0..cut]));
    var mismatch = fixture(.maskblt, &bytes);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfMaskBltSize, parse(mismatch));
    var missing = bytes;
    @memset(missing[112..128], 0);
    try std.testing.expectError(error.MissingEmfMaskBltMaskBitmap, parse(fixture(.maskblt, &missing)));
    var non_mono = bytes;
    std.mem.writeInt(u16, non_mono[166..168], 4, .little);
    try std.testing.expectError(error.InvalidEmfMonochromeBrushBitCount, parse(fixture(.maskblt, &non_mono)));
    var overlap = bytes;
    std.mem.writeInt(u16, overlap[138..140], 6, .little);
    std.mem.writeInt(u32, overlap[96..100], 24, .little);
    try std.testing.expectError(error.OverlappingEmfBitmapPair, parse(fixture(.maskblt, &overlap)));
    try std.testing.expect((try parse(fixture(.plgblt, bytes[0..fixed_size]))) == null);
}
