const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const Justification = struct {
    break_extra: i32,
    break_count: i32,
};

pub fn parse(record: records.Record) !?Justification {
    if (record.kind != .settextjustification) return null;
    if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfTextJustificationRecordSize;
    return .{
        .break_extra = std.mem.readInt(i32, record.bytes[8..12], .little),
        .break_count = std.mem.readInt(i32, record.bytes[12..16], .little),
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

test "text justification requires its prefix accepts trailing data and does not claim unrelated records" {
    var short = [_]u8{0} ** 12;
    try std.testing.expectError(error.InvalidEmfTextJustificationRecordSize, parse(fixture(.settextjustification, &short)));
    var declared_sixteen = fixture(.settextjustification, &short);
    declared_sixteen.size = 16;
    try std.testing.expectError(error.InvalidEmfTextJustificationRecordSize, parse(declared_sixteen));
    var long = [_]u8{0} ** 20;
    try std.testing.expect((try parse(fixture(.settextjustification, &long))) != null);
    try std.testing.expect((try parse(fixture(.savedc, short[0..8]))) == null);
}
