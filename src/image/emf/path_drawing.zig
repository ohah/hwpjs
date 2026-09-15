const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const Path = struct {
    bounds: geometry.RectL,
    trailing_data: []const u8,
};

pub const Value = union(enum) {
    fill: Path,
    stroke_and_fill: Path,
    stroke: Path,
};

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .fillpath => .{ .fill = try parsePath(record) },
        .strokeandfillpath => .{ .stroke_and_fill = try parsePath(record) },
        .strokepath => .{ .stroke = try parsePath(record) },
        else => null,
    };
}

fn parsePath(record: records.Record) !Path {
    const end = record_extent.requiredEnd(record, 24) orelse return error.InvalidEmfPathDrawingSize;
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .trailing_data = record.bytes[end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "path drawing records preserve operation bounds and trailing data" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 28;
    for ([_]i32{ std.math.minInt(i32), -2, 3, std.math.maxInt(i32) }, 0..) |value, index|
        std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    bytes[24..28].* = .{ 9, 8, 7, 6 };

    inline for (.{
        .{ records.RecordType.fillpath, @as(std.meta.Tag(Value), .fill) },
        .{ records.RecordType.strokeandfillpath, @as(std.meta.Tag(Value), .stroke_and_fill) },
        .{ records.RecordType.strokepath, @as(std.meta.Tag(Value), .stroke) },
    }) |case| {
        const value = (try parse(fixture(case[0], &bytes))).?;
        try std.testing.expectEqual(case[1], std.meta.activeTag(value));
        const path = switch (value) {
            inline else => |path| path,
        };
        try std.testing.expectEqual(std.math.minInt(i32), path.bounds.left);
        try std.testing.expectEqual(@as(i32, -2), path.bounds.top);
        try std.testing.expectEqual(@as(i32, 3), path.bounds.right);
        try std.testing.expectEqual(std.math.maxInt(i32), path.bounds.bottom);
        try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, path.trailing_data);
    }
}

test "path drawing records reject every prefix truncation and unrelated types" {
    const std = @import("std");
    const bytes = [_]u8{0} ** 28;
    for ([_]records.RecordType{ .fillpath, .strokeandfillpath, .strokepath }) |kind| {
        for (0..24) |length|
            try std.testing.expectError(error.InvalidEmfPathDrawingSize, parse(fixture(kind, bytes[0..length])));
        var mismatched = fixture(kind, bytes[0..24]);
        mismatched.size += 4;
        try std.testing.expectError(error.InvalidEmfPathDrawingSize, parse(mismatched));
    }
    try std.testing.expect((try parse(fixture(.fillrgn, bytes[0..24]))) == null);
}
