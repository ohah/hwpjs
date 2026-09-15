const std = @import("std");
const bitmap_source = @import("bitmap_source.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const ternary = @import("ternary_raster_operation.zig");

pub const fixed_size = 80;
pub const StretchDibits = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    source: geometry.PointL,
    source_size: geometry.SizeL,
    source_usage: dib_colors.Usage,
    raster_operation: ternary.Operation,
    destination_size: geometry.SizeL,
    bitmap: ?bitmap_source.Source,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?StretchDibits {
    if (record.kind != .stretchdibits) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfStretchDibitsSize;
    const usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[64..68], .little));
    const operation = try ternary.parse(std.mem.readInt(u32, record.bytes[68..72], .little));
    const bitmap = try bitmap_source.parse(record.bytes, end, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[48..52], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[52..56], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[56..60], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[60..64], .little),
    }, usage);
    if (operation.requiresSource() and bitmap == null) return error.MissingEmfStretchDibitsSourceBitmap;
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .destination = try geometry.parsePointL(record.bytes[24..32]),
        .source = try geometry.parsePointL(record.bytes[32..40]),
        .source_size = try geometry.parseSizeL(record.bytes[40..48]),
        .source_usage = usage,
        .raster_operation = operation,
        .destination_size = try geometry.parseSizeL(record.bytes[72..80]),
        .bitmap = bitmap,
        .trailing_data = record.bytes[if (bitmap) |value| value.semantic_end else end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn sourceRecord() [108]u8 {
    var bytes = [_]u8{0} ** 108;
    std.mem.writeInt(u32, bytes[48..52], 84, .little);
    std.mem.writeInt(u32, bytes[52..56], 12, .little);
    std.mem.writeInt(u32, bytes[56..60], 100, .little);
    std.mem.writeInt(u32, bytes[60..64], 8, .little);
    std.mem.writeInt(u32, bytes[64..68], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[68..72], 0x00cc0020, .little);
    std.mem.writeInt(u32, bytes[84..88], 12, .little);
    std.mem.writeInt(u16, bytes[88..90], 2, .little);
    std.mem.writeInt(u16, bytes[90..92], 2, .little);
    std.mem.writeInt(u16, bytes[92..94], 1, .little);
    std.mem.writeInt(u16, bytes[94..96], 1, .little);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfStretchDibitsParseError else |_| return;
}

test "STRETCHDIBITS parses every signed geometry field ROP and undefined spaces" {
    var bytes = sourceRecord();
    for ([_]i32{ -9, 10, -11, 12 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    for ([_]i32{ -1, 2, -3, 4, -5, 6 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[24 + index * 4 ..][0..4], value, .little);
    std.mem.writeInt(i32, bytes[72..76], 7, .little);
    std.mem.writeInt(i32, bytes[76..80], -8, .little);
    const value = (try parse(fixture(.stretchdibits, &bytes))).?;
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
    try std.testing.expectEqual(@as(i32, 7), value.destination_size.width);
    try std.testing.expectEqual(@as(i32, -8), value.destination_size.height);
    try std.testing.expectEqual(dib_colors.Usage.palette_indices, value.source_usage);
    try std.testing.expectEqual(@as(u8, 0xcc), value.raster_operation.index);
    try std.testing.expectEqual(@as(usize, 4), value.bitmap.?.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 4), value.bitmap.?.between_bmi_and_bits.len);
    try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);

    var extended: [112]u8 = undefined;
    @memcpy(extended[0..108], &bytes);
    extended[108..].* = .{ 9, 8, 7, 6 };
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try parse(fixture(.stretchdibits, &extended))).?.trailing_data);
}

test "STRETCHDIBITS enforces ROP source policy every boundary and unrelated type" {
    try std.testing.expectEqual(@as(usize, 80), fixed_size);
    var omitted = [_]u8{0} ** fixed_size;
    std.mem.writeInt(u32, omitted[68..72], 0x00f00021, .little);
    try std.testing.expect((try parse(fixture(.stretchdibits, &omitted))).?.bitmap == null);
    std.mem.writeInt(u32, omitted[68..72], 0x00cc0020, .little);
    try std.testing.expectError(error.MissingEmfStretchDibitsSourceBitmap, parse(fixture(.stretchdibits, &omitted)));
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfStretchDibitsSize, parse(fixture(.stretchdibits, omitted[0..cut])));
    var mismatch = fixture(.stretchdibits, &omitted);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfStretchDibitsSize, parse(mismatch));
    const source = sourceRecord();
    for (fixed_size..source.len) |cut| try expectParseError(fixture(.stretchdibits, source[0..cut]));
    var incomplete = source;
    @memset(incomplete[60..64], 0);
    try std.testing.expectError(error.IncompleteEmfBitmapSource, parse(fixture(.stretchdibits, &incomplete)));
    var before_fixed = source;
    std.mem.writeInt(u32, before_fixed[48..52], 76, .little);
    std.mem.writeInt(u32, before_fixed[56..60], 88, .little);
    @memcpy(before_fixed[76..88], source[84..96]);
    try std.testing.expectError(error.InvalidEmfBitmapSourceExtent, parse(fixture(.stretchdibits, &before_fixed)));
    var bad_usage = source;
    std.mem.writeInt(u32, bad_usage[64..68], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, parse(fixture(.stretchdibits, &bad_usage)));
    var bad_rop = source;
    std.mem.writeInt(u32, bad_rop[68..72], 0x01cc0020, .little);
    try std.testing.expectError(error.InvalidEmfTernaryRasterOperationIndex, parse(fixture(.stretchdibits, &bad_rop)));
    try std.testing.expect((try parse(fixture(.setdibitstodevice, source[0..fixed_size]))) == null);
}
