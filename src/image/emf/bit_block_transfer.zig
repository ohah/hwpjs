const std = @import("std");
const bitmap_source = @import("bitmap_source.zig");
const color_ref = @import("../wmf/color_ref.zig");
const dib_colors = @import("dib_colors.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const ternary = @import("ternary_raster_operation.zig");
const xform = @import("xform.zig");

pub const fixed_size = 100;
pub const BitBlt = struct {
    bounds: geometry.RectL,
    destination: geometry.PointL,
    destination_size: geometry.SizeL,
    raster_operation: ternary.Operation,
    source: geometry.PointL,
    source_transform: xform.XForm,
    source_background: color_ref.ColorRef,
    source_usage: dib_colors.Usage,
    bitmap: ?bitmap_source.Source,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?BitBlt {
    if (record.kind != .bitblt) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfBitBltSize;
    const operation = try ternary.parse(std.mem.readInt(u32, record.bytes[40..44], .little));
    const usage = try dib_colors.parse(std.mem.readInt(u32, record.bytes[80..84], .little));
    const bitmap = try bitmap_source.parse(record.bytes, end, .{
        .bmi_offset = std.mem.readInt(u32, record.bytes[84..88], .little),
        .bmi_size = std.mem.readInt(u32, record.bytes[88..92], .little),
        .bits_offset = std.mem.readInt(u32, record.bytes[92..96], .little),
        .bits_size = std.mem.readInt(u32, record.bytes[96..100], .little),
    }, usage);
    if (operation.requiresSource() and bitmap == null) return error.MissingEmfBitBltSourceBitmap;
    const semantic_end = if (bitmap) |value| value.semantic_end else end;
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .destination = try geometry.parsePointL(record.bytes[24..32]),
        .destination_size = try geometry.parseSizeL(record.bytes[32..40]),
        .raster_operation = operation,
        .source = try geometry.parsePointL(record.bytes[44..52]),
        .source_transform = try xform.parse(record.bytes[52..76]),
        .source_background = try color_ref.parse(record.bytes[76..80], .specified_zero),
        .source_usage = usage,
        .bitmap = bitmap,
        .trailing_data = record.bytes[semantic_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn sourceRecord() [132]u8 {
    var bytes = [_]u8{0} ** 132;
    std.mem.writeInt(u32, bytes[40..44], 0x00cc0020, .little);
    std.mem.writeInt(u32, bytes[84..88], 104, .little);
    std.mem.writeInt(u32, bytes[88..92], 18, .little);
    std.mem.writeInt(u32, bytes[92..96], 124, .little);
    std.mem.writeInt(u32, bytes[96..100], 8, .little);
    std.mem.writeInt(u32, bytes[104..108], 12, .little);
    std.mem.writeInt(u16, bytes[108..110], 2, .little);
    std.mem.writeInt(u16, bytes[110..112], 2, .little);
    std.mem.writeInt(u16, bytes[112..114], 1, .little);
    std.mem.writeInt(u16, bytes[114..116], 1, .little);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfBitBltParseError else |_| return;
}

test "BITBLT parses fixed fields and non-contiguous source bitmap" {
    var bytes = sourceRecord();
    std.mem.writeInt(i32, bytes[8..12], -9, .little);
    std.mem.writeInt(i32, bytes[24..28], -3, .little);
    std.mem.writeInt(i32, bytes[32..36], -5, .little);
    std.mem.writeInt(i32, bytes[44..48], 7, .little);
    std.mem.writeInt(u32, bytes[52..56], 0x7fc01234, .little);
    bytes[76..80].* = .{ 1, 2, 3, 0 };
    const value = (try parse(fixture(.bitblt, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -9), value.bounds.left);
    try std.testing.expectEqual(@as(i32, -3), value.destination.x);
    try std.testing.expectEqual(@as(i32, -5), value.destination_size.width);
    try std.testing.expectEqual(@as(i32, 7), value.source.x);
    try std.testing.expectEqual(@as(u32, 0x7fc01234), value.source_transform.m11.bits);
    try std.testing.expectEqual(@as(u8, 3), value.source_background.blue);
    try std.testing.expectEqual(@as(usize, 4), value.bitmap.?.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 2), value.bitmap.?.between_bmi_and_bits.len);
    try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);

    var extended: [136]u8 = undefined;
    @memcpy(extended[0..132], &bytes);
    extended[132..].* = .{ 9, 8, 7, 6 };
    const with_extra = (try parse(fixture(.bitblt, &extended))).?;
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, with_extra.trailing_data);
}

test "BITBLT omission follows raster truth table and all boundaries are checked" {
    var bytes = [_]u8{0} ** fixed_size;
    std.mem.writeInt(u32, bytes[40..44], 0x00f00021, .little); // PATCOPY ignores source.
    try std.testing.expect((try parse(fixture(.bitblt, &bytes))).?.bitmap == null);
    std.mem.writeInt(u32, bytes[40..44], 0x00cc0020, .little);
    try std.testing.expectError(error.MissingEmfBitBltSourceBitmap, parse(fixture(.bitblt, &bytes)));
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfBitBltSize, parse(fixture(.bitblt, bytes[0..cut])));
    var mismatch = fixture(.bitblt, &bytes);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfBitBltSize, parse(mismatch));
    var source = sourceRecord();
    for (fixed_size..source.len) |cut| try expectParseError(fixture(.bitblt, source[0..cut]));
    source[79] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.bitblt, &source)));
    source[79] = 0;
    std.mem.writeInt(u32, source[80..84], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, parse(fixture(.bitblt, &source)));
    try std.testing.expect((try parse(fixture(.stretchblt, source[0..fixed_size]))) == null);
}
