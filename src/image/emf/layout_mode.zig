const std = @import("std");
const records = @import("records.zig");

pub const record_size = 12;
pub const right_to_left_flag: u32 = 0x00000001;
pub const bitmap_orientation_preserved_flag: u32 = 0x00000008;
pub const defined_flags = right_to_left_flag | bitmap_orientation_preserved_flag;

pub const Layout = struct {
    raw: u32,
    right_to_left: bool,
    bitmap_orientation_preserved: bool,
};

pub fn parse(record: records.Record) !?Layout {
    if (record.kind != .setlayout) return null;
    if (record.size != record_size or record.bytes.len != record_size) return error.InvalidEmfSetLayoutRecordSize;
    const raw = std.mem.readInt(u32, record.bytes[8..12], .little);
    if ((raw & ~defined_flags) != 0) return error.InvalidEmfLayoutMode;
    return .{
        .raw = raw,
        .right_to_left = (raw & right_to_left_flag) != 0,
        .bitmap_orientation_preserved = (raw & bitmap_orientation_preserved_flag) != 0,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn bytesFor(raw: u32) [record_size]u8 {
    var bytes = [_]u8{0} ** record_size;
    std.mem.writeInt(u32, bytes[8..12], raw, .little);
    return bytes;
}

test "SETLAYOUT accepts every defined flag combination" {
    for ([_]u32{ 0x0, 0x1, 0x8, 0x9 }) |raw| {
        const value = (try parse(fixture(.setlayout, &bytesFor(raw)))).?;
        try std.testing.expectEqual(raw, value.raw);
        try std.testing.expectEqual((raw & right_to_left_flag) != 0, value.right_to_left);
        try std.testing.expectEqual((raw & bitmap_orientation_preserved_flag) != 0, value.bitmap_orientation_preserved);
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

test "SETLAYOUT requires exact size and ignores unrelated records" {
    const short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(fixture(.setlayout, &short)));
    var declared_twelve = fixture(.setlayout, &short);
    declared_twelve.size = record_size;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(declared_twelve));
    const long = [_]u8{0} ** 16;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(fixture(.setlayout, &long)));
    var declared_twelve_long = fixture(.setlayout, &long);
    declared_twelve_long.size = record_size;
    try std.testing.expectError(error.InvalidEmfSetLayoutRecordSize, parse(declared_twelve_long));
    try std.testing.expect((try parse(fixture(.savedc, &short))) == null);
}
