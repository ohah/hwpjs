const std = @import("std");
const bitmap_source = @import("bitmap_source.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const scanline_range = @import("scanline_range.zig");

pub const fixed_size = 76;
pub const SetDibitsToDevice = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    source: geometry.PointL,
    source_size: geometry.SizeL,
    source_usage: dib_colors.Usage,
    start_scan: u32,
    scan_count: u32,
    scanlines: scanline_range.Range,
    bitmap: bitmap_source.Source,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?SetDibitsToDevice {
    if (record.kind != .setdibitstodevice) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfSetDibitsToDeviceSize;
    const usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[64..68], .little));
    const start_scan = std.mem.readInt(u32, record.bytes[68..72], .little);
    const scan_count = std.mem.readInt(u32, record.bytes[72..76], .little);
    const bitmap = (try bitmap_source.parseWithOptions(record.bytes, end, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[48..52], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[52..56], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[56..60], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[60..64], .little),
    }, usage, .{ .uncompressed_rows = scan_count })) orelse return error.MissingEmfSetDibitsToDeviceSourceBitmap;
    const scanlines = try scanline_range.validate(start_scan, scan_count, bitmap.dib.header.height);
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .destination = try geometry.parsePointL(record.bytes[24..32]),
        .source = try geometry.parsePointL(record.bytes[32..40]),
        .source_size = try geometry.parseSizeL(record.bytes[40..48]),
        .source_usage = usage,
        .start_scan = start_scan,
        .scan_count = scan_count,
        .scanlines = scanlines,
        .bitmap = bitmap,
        .trailing_data = record.bytes[bitmap.semantic_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn validRecord() [104]u8 {
    var bytes = [_]u8{0} ** 104;
    std.mem.writeInt(u32, bytes[48..52], 80, .little);
    std.mem.writeInt(u32, bytes[52..56], 12, .little);
    std.mem.writeInt(u32, bytes[56..60], 96, .little);
    std.mem.writeInt(u32, bytes[60..64], 8, .little);
    std.mem.writeInt(u32, bytes[64..68], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[68..72], 1, .little);
    std.mem.writeInt(u32, bytes[72..76], 2, .little);
    std.mem.writeInt(u32, bytes[80..84], 12, .little);
    std.mem.writeInt(u16, bytes[84..86], 2, .little);
    std.mem.writeInt(u16, bytes[86..88], 4, .little);
    std.mem.writeInt(u16, bytes[88..90], 1, .little);
    std.mem.writeInt(u16, bytes[90..92], 1, .little);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfSetDibitsToDeviceParseError else |_| return;
}

test "SETDIBITSTODEVICE parses signed geometry unsigned scans and undefined spaces" {
    var bytes = validRecord();
    for ([_]i32{ -9, 10, -11, 12 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    for ([_]i32{ -1, 2, -3, 4, -5, 6 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[24 + index * 4 ..][0..4], value, .little);
    const value = (try parse(fixture(.setdibitstodevice, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -9), value.bounds.left);
    try std.testing.expectEqual(@as(i32, 10), value.bounds.top);
    try std.testing.expectEqual(@as(i32, -11), value.bounds.right);
    try std.testing.expectEqual(@as(i32, 12), value.bounds.bottom);
    try std.testing.expectEqual(@as(i32, -1), value.destination.x);
    try std.testing.expectEqual(@as(i32, 2), value.destination.y);
    try std.testing.expectEqual(@as(i32, -3), value.source.x);
    try std.testing.expectEqual(@as(i32, 4), value.source.y);
    try std.testing.expectEqual(@as(i32, -5), value.source_size.width);
    try std.testing.expectEqual(@as(i32, 6), value.source_size.height);
    try std.testing.expectEqual(dib_colors.Usage.palette_indices, value.source_usage);
    try std.testing.expectEqual(@as(u32, 1), value.start_scan);
    try std.testing.expectEqual(@as(u32, 2), value.scan_count);
    try std.testing.expectEqual(@as(u32, 3), value.scanlines.end);
    try std.testing.expectEqual(@as(usize, 4), value.bitmap.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 4), value.bitmap.between_bmi_and_bits.len);
    try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);

    var info_bytes = [_]u8{0} ** 128;
    @memcpy(info_bytes[0..76], bytes[0..76]);
    std.mem.writeInt(u32, info_bytes[48..52], 80, .little);
    std.mem.writeInt(u32, info_bytes[52..56], 40, .little);
    std.mem.writeInt(u32, info_bytes[56..60], 120, .little);
    std.mem.writeInt(u32, info_bytes[60..64], 8, .little);
    std.mem.writeInt(u32, info_bytes[80..84], 40, .little);
    std.mem.writeInt(i32, info_bytes[84..88], 2, .little);
    std.mem.writeInt(i32, info_bytes[88..92], 4, .little);
    std.mem.writeInt(u16, info_bytes[92..94], 1, .little);
    std.mem.writeInt(u16, info_bytes[94..96], 1, .little);
    std.mem.writeInt(u32, info_bytes[100..104], 16, .little);
    try std.testing.expectEqual(@as(u32, 4), (try parse(fixture(.setdibitstodevice, &info_bytes))).?.bitmap.dib.header.height);

    var extended: [108]u8 = undefined;
    @memcpy(extended[0..104], &bytes);
    extended[104..].* = .{ 9, 8, 7, 6 };
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try parse(fixture(.setdibitstodevice, &extended))).?.trailing_data);
}

test "SETDIBITSTODEVICE rejects every cut malformed source and unrelated records" {
    try std.testing.expectEqual(@as(usize, 76), fixed_size);
    const bytes = validRecord();
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfSetDibitsToDeviceSize, parse(fixture(.setdibitstodevice, bytes[0..cut])));
    for (fixed_size..bytes.len) |cut| try expectParseError(fixture(.setdibitstodevice, bytes[0..cut]));
    var mismatch = fixture(.setdibitstodevice, &bytes);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfSetDibitsToDeviceSize, parse(mismatch));
    var missing = bytes;
    @memset(missing[48..64], 0);
    try std.testing.expectError(error.MissingEmfSetDibitsToDeviceSourceBitmap, parse(fixture(.setdibitstodevice, &missing)));
    var incomplete = bytes;
    @memset(incomplete[60..64], 0);
    try std.testing.expectError(error.IncompleteEmfBitmapSource, parse(fixture(.setdibitstodevice, &incomplete)));
    var bad_usage = bytes;
    std.mem.writeInt(u32, bad_usage[64..68], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, parse(fixture(.setdibitstodevice, &bad_usage)));
    var bad_scan = bytes;
    std.mem.writeInt(u32, bad_scan[68..72], 3, .little);
    try std.testing.expectError(error.InvalidEmfScanlineRange, parse(fixture(.setdibitstodevice, &bad_scan)));
    std.mem.writeInt(u32, bad_scan[68..72], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfScanlineRange, parse(fixture(.setdibitstodevice, &bad_scan)));
    try std.testing.expect((try parse(fixture(.stretchdibits, bytes[0..fixed_size]))) == null);
}
