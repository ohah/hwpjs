const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const Limit = struct {
    raw: u32,

    pub fn unsignedValue(self: Limit) u32 {
        return self.raw;
    }

    pub fn floatValue(self: Limit) f32 {
        return @bitCast(self.raw);
    }
};

pub fn parse(record: records.Record) !?Limit {
    if (record.kind != .setmiterlimit) return null;
    if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfMiterLimitRecordSize;
    return .{ .raw = std.mem.readInt(u32, record.bytes[8..12], .little) };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "miter limit preserves unsigned and FLOAT interpretations without normalization" {
    for ([_]u32{ 0, 1, 0x3fc00000, 0x7f800000, 0x7fc01234, std.math.maxInt(u32) }) |raw| {
        var bytes = [_]u8{0} ** 12;
        std.mem.writeInt(u32, bytes[8..12], raw, .little);
        const limit = (try parse(fixture(.setmiterlimit, &bytes))).?;
        try std.testing.expectEqual(raw, limit.raw);
        try std.testing.expectEqual(raw, limit.unsignedValue());
        try std.testing.expectEqual(raw, @as(u32, @bitCast(limit.floatValue())));
    }
}

test "miter limit requires its prefix accepts trailing data and does not claim unrelated records" {
    var short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfMiterLimitRecordSize, parse(fixture(.setmiterlimit, &short)));
    var declared_twelve = fixture(.setmiterlimit, &short);
    declared_twelve.size = 12;
    try std.testing.expectError(error.InvalidEmfMiterLimitRecordSize, parse(declared_twelve));
    var long = [_]u8{0} ** 16;
    try std.testing.expectEqual(@as(u32, 0), (try parse(fixture(.setmiterlimit, &long))).?.raw);
    var declared_twelve_long = fixture(.setmiterlimit, &long);
    declared_twelve_long.size = 12;
    try std.testing.expectError(error.InvalidEmfMiterLimitRecordSize, parse(declared_twelve_long));
    try std.testing.expect((try parse(fixture(.savedc, short[0..8]))) == null);
}
