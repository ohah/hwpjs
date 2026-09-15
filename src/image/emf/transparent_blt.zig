const std = @import("std");
const bitmap_source_transfer = @import("bitmap_source_transfer.zig");
const color_ref = @import("../wmf/color_ref.zig");
const dib_colors = @import("dib_colors.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const fixed_size = bitmap_source_transfer.byte_size;
pub const TransparentBlt = struct {
    core: bitmap_source_transfer.Core,
    transparent_color: color_ref.ColorRef,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?TransparentBlt {
    if (record.kind != .transparentblt) return null;
    const end = record_extent.requiredEnd(record, fixed_size) orelse return error.InvalidEmfTransparentBltSize;
    const core = bitmap_source_transfer.parse(record.bytes, end) catch |err| switch (err) {
        error.MissingEmfBitmapSourceTransferBitmap => return error.MissingEmfTransparentBltSourceBitmap,
        else => return err,
    };
    return .{
        .core = core,
        .transparent_color = try color_ref.parse(&core.operation_bytes, .specified_zero),
        .trailing_data = record.bytes[core.semanticEnd()..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn sourceRecord() [136]u8 {
    var bytes = [_]u8{0} ** 136;
    std.mem.writeInt(u32, bytes[80..84], @intFromEnum(dib_colors.Usage.palette_indices), .little);
    std.mem.writeInt(u32, bytes[84..88], 108, .little);
    std.mem.writeInt(u32, bytes[88..92], 12, .little);
    std.mem.writeInt(u32, bytes[92..96], 128, .little);
    std.mem.writeInt(u32, bytes[96..100], 8, .little);
    std.mem.writeInt(u32, bytes[108..112], 12, .little);
    std.mem.writeInt(u16, bytes[112..114], 2, .little);
    std.mem.writeInt(u16, bytes[114..116], 2, .little);
    std.mem.writeInt(u16, bytes[116..118], 1, .little);
    std.mem.writeInt(u16, bytes[118..120], 1, .little);
    return bytes;
}

fn sourceInfo32Record() [164]u8 {
    var bytes = [_]u8{0} ** 164;
    std.mem.writeInt(u32, bytes[84..88], 108, .little);
    std.mem.writeInt(u32, bytes[88..92], 40, .little);
    std.mem.writeInt(u32, bytes[92..96], 148, .little);
    std.mem.writeInt(u32, bytes[96..100], 16, .little);
    std.mem.writeInt(u32, bytes[108..112], 40, .little);
    std.mem.writeInt(i32, bytes[112..116], 2, .little);
    std.mem.writeInt(i32, bytes[116..120], 2, .little);
    std.mem.writeInt(u16, bytes[120..122], 1, .little);
    std.mem.writeInt(u16, bytes[122..124], 32, .little);
    return bytes;
}

fn expectParseError(record: records.Record) !void {
    if (parse(record)) |_| return error.ExpectedEmfTransparentBltParseError else |_| return;
}

test "TRANSPARENTBLT parses shared transfer fields color key and undefined spaces" {
    var bytes = sourceRecord();
    for ([_]i32{ -9, 10, -11, 12 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    for ([_]i32{ -1, 2, -3, 0 }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[24 + index * 4 ..][0..4], value, .little);
    bytes[40..44].* = .{ 10, 20, 30, 0 };
    std.mem.writeInt(i32, bytes[44..48], -5, .little);
    std.mem.writeInt(i32, bytes[48..52], 6, .little);
    std.mem.writeInt(u32, bytes[52..56], 0x3f800000, .little);
    bytes[76..80].* = .{ 1, 2, 3, 0 };
    std.mem.writeInt(i32, bytes[100..104], 0, .little);
    std.mem.writeInt(i32, bytes[104..108], -8, .little);
    const value = (try parse(fixture(.transparentblt, &bytes))).?;
    try std.testing.expectEqual(@as(i32, -9), value.core.bounds.left);
    try std.testing.expectEqual(@as(i32, -1), value.core.destination.x);
    try std.testing.expectEqual(@as(i32, -3), value.core.destination_size.width);
    try std.testing.expectEqual(@as(i32, -5), value.core.source.x);
    try std.testing.expectEqual(@as(i32, 0), value.core.source_size.width);
    try std.testing.expectEqual(@as(i32, -8), value.core.source_size.height);
    try std.testing.expectEqual(@as(u32, 0x3f800000), value.core.source_transform.m11.bits);
    try std.testing.expectEqual(@as(u8, 3), value.core.source_background.blue);
    try std.testing.expectEqual(@as(u8, 10), value.transparent_color.red);
    try std.testing.expectEqual(@as(u8, 20), value.transparent_color.green);
    try std.testing.expectEqual(@as(u8, 30), value.transparent_color.blue);
    try std.testing.expectEqual(@as(usize, 8), value.core.bitmap.between_bmi_and_bits.len);
    try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);

    const info32 = sourceInfo32Record();
    try std.testing.expectEqual(@as(u16, 32), (try parse(fixture(.transparentblt, &info32))).?.core.bitmap.dib.header.bit_count);

    var extended: [140]u8 = undefined;
    @memcpy(extended[0..136], &bytes);
    extended[136..].* = .{ 9, 8, 7, 6 };
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try parse(fixture(.transparentblt, &extended))).?.trailing_data);
}

test "TRANSPARENTBLT requires source and validates every fixed and bitmap boundary" {
    try std.testing.expectEqual(@as(usize, 108), fixed_size);
    const missing = [_]u8{0} ** fixed_size;
    try std.testing.expectError(error.MissingEmfTransparentBltSourceBitmap, parse(fixture(.transparentblt, &missing)));
    for (0..fixed_size) |cut| try std.testing.expectError(error.InvalidEmfTransparentBltSize, parse(fixture(.transparentblt, missing[0..cut])));
    var mismatch = fixture(.transparentblt, &missing);
    mismatch.size += 4;
    try std.testing.expectError(error.InvalidEmfTransparentBltSize, parse(mismatch));

    const source = sourceRecord();
    for (fixed_size..source.len) |cut| try expectParseError(fixture(.transparentblt, source[0..cut]));
    var incomplete = source;
    @memset(incomplete[96..100], 0);
    try std.testing.expectError(error.IncompleteEmfBitmapSource, parse(fixture(.transparentblt, &incomplete)));
    var before_fixed = source;
    std.mem.writeInt(u32, before_fixed[84..88], 104, .little);
    try std.testing.expectError(error.InvalidEmfBitmapSourceExtent, parse(fixture(.transparentblt, &before_fixed)));
    var bad_key = source;
    bad_key[43] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.transparentblt, &bad_key)));
    var bad_background = source;
    bad_background[79] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.transparentblt, &bad_background)));
    var bad_usage = source;
    std.mem.writeInt(u32, bad_usage[80..84], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, parse(fixture(.transparentblt, &bad_usage)));
    try std.testing.expect((try parse(fixture(.alphablend, source[0..fixed_size]))) == null);
}
