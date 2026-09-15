const std = @import("std");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const Eof = struct { palette_entries: u32, palette_offset: u32 };

pub fn parse(record: records.Record) !Eof {
    if (record.kind != .eof) return error.InvalidEmfEofType;
    if (!record_extent.hasRequiredPrefix(record, 20)) return error.InvalidEmfEofSize;
    if (std.mem.readInt(u32, record.bytes[record.bytes.len - 4 ..][0..4], .little) != record.size)
        return error.InvalidEmfEofSizeLast;
    return .{
        .palette_entries = std.mem.readInt(u32, record.bytes[8..12], .little),
        .palette_offset = std.mem.readInt(u32, record.bytes[12..16], .little),
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "EOF requires matching declared and physical size with SizeLast at the end" {
    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u32, bytes[12..16], 16, .little);
    std.mem.writeInt(u32, bytes[16..20], 20, .little);
    const value = try parse(fixture(.eof, &bytes));
    try std.testing.expectEqual(@as(u32, 0), value.palette_entries);
    try std.testing.expectEqual(@as(u32, 16), value.palette_offset);

    for (0..20) |length|
        try std.testing.expectError(error.InvalidEmfEofSize, parse(fixture(.eof, bytes[0..length])));

    var mismatched = fixture(.eof, &bytes);
    mismatched.size = 16;
    std.mem.writeInt(u32, bytes[16..20], 16, .little);
    try std.testing.expectError(error.InvalidEmfEofSize, parse(mismatched));

    const wrong_last = fixture(.eof, &bytes);
    std.mem.writeInt(u32, bytes[16..20], 12, .little);
    try std.testing.expectError(error.InvalidEmfEofSizeLast, parse(wrong_last));
    try std.testing.expectError(error.InvalidEmfEofType, parse(fixture(.savedc, bytes[0..8])));
}

test "EOF permits palette buffer bytes only before the final SizeLast" {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[12..16], 0xffffffff, .little);
    bytes[16..20].* = .{ 1, 2, 3, 4 };
    std.mem.writeInt(u32, bytes[20..24], 24, .little);
    const value = try parse(fixture(.eof, &bytes));
    try std.testing.expectEqual(@as(u32, 0xffffffff), value.palette_offset);
}
