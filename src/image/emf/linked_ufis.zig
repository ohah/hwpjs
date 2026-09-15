const std = @import("std");
const records = @import("records.zig");
const universal_font_id = @import("universal_font_id.zig");

pub const fixed_prefix_size = 12;
pub const reserved_size = 8;
pub const minimum_size = fixed_prefix_size + reserved_size;

pub const LinkedUfis = struct {
    count: u32,
    items_bytes: []const u8,
    reserved: *const [reserved_size]u8,

    pub fn item(self: LinkedUfis, index: u32) !universal_font_id.UniversalFontId {
        if (index >= self.count) return error.EmfLinkedUfiIndexOutOfBounds;
        const start = std.math.mul(usize, index, universal_font_id.byte_size) catch return error.EmfLinkedUfiIndexOutOfBounds;
        const end = std.math.add(usize, start, universal_font_id.byte_size) catch return error.EmfLinkedUfiIndexOutOfBounds;
        if (end > self.items_bytes.len) return error.EmfLinkedUfiIndexOutOfBounds;
        return universal_font_id.parse(self.items_bytes[start..end]);
    }
};

pub fn parse(record: records.Record) !?LinkedUfis {
    if (record.kind != .setlinkedufis) return null;
    if (record.size != record.bytes.len or record.bytes.len < minimum_size) return error.InvalidEmfSetLinkedUfisRecordSize;
    const count = std.mem.readInt(u32, record.bytes[8..12], .little);
    const expected_size = @as(u64, minimum_size) + @as(u64, count) * universal_font_id.byte_size;
    if (expected_size != record.bytes.len) return error.InvalidEmfSetLinkedUfisRecordSize;
    const items_end: usize = @intCast(expected_size - reserved_size);
    return .{
        .count = count,
        .items_bytes = record.bytes[fixed_prefix_size..items_end],
        .reserved = record.bytes[items_end..][0..reserved_size],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "SETLINKEDUFIS parses empty and populated arrays and ignores reserved bytes" {
    var empty = [_]u8{0} ** minimum_size;
    empty[12..20].* = .{ 1, 2, 3, 4, 5, 6, 7, 8 };
    const zero = (try parse(fixture(.setlinkedufis, &empty))).?;
    try std.testing.expectEqual(@as(u32, 0), zero.count);
    try std.testing.expectEqual(@as(usize, 0), zero.items_bytes.len);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4, 5, 6, 7, 8 }, zero.reserved);
    try std.testing.expectError(error.EmfLinkedUfiIndexOutOfBounds, zero.item(0));

    var bytes = [_]u8{0} ** 36;
    std.mem.writeInt(u32, bytes[8..12], 2, .little);
    std.mem.writeInt(u32, bytes[12..16], 1, .little);
    std.mem.writeInt(u32, bytes[16..20], 0x11223344, .little);
    std.mem.writeInt(u32, bytes[20..24], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[24..28], 0x55667788, .little);
    bytes[28..36].* = .{ 9, 8, 7, 6, 5, 4, 3, 2 };
    const value = (try parse(fixture(.setlinkedufis, &bytes))).?;
    try std.testing.expectEqual(@as(u32, 2), value.count);
    try std.testing.expectEqual(@as(usize, 16), value.items_bytes.len);
    try std.testing.expectEqual(@as(u32, 1), (try value.item(0)).checksum);
    try std.testing.expectEqual(@as(u32, 0x11223344), (try value.item(0)).index);
    try std.testing.expectEqual(std.math.maxInt(u32), (try value.item(1)).checksum);
    try std.testing.expectEqual(@as(u32, 0x55667788), (try value.item(1)).index);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6, 5, 4, 3, 2 }, value.reserved);
    try std.testing.expectError(error.EmfLinkedUfiIndexOutOfBounds, value.item(2));
    const forged: LinkedUfis = .{ .count = std.math.maxInt(u32), .items_bytes = bytes[12..13], .reserved = bytes[28..36] };
    try std.testing.expectError(error.EmfLinkedUfiIndexOutOfBounds, forged.item(0));
    try std.testing.expectError(error.EmfLinkedUfiIndexOutOfBounds, forged.item(std.math.maxInt(u32) - 1));
    const forged_extra: LinkedUfis = .{ .count = 1, .items_bytes = bytes[12..28], .reserved = bytes[28..36] };
    try std.testing.expectError(error.EmfLinkedUfiIndexOutOfBounds, forged_extra.item(1));
}

test "SETLINKEDUFIS validates count-derived exact size every cut and record identity" {
    var bytes = [_]u8{0} ** 36;
    std.mem.writeInt(u32, bytes[8..12], 2, .little);
    for (0..minimum_size) |cut| try std.testing.expectError(error.InvalidEmfSetLinkedUfisRecordSize, parse(fixture(.setlinkedufis, bytes[0..cut])));
    for (minimum_size..bytes.len) |cut| try std.testing.expectError(error.InvalidEmfSetLinkedUfisRecordSize, parse(fixture(.setlinkedufis, bytes[0..cut])));
    var mismatch = fixture(.setlinkedufis, &bytes);
    mismatch.size -= 4;
    try std.testing.expectError(error.InvalidEmfSetLinkedUfisRecordSize, parse(mismatch));
    var too_small = bytes;
    std.mem.writeInt(u32, too_small[8..12], 1, .little);
    try std.testing.expectError(error.InvalidEmfSetLinkedUfisRecordSize, parse(fixture(.setlinkedufis, &too_small)));
    var huge = bytes;
    std.mem.writeInt(u32, huge[8..12], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfSetLinkedUfisRecordSize, parse(fixture(.setlinkedufis, &huge)));
    try std.testing.expect((try parse(fixture(.setlayout, bytes[0..20]))) == null);
}
