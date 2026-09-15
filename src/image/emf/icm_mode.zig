const std = @import("std");
const records = @import("records.zig");

pub const record_size = 12;

pub const Mode = enum(u32) {
    off = 0x00000001,
    on = 0x00000002,
    query = 0x00000003,
    done_outside_dc = 0x00000004,
};

pub fn parse(record: records.Record) !?Mode {
    if (record.kind != .seticmmode) return null;
    if (record.size != record.bytes.len or record.bytes.len != record_size)
        return error.InvalidEmfSetIcmModeRecordSize;
    return std.enums.fromInt(Mode, std.mem.readInt(u32, record.bytes[8..12], .little)) orelse
        error.InvalidEmfIcmMode;
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "SETICMMODE accepts every exact enumeration value" {
    const expected = [_]Mode{ .off, .on, .query, .done_outside_dc };
    for (expected, 1..) |mode, raw| {
        var bytes = [_]u8{0} ** 12;
        std.mem.writeInt(u32, bytes[8..12], @intCast(raw), .little);
        const parsed = (try parse(fixture(.seticmmode, &bytes))) orelse return error.TestExpectedEqual;
        try std.testing.expectEqual(mode, parsed);
    }
}

test "SETICMMODE rejects all extent and value drift and ignores unrelated records" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    for (0..12) |cut|
        try std.testing.expectError(error.InvalidEmfSetIcmModeRecordSize, parse(fixture(.seticmmode, bytes[0..cut])));
    try std.testing.expectError(error.InvalidEmfSetIcmModeRecordSize, parse(fixture(.seticmmode, &bytes)));

    var declared_short = fixture(.seticmmode, bytes[0..12]);
    declared_short.size = 8;
    try std.testing.expectError(error.InvalidEmfSetIcmModeRecordSize, parse(declared_short));
    var declared_long = fixture(.seticmmode, bytes[0..12]);
    declared_long.size = 16;
    try std.testing.expectError(error.InvalidEmfSetIcmModeRecordSize, parse(declared_long));

    for ([_]u32{ 0, 5, std.math.maxInt(u32) }) |raw| {
        std.mem.writeInt(u32, bytes[8..12], raw, .little);
        try std.testing.expectError(error.InvalidEmfIcmMode, parse(fixture(.seticmmode, bytes[0..12])));
    }
    try std.testing.expect((try parse(fixture(.setmapmode, bytes[0..12]))) == null);
}
