const std = @import("std");
const records = @import("records.zig");

pub const Coordinate = enum { long, short };
pub const Shape = enum { bezier, polygon, polyline, bezier_to, polyline_to, poly_polyline, poly_polygon };
pub const Info = struct { shape: Shape, coordinate: Coordinate };

pub fn classify(kind: records.RecordType) ?Info {
    return switch (kind) {
        .polybezier => .{ .shape = .bezier, .coordinate = .long },
        .polygon => .{ .shape = .polygon, .coordinate = .long },
        .polyline => .{ .shape = .polyline, .coordinate = .long },
        .polybezierto => .{ .shape = .bezier_to, .coordinate = .long },
        .polylineto => .{ .shape = .polyline_to, .coordinate = .long },
        .polypolyline => .{ .shape = .poly_polyline, .coordinate = .long },
        .polypolygon => .{ .shape = .poly_polygon, .coordinate = .long },
        .polybezier16 => .{ .shape = .bezier, .coordinate = .short },
        .polygon16 => .{ .shape = .polygon, .coordinate = .short },
        .polyline16 => .{ .shape = .polyline, .coordinate = .short },
        .polybezierto16 => .{ .shape = .bezier_to, .coordinate = .short },
        .polylineto16 => .{ .shape = .polyline_to, .coordinate = .short },
        .polypolyline16 => .{ .shape = .poly_polyline, .coordinate = .short },
        .polypolygon16 => .{ .shape = .poly_polygon, .coordinate = .short },
        else => null,
    };
}

pub fn isMultiple(shape: Shape) bool {
    return shape == .poly_polyline or shape == .poly_polygon;
}

pub fn validateSingleCount(shape: Shape, count: u32) !void {
    switch (shape) {
        .bezier => if (count < 4 or (count - 1) % 3 != 0) return error.InvalidEmfPolyBezierPointCount,
        .bezier_to => if (count < 3 or count % 3 != 0) return error.InvalidEmfPolyBezierPointCount,
        .polygon, .polyline, .polyline_to => {},
        .poly_polyline, .poly_polygon => unreachable,
    }
}

pub fn sumCounts(bytes: []const u8, count: u32) !u64 {
    if (@as(u64, count) * 4 != bytes.len) return error.InvalidEmfPolyCountArraySize;
    var sum: u64 = 0;
    for (0..count) |index| sum += std.mem.readInt(u32, bytes[index * 4 ..][0..4], .little);
    return sum;
}

test "poly rules classify exactly fourteen width variants and share count grammar" {
    const t = std.testing;
    for ([_]records.RecordType{ .polybezier, .polygon, .polyline, .polybezierto, .polylineto, .polypolyline, .polypolygon }) |kind|
        try t.expectEqual(Coordinate.long, classify(kind).?.coordinate);
    for ([_]records.RecordType{ .polybezier16, .polygon16, .polyline16, .polybezierto16, .polylineto16, .polypolyline16, .polypolygon16 }) |kind|
        try t.expectEqual(Coordinate.short, classify(kind).?.coordinate);
    try t.expect(classify(.polydraw16) == null);
    try validateSingleCount(.bezier, 4);
    try validateSingleCount(.bezier_to, 3);
    try t.expectError(error.InvalidEmfPolyBezierPointCount, validateSingleCount(.bezier, 5));
    try t.expectError(error.InvalidEmfPolyBezierPointCount, validateSingleCount(.bezier_to, 4));
    try validateSingleCount(.polygon, 0);
}

test "poly count sum uses u64 and exact little-endian array extent" {
    var bytes = [_]u8{0} ** 8;
    std.mem.writeInt(u32, bytes[0..4], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[4..8], std.math.maxInt(u32), .little);
    try std.testing.expectEqual(@as(u64, 8589934590), try sumCounts(&bytes, 2));
    try std.testing.expectError(error.InvalidEmfPolyCountArraySize, sumCounts(bytes[0..4], 2));
}
