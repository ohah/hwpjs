const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const minimum_size = 12;
pub const right_to_left_flag: u32 = 0x00000001;
pub const bitmap_orientation_preserved_flag: u32 = 0x00000008;
pub const defined_flags = right_to_left_flag | bitmap_orientation_preserved_flag;

pub const Layout = struct {
    raw: u32,
    right_to_left: bool,
    bitmap_orientation_preserved: bool,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?Layout {
    if (record.kind != .setlayout) return null;
    const required_end = record_extent.requiredEnd(record, minimum_size) orelse
        return error.InvalidEmfSetLayoutRecordSize;
    const raw = std.mem.readInt(u32, record.bytes[8..12], .little);
    if ((raw & ~defined_flags) != 0) return error.InvalidEmfLayoutMode;
    return .{
        .raw = raw,
        .right_to_left = (raw & right_to_left_flag) != 0,
        .bitmap_orientation_preserved = (raw & bitmap_orientation_preserved_flag) != 0,
        .trailing_data = record.bytes[required_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn bytesFor(raw: u32) [minimum_size]u8 {
    var bytes = [_]u8{0} ** minimum_size;
    std.mem.writeInt(u32, bytes[8..12], raw, .little);
    return bytes;
}

test "SETLAYOUT accepts every defined flag combination" {
    for ([_]u32{ 0x0, 0x1, 0x8, 0x9 }) |raw| {
        const value = (try parse(fixture(.setlayout, &bytesFor(raw)))) orelse return error.TestExpectedEqual;
        try std.testing.expectEqual(raw, value.raw);
        try std.testing.expectEqual((raw & right_to_left_flag) != 0, value.right_to_left);
        try std.testing.expectEqual((raw & bitmap_orientation_preserved_flag) != 0, value.bitmap_orientation_preserved);
        try std.testing.expectEqual(@as(usize, 0), value.trailing_data.len);
    }
}

test "SETLAYOUT rejects every undefined single bit and composite" {
    var bit: usize = 0;
    while (bit < 32) : (bit += 1) {
        const raw = @as(u32, 1) << @intCast(bit);
        if (raw == 0x1 or raw == 0x8) continue;
        try std.testing.expectError(error.InvalidEmfLayoutMode, parse(fixture(.setlayout, &bytesFor(raw))));
    }
    try std.testing.expectError(error.InvalidEmfLayoutMode, parse(fixture(.setlayout, &bytesFor(std.math.maxInt(u32)))));
}

test "SETLAYOUT requires its prefix, preserves extensions, and ignores unrelated records" {
    const short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(fixture(.setlayout, &short)));
    var declared_twelve = fixture(.setlayout, &short);
    declared_twelve.size = minimum_size;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(declared_twelve));
    var long = [_]u8{0} ** 16;
    long[12..16].* = .{ 0xde, 0xad, 0xbe, 0xef };
    const extended = (try parse(fixture(.setlayout, &long))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(@as(u32, 0), extended.raw);
    try std.testing.expectEqualSlices(u8, long[12..16], extended.trailing_data);
    var declared_twelve_long = fixture(.setlayout, &long);
    declared_twelve_long.size = minimum_size;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(declared_twelve_long));
    try std.testing.expect((try parse(fixture(.savedc, &short))) == null);
}
