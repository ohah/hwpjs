const std = @import("std");
const geometry = @import("geometry.zig");
const point_s_array = @import("point_s_array.zig");
const poly_groups = @import("poly_groups.zig");
const poly_layout = @import("poly_layout.zig");
const records = @import("records.zig");

pub const single_header_size = poly_layout.single_header_size;
pub const multiple_header_size = poly_layout.multiple_header_size;
pub const Range = poly_groups.Range;

pub const Single = struct {
    kind: records.RecordType,
    bounds: geometry.RectL,
    points: point_s_array.Points,
};

pub const Multiple = poly_groups.Groups(point_s_array.Points);

pub const Value = union(enum) { single: Single, multiple: Multiple };

pub fn parse(record: records.Record) !?Value {
    const layout = (try poly_layout.parse(record, .short, point_s_array.width)) orelse return null;
    return switch (layout) {
        .single => |value| .{ .single = .{ .kind = record.kind, .bounds = value.bounds, .points = try point_s_array.Points.parse(value.point_bytes) } },
        .multiple => |value| .{ .multiple = .{ .kind = record.kind, .bounds = value.bounds, .shape_count = value.shape_count, .point_count = value.point_count, .count_bytes = value.count_bytes, .points = try point_s_array.Points.parse(value.point_bytes) } },
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "all five single PointS poly records use shared kinds and signed XY" {
    const cases = [_]struct { kind: records.RecordType, count: u32 }{
        .{ .kind = .polybezier16, .count = 4 },
        .{ .kind = .polygon16, .count = 4 },
        .{ .kind = .polyline16, .count = 4 },
        .{ .kind = .polybezierto16, .count = 3 },
        .{ .kind = .polylineto16, .count = 4 },
    };
    var bytes = [_]u8{0} ** 44;
    for (cases) |case| {
        std.mem.writeInt(u32, bytes[24..28], case.count, .little);
        std.mem.writeInt(i16, bytes[28..30], std.math.minInt(i16), .little);
        std.mem.writeInt(i16, bytes[30..32], std.math.maxInt(i16), .little);
        const length = single_header_size + case.count * point_s_array.width;
        const value = (try parse(fixture(case.kind, bytes[0..length]))).?.single;
        try std.testing.expectEqual(case.kind, value.kind);
        try std.testing.expectEqual(@as(i16, std.math.minInt(i16)), (try value.points.get(0)).x);
        try std.testing.expectEqual(@as(i16, std.math.maxInt(i16)), (try value.points.get(0)).y);
    }
    try std.testing.expect((try parse(fixture(.polyline, &bytes))) == null);
    try std.testing.expect((try parse(fixture(.polydraw16, &bytes))) == null);
}

test "PointS single records reject all fixed truncations exact extent and invalid Bezier counts" {
    var bytes = [_]u8{0} ** 44;
    std.mem.writeInt(u32, bytes[24..28], 4, .little);
    for (0..single_header_size) |cut|
        try std.testing.expectError(error.InvalidEmfPoly16RecordSize, parse(fixture(.polybezier16, bytes[0..cut])));
    try std.testing.expectError(error.InvalidEmfPoly16RecordSize, parse(fixture(.polybezier16, bytes[0..43])));
    var excess = [_]u8{0} ** 48;
    std.mem.writeInt(u32, excess[24..28], 4, .little);
    try std.testing.expectError(error.InvalidEmfPoly16RecordSize, parse(fixture(.polybezier16, &excess)));
    var wrong = fixture(.polybezier16, &bytes);
    wrong.size -= 4;
    try std.testing.expectError(error.InvalidEmfPoly16RecordSize, parse(wrong));
    for ([_]u32{ 0, 1, 2, 3, 5 }) |count| {
        std.mem.writeInt(u32, bytes[24..28], count, .little);
        try std.testing.expectError(error.InvalidEmfPolyBezierPointCount, parse(fixture(.polybezier16, &bytes)));
    }
    std.mem.writeInt(u32, bytes[24..28], 4, .little);
    try std.testing.expectError(error.InvalidEmfPolyBezierPointCount, parse(fixture(.polybezierto16, &bytes)));
}

test "PointS non-Bezier poly records retain degenerate arrays" {
    var bytes = [_]u8{0} ** 32;
    for ([_]struct { kind: records.RecordType, count: u32 }{
        .{ .kind = .polygon16, .count = 0 },
        .{ .kind = .polyline16, .count = 1 },
        .{ .kind = .polylineto16, .count = 0 },
    }) |case| {
        std.mem.writeInt(u32, bytes[24..28], case.count, .little);
        const length = single_header_size + case.count * point_s_array.width;
        try std.testing.expectEqual(@as(usize, case.count), (try parse(fixture(case.kind, bytes[0..length]))).?.single.points.count());
    }
}

test "PointS multi-poly validates exact arrays total ranges and indexes" {
    var bytes = [_]u8{0} ** 60;
    std.mem.writeInt(u32, bytes[24..28], 2, .little);
    std.mem.writeInt(u32, bytes[28..32], 5, .little);
    std.mem.writeInt(u32, bytes[32..36], 2, .little);
    std.mem.writeInt(u32, bytes[36..40], 3, .little);
    std.mem.writeInt(i16, bytes[56..58], -9, .little);
    for ([_]records.RecordType{ .polypolyline16, .polypolygon16 }) |kind| {
        const value = (try parse(fixture(kind, &bytes))).?.multiple;
        try std.testing.expectEqual(@as(u32, 3), try value.countAt(1));
        try std.testing.expectEqualDeep(Range{ .start = 2, .end = 5 }, try value.pointRange(1));
        try std.testing.expectEqual(@as(i16, -9), (try value.points.get(4)).x);
        try std.testing.expectError(error.EmfPolyShapeIndexOutOfBounds, value.countAt(2));
        try std.testing.expectError(error.EmfPolyShapeIndexOutOfBounds, value.pointRange(2));
    }
    for (0..bytes.len) |cut|
        try std.testing.expectError(error.InvalidEmfPoly16RecordSize, parse(fixture(.polypolygon16, bytes[0..cut])));
    std.mem.writeInt(u32, bytes[36..40], 2, .little);
    try std.testing.expectError(error.InvalidEmfPolyPointCountTotal, parse(fixture(.polypolygon16, &bytes)));
}

test "PointS multi-poly rejects impossible u32 extents before slicing and permits empty arrays" {
    var bytes = [_]u8{0} ** multiple_header_size;
    const empty = (try parse(fixture(.polypolygon16, &bytes))).?.multiple;
    try std.testing.expectEqual(@as(usize, 0), empty.points.count());
    std.mem.writeInt(u32, bytes[24..28], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[28..32], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfPoly16RecordSize, parse(fixture(.polypolyline16, &bytes)));
}
