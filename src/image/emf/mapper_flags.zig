const std = @import("std");
const records = @import("records.zig");

pub const Flags = enum(u32) {
    unrestricted = 0,
    match_device_aspect_ratio = 1,
};

pub fn parse(record: records.Record) !?Flags {
    if (record.kind != .setmapperflags) return null;
    if (record.size != 12 or record.bytes.len != 12) return error.InvalidEmfMapperFlagsRecordSize;
    const raw = std.mem.readInt(u32, record.bytes[8..12], .little);
    return std.enums.fromInt(Flags, raw) orelse error.InvalidEmfMapperFlags;
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "mapper flags parse both defined values" {
    var bytes = [_]u8{0} ** 12;
    try std.testing.expectEqual(Flags.unrestricted, (try parse(fixture(.setmapperflags, &bytes))).?);
    bytes[8] = 1;
    try std.testing.expectEqual(Flags.match_device_aspect_ratio, (try parse(fixture(.setmapperflags, &bytes))).?);
}

test "mapper flags reject undefined values exact-size drift and unrelated records" {
    var bytes = [_]u8{0} ** 12;
    bytes[8] = 2;
    try std.testing.expectError(error.InvalidEmfMapperFlags, parse(fixture(.setmapperflags, &bytes)));
    bytes[8..12].* = .{ 0xff, 0xff, 0xff, 0xff };
    try std.testing.expectError(error.InvalidEmfMapperFlags, parse(fixture(.setmapperflags, &bytes)));

    var short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfMapperFlagsRecordSize, parse(fixture(.setmapperflags, &short)));
    var declared_twelve = fixture(.setmapperflags, &short);
    declared_twelve.size = 12;
    try std.testing.expectError(error.InvalidEmfMapperFlagsRecordSize, parse(declared_twelve));
    var long = [_]u8{0} ** 16;
    try std.testing.expectError(error.InvalidEmfMapperFlagsRecordSize, parse(fixture(.setmapperflags, &long)));
    try std.testing.expect((try parse(fixture(.savedc, short[0..8]))) == null);
}
