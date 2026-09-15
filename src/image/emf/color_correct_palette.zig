const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const minimum_size = 24;

pub const ColorCorrectPalette = struct {
    palette_handle: u32,
    first_entry: u32,
    entry_count: u32,
    reserved: u32,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?ColorCorrectPalette {
    if (record.kind != .colorcorrectpalette) return null;
    const required_end = record_extent.requiredEnd(record, minimum_size) orelse
        return error.InvalidEmfColorCorrectPaletteRecordSize;
    return .{
        .palette_handle = std.mem.readInt(u32, record.bytes[8..12], .little),
        .first_entry = std.mem.readInt(u32, record.bytes[12..16], .little),
        .entry_count = std.mem.readInt(u32, record.bytes[16..20], .little),
        .reserved = std.mem.readInt(u32, record.bytes[20..24], .little),
        .trailing_data = record.bytes[required_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "COLORCORRECTPALETTE preserves all fields and record extensions" {
    var bytes = [_]u8{0} ** 28;
    std.mem.writeInt(u32, bytes[8..12], 0x11223344, .little);
    std.mem.writeInt(u32, bytes[12..16], 0x55667788, .little);
    std.mem.writeInt(u32, bytes[16..20], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[20..24], 0x99aabbcc, .little);
    bytes[24..28].* = .{ 0xde, 0xad, 0xbe, 0xef };
    const value = (try parse(fixture(.colorcorrectpalette, &bytes))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(@as(u32, 0x11223344), value.palette_handle);
    try std.testing.expectEqual(@as(u32, 0x55667788), value.first_entry);
    try std.testing.expectEqual(std.math.maxInt(u32), value.entry_count);
    try std.testing.expectEqual(@as(u32, 0x99aabbcc), value.reserved);
    try std.testing.expectEqualSlices(u8, bytes[24..28], value.trailing_data);
}

test "COLORCORRECTPALETTE rejects truncated and mismatched records and dispatches exactly" {
    const bytes = [_]u8{0} ** minimum_size;
    for (0..minimum_size) |cut|
        try std.testing.expectError(error.InvalidEmfColorCorrectPaletteRecordSize, parse(fixture(.colorcorrectpalette, bytes[0..cut])));

    var declared_short = fixture(.colorcorrectpalette, &bytes);
    declared_short.size -= 4;
    try std.testing.expectError(error.InvalidEmfColorCorrectPaletteRecordSize, parse(declared_short));
    var declared_long = fixture(.colorcorrectpalette, &bytes);
    declared_long.size += 4;
    try std.testing.expectError(error.InvalidEmfColorCorrectPaletteRecordSize, parse(declared_long));
    try std.testing.expect((try parse(fixture(.setpaletteentries, &bytes))) == null);
}
