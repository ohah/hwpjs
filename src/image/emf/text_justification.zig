const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const Justification = struct {
    break_extra: i32,
    break_count: i32,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?Justification {
    if (record.kind != .settextjustification) return null;
    const end = record_extent.requiredEnd(record, 16) orelse return error.InvalidEmfTextJustificationRecordSize;
    return .{
        .break_extra = std.mem.readInt(i32, record.bytes[8..12], .little),
        .break_count = std.mem.readInt(i32, record.bytes[12..16], .little),
        .trailing_data = record.bytes[end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "text justification preserves signed fields in wire order" {
    const pairs = [_][2]i32{
        .{ 0, 0 },
        .{ -1, 1 },
        .{ std.math.minInt(i32), std.math.maxInt(i32) },
        .{ std.math.maxInt(i32), std.math.minInt(i32) },
    };
    for (pairs) |pair| {
        var bytes = [_]u8{0} ** 16;
        std.mem.writeInt(i32, bytes[8..12], pair[0], .little);
        std.mem.writeInt(i32, bytes[12..16], pair[1], .little);
        const value = (try parse(fixture(.settextjustification, &bytes))).?;
        try std.testing.expectEqual(pair[0], value.break_extra);
        try std.testing.expectEqual(pair[1], value.break_count);
    }
}

test "text justification requires every prefix byte preserves trailing data and ignores unrelated records" {
    var prefix = [_]u8{0} ** 16;
    for (0..prefix.len) |cut|
        try std.testing.expectError(error.InvalidEmfTextJustificationRecordSize, parse(fixture(.settextjustification, prefix[0..cut])));
    var declared_sixteen = fixture(.settextjustification, prefix[0..12]);
    declared_sixteen.size = 16;
    try std.testing.expectError(error.InvalidEmfTextJustificationRecordSize, parse(declared_sixteen));
    var long = [_]u8{0} ** 20;
    long[16..20].* = .{ 1, 2, 3, 4 };
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, (try parse(fixture(.settextjustification, &long))).?.trailing_data);
    var declared_sixteen_long = fixture(.settextjustification, &long);
    declared_sixteen_long.size = 16;
    try std.testing.expectError(error.InvalidEmfTextJustificationRecordSize, parse(declared_sixteen_long));
    try std.testing.expect((try parse(fixture(.savedc, prefix[0..8]))) == null);
}
