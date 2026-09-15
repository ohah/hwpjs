const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const minimum_size = 12;

pub const Mode = enum(u32) {
    off = 0x00000001,
    on = 0x00000002,
    query = 0x00000003,
    done_outside_dc = 0x00000004,
};

pub const SetIcmMode = struct {
    mode: Mode,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?SetIcmMode {
    if (record.kind != .seticmmode) return null;
    const required_end = record_extent.requiredEnd(record, minimum_size) orelse
        return error.InvalidEmfSetIcmModeRecordSize;
    const mode = std.enums.fromInt(Mode, std.mem.readInt(u32, record.bytes[8..12], .little)) orelse
        return error.InvalidEmfIcmMode;
    return .{ .mode = mode, .trailing_data = record.bytes[required_end..] };
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
        try std.testing.expectEqual(mode, parsed.mode);
        try std.testing.expectEqual(@as(usize, 0), parsed.trailing_data.len);
    }
}

test "SETICMMODE rejects truncated or mismatched extents and ignores unrelated records" {
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    for (0..12) |cut|
        try std.testing.expectError(error.InvalidEmfSetIcmModeRecordSize, parse(fixture(.seticmmode, bytes[0..cut])));

    const extended = (try parse(fixture(.seticmmode, &bytes))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(Mode.off, extended.mode);
    try std.testing.expectEqualSlices(u8, bytes[12..16], extended.trailing_data);

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
