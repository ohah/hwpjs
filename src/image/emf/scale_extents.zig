const std = @import("std");
const records = @import("records.zig");

pub const Kind = enum { viewport, window };

pub const Scale = struct {
    kind: Kind,
    x_numerator: i32,
    x_denominator: i32,
    y_numerator: i32,
    y_denominator: i32,
};

pub fn parse(record: records.Record) !?Scale {
    const kind: Kind = switch (record.kind) {
        .scaleviewportextex => .viewport,
        .scalewindowextex => .window,
        else => return null,
    };
    if (record.size != 24 or record.bytes.len != 24) return error.InvalidEmfScaleExtentsRecordSize;
    const value: Scale = .{
        .kind = kind,
        .x_numerator = std.mem.readInt(i32, record.bytes[8..12], .little),
        .x_denominator = std.mem.readInt(i32, record.bytes[12..16], .little),
        .y_numerator = std.mem.readInt(i32, record.bytes[16..20], .little),
        .y_denominator = std.mem.readInt(i32, record.bytes[20..24], .little),
    };
    if (value.x_numerator == 0 or value.x_denominator == 0 or
        value.y_numerator == 0 or value.y_denominator == 0) return error.InvalidEmfScaleExtentRatio;
    return value;
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn bytesFor(values: [4]i32) [24]u8 {
    var bytes = [_]u8{0} ** 24;
    for (values, 0..) |value, index| std.mem.writeInt(i32, bytes[8 + index * 4 ..][0..4], value, .little);
    return bytes;
}

test "scale extents parse both records and preserve signed ratios" {
    const values = [4]i32{ -1, std.math.minInt(i32), std.math.maxInt(i32), 2 };
    const viewport = (try parse(fixture(.scaleviewportextex, &bytesFor(values)))).?;
    try std.testing.expectEqual(Kind.viewport, viewport.kind);
    try std.testing.expectEqual(values[0], viewport.x_numerator);
    try std.testing.expectEqual(values[1], viewport.x_denominator);
    try std.testing.expectEqual(values[2], viewport.y_numerator);
    try std.testing.expectEqual(values[3], viewport.y_denominator);
    const window = (try parse(fixture(.scalewindowextex, &bytesFor(values)))).?;
    try std.testing.expectEqual(Kind.window, window.kind);
    try std.testing.expectEqual(values[0], window.x_numerator);
}

test "scale extents reject zero in every ratio component" {
    for (0..4) |zero_index| {
        var values = [4]i32{ 1, -2, 3, -4 };
        values[zero_index] = 0;
        const bytes = bytesFor(values);
        try std.testing.expectError(error.InvalidEmfScaleExtentRatio, parse(fixture(.scaleviewportextex, &bytes)));
        try std.testing.expectError(error.InvalidEmfScaleExtentRatio, parse(fixture(.scalewindowextex, &bytes)));
    }
}

test "scale extents require exact size and do not claim unrelated records" {
    var short = [_]u8{0} ** 20;
    try std.testing.expectError(error.InvalidEmfScaleExtentsRecordSize, parse(fixture(.scaleviewportextex, &short)));
    var declared_twenty_four = fixture(.scaleviewportextex, &short);
    declared_twenty_four.size = 24;
    try std.testing.expectError(error.InvalidEmfScaleExtentsRecordSize, parse(declared_twenty_four));
    var long = [_]u8{0} ** 28;
    try std.testing.expectError(error.InvalidEmfScaleExtentsRecordSize, parse(fixture(.scalewindowextex, &long)));
    try std.testing.expect((try parse(fixture(.savedc, short[0..8]))) == null);
}
