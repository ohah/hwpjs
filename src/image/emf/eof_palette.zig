const std = @import("std");
const records = @import("records.zig");
const eof = @import("eof.zig");
const log_palette_entry = @import("log_palette_entry.zig");

pub const Entry = log_palette_entry.Entry;
pub const Palette = struct {
    undefined_before: []const u8,
    entry_bytes: []const u8,
    undefined_after: []const u8,
    count: usize,

    pub fn entry(self: Palette, index: usize) !Entry {
        if (index >= self.count) return error.EmfPaletteIndexOutOfBounds;
        return log_palette_entry.parse(self.entry_bytes[index * 4 ..][0..4]);
    }
};
pub const Parsed = struct { eof: eof.Eof, palette: Palette };

pub fn parse(record: records.Record) !Parsed {
    const value = try eof.parse(record);
    return .{ .eof = value, .palette = try parseLayout(record, value) };
}

fn parseLayout(record: records.Record, value: eof.Eof) !Palette {
    const content_end = record.bytes.len - 4;
    if (value.palette_entries == 0) return .{
        .undefined_before = record.bytes[16..content_end],
        .entry_bytes = &.{},
        .undefined_after = &.{},
        .count = 0,
    };
    if (value.palette_offset < 16) return error.InvalidEmfPaletteOffset;
    const offset: usize = value.palette_offset;
    if (offset > content_end) return error.InvalidEmfPaletteOffset;
    const byte_count = @as(u64, value.palette_entries) * 4;
    if (byte_count > std.math.maxInt(usize)) return error.InvalidEmfPaletteRange;
    const count: usize = @intCast(byte_count);
    if (count > content_end - offset) return error.InvalidEmfPaletteRange;
    const end = offset + count;
    return .{
        .undefined_before = record.bytes[16..offset],
        .entry_bytes = record.bytes[offset..end],
        .undefined_after = record.bytes[end..content_end],
        .count = value.palette_entries,
    };
}

fn fixture(bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = .eof, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "EOF palette keeps exact entries between both undefined regions" {
    var bytes = [_]u8{0} ** 36;
    std.mem.writeInt(u32, bytes[8..12], 2, .little);
    std.mem.writeInt(u32, bytes[12..16], 20, .little);
    bytes[16..20].* = .{ 9, 8, 7, 6 };
    bytes[20..28].* = .{ 5, 10, 20, 30, 6, 40, 50, 60 };
    bytes[28..32].* = .{ 1, 2, 3, 4 };
    std.mem.writeInt(u32, bytes[32..36], bytes.len, .little);
    const palette = (try parse(fixture(&bytes))).palette;
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, palette.undefined_before);
    try std.testing.expectEqual(@as(usize, 8), palette.entry_bytes.len);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, palette.undefined_after);
    try std.testing.expectEqual(@as(u8, 40), (try palette.entry(1)).blue);
    try std.testing.expectError(error.EmfPaletteIndexOutOfBounds, palette.entry(2));
}

test "EOF palette ignores offset when count is zero and rejects every referenced range error" {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[12..16], 0xffffffff, .little);
    std.mem.writeInt(u32, bytes[20..24], bytes.len, .little);
    const absent = (try parse(fixture(&bytes))).palette;
    try std.testing.expectEqual(@as(usize, 4), absent.undefined_before.len);
    try std.testing.expectEqual(@as(usize, 0), absent.entry_bytes.len);

    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[12..16], 15, .little);
    try std.testing.expectError(error.InvalidEmfPaletteOffset, parse(fixture(&bytes)));
    std.mem.writeInt(u32, bytes[12..16], 21, .little);
    try std.testing.expectError(error.InvalidEmfPaletteOffset, parse(fixture(&bytes)));
    std.mem.writeInt(u32, bytes[12..16], 20, .little);
    try std.testing.expectError(error.InvalidEmfPaletteRange, parse(fixture(&bytes)));
    std.mem.writeInt(u32, bytes[8..12], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[12..16], 16, .little);
    try std.testing.expectError(error.InvalidEmfPaletteRange, parse(fixture(&bytes)));

    try std.testing.expectError(error.InvalidEmfEofSize, parse(fixture(bytes[0..8])));
}
