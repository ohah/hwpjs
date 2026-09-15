const std = @import("std");
const geometry = @import("geometry.zig");
const point_l_array = @import("point_l_array.zig");
const poly_groups = @import("poly_groups.zig");
const poly_layout = @import("poly_layout.zig");
const records = @import("records.zig");

pub const single_header_size = poly_layout.single_header_size;
pub const multiple_header_size = poly_layout.multiple_header_size;
pub const Range = poly_groups.Range;

pub const Single = struct {
    kind: records.RecordType,
    bounds: geometry.RectL,
    points: point_l_array.Points,
};

pub const Multiple = poly_groups.Groups(point_l_array.Points);

pub const Value = union(enum) { single: Single, multiple: Multiple };

pub fn parse(record: records.Record) !?Value {
    const layout = (try poly_layout.parse(record, .long, point_l_array.width)) orelse return null;
    return switch (layout) {
        .single => |value| .{ .single = .{ .kind = record.kind, .bounds = value.bounds, .points = try point_l_array.Points.parse(value.point_bytes) } },
        .multiple => |value| .{ .multiple = .{ .kind = record.kind, .bounds = value.bounds, .shape_count = value.shape_count, .point_count = value.point_count, .count_bytes = value.count_bytes, .points = try point_l_array.Points.parse(value.point_bytes) } },
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn singleFixture(count: u32) [60]u8 {
    var bytes = [_]u8{0} ** 60;
    std.mem.writeInt(u32, bytes[24..28], count, .little);
    return bytes;
}

test "single 32-bit poly records enforce kind-specific point sequences" {
    const cases = [_]struct { kind: records.RecordType, count: u32 }{
        .{ .kind = .polybezier, .count = 4 },
        .{ .kind = .polygon, .count = 4 },
        .{ .kind = .polyline, .count = 4 },
        .{ .kind = .polybezierto, .count = 3 },
        .{ .kind = .polylineto, .count = 4 },
    };
    for (cases) |case| {
        var bytes = singleFixture(case.count);
        const length = single_header_size + case.count * point_l_array.width;
        std.mem.writeInt(i32, bytes[8..12], -10, .little);
        std.mem.writeInt(i32, bytes[28..32], -20, .little);
        const value = (try parse(fixture(case.kind, bytes[0..length]))).?.single;
        try std.testing.expectEqual(case.kind, value.kind);
        try std.testing.expectEqual(@as(i32, -10), value.bounds.left);
        try std.testing.expectEqual(@as(i32, -20), (try value.points.get(0)).x);
        try std.testing.expectEqual(@as(usize, case.count), value.points.count());
    }
    const unrelated = [_]u8{0} ** 8;
    try std.testing.expect((try parse(fixture(.savedc, &unrelated))) == null);
}

test "single poly records reject grammar truncation and declaration drift but ignore trailing data" {
    var bytes = singleFixture(4);
    for (0..single_header_size) |cut|
        try std.testing.expectError(error.InvalidEmfPolyRecordSize, parse(fixture(.polybezier, bytes[0..cut])));
    for ([_]u32{ 0, 1, 2, 3, 5, 6 }) |count| {
        std.mem.writeInt(u32, bytes[24..28], count, .little);
        try std.testing.expectError(error.InvalidEmfPolyBezierPointCount, parse(fixture(.polybezier, &bytes)));
    }
    std.mem.writeInt(u32, bytes[24..28], 4, .little);
    try std.testing.expectError(error.InvalidEmfPolyRecordSize, parse(fixture(.polybezier, bytes[0..59])));
    var excess = [_]u8{0} ** 68;
    std.mem.writeInt(u32, excess[24..28], 4, .little);
    try std.testing.expectEqual(@as(usize, 4), (try parse(fixture(.polybezier, &excess))).?.single.points.count());
    var wrong = fixture(.polybezier, &bytes);
    wrong.size -= 4;
    try std.testing.expectError(error.InvalidEmfPolyRecordSize, parse(wrong));

    const invalid_counts = [_]struct { kind: records.RecordType, count: u32 }{
        .{ .kind = .polybezierto, .count = 0 },
        .{ .kind = .polybezierto, .count = 4 },
    };
    for (invalid_counts) |case| {
        std.mem.writeInt(u32, bytes[24..28], case.count, .little);
        try std.testing.expectError(error.InvalidEmfPolyBezierPointCount, parse(fixture(case.kind, &bytes)));
    }
}

test "non-Bezier poly records preserve degenerate point arrays without inventing wire constraints" {
    var bytes = [_]u8{0} ** 36;
    for ([_]struct { kind: records.RecordType, count: u32 }{
        .{ .kind = .polygon, .count = 0 },
        .{ .kind = .polyline, .count = 1 },
        .{ .kind = .polylineto, .count = 0 },
    }) |case| {
        std.mem.writeInt(u32, bytes[24..28], case.count, .little);
        const length = single_header_size + case.count * point_l_array.width;
        try std.testing.expectEqual(@as(usize, case.count), (try parse(fixture(case.kind, bytes[0..length]))).?.single.points.count());
    }
    var empty_multiple = [_]u8{0} ** multiple_header_size;
    const value = (try parse(fixture(.polypolygon, &empty_multiple))).?.multiple;
    try std.testing.expectEqual(@as(u32, 0), value.shape_count);
    try std.testing.expectEqual(@as(usize, 0), value.points.count());
}

test "multi-poly records validate per-shape counts total and borrowed ranges" {
    var bytes = [_]u8{0} ** 80;
    std.mem.writeInt(u32, bytes[24..28], 2, .little);
    std.mem.writeInt(u32, bytes[28..32], 5, .little);
    std.mem.writeInt(u32, bytes[32..36], 2, .little);
    std.mem.writeInt(u32, bytes[36..40], 3, .little);
    std.mem.writeInt(i32, bytes[72..76], -7, .little);
    for ([_]records.RecordType{ .polypolyline, .polypolygon }) |kind| {
        const value = (try parse(fixture(kind, &bytes))).?.multiple;
        try std.testing.expectEqual(@as(u32, 2), try value.countAt(0));
        try std.testing.expectEqualDeep(Range{ .start = 2, .end = 5 }, try value.pointRange(1));
        try std.testing.expectEqual(@as(i32, -7), (try value.points.get(4)).x);
        try std.testing.expectError(error.EmfPolyShapeIndexOutOfBounds, value.countAt(2));
        try std.testing.expectError(error.EmfPolyShapeIndexOutOfBounds, value.pointRange(2));
    }
    var extended: [84]u8 = undefined;
    @memcpy(extended[0..80], &bytes);
    extended[80..].* = .{ 1, 2, 3, 4 };
    try std.testing.expectEqual(@as(usize, 5), (try parse(fixture(.polypolygon, &extended))).?.multiple.points.count());
    for (0..bytes.len) |cut|
        try std.testing.expectError(error.InvalidEmfPolyRecordSize, parse(fixture(.polypolygon, bytes[0..cut])));
    std.mem.writeInt(u32, bytes[36..40], 2, .little);
    try std.testing.expectError(error.InvalidEmfPolyPointCountTotal, parse(fixture(.polypolygon, &bytes)));
    std.mem.writeInt(u32, bytes[36..40], 3, .little);
    std.mem.writeInt(u32, bytes[32..36], 1, .little);
    try std.testing.expectError(error.InvalidEmfPolyPointCountTotal, parse(fixture(.polypolygon, &bytes)));
}

test "multi-poly checked extents reject impossible counts before slicing" {
    var bytes = [_]u8{0} ** multiple_header_size;
    std.mem.writeInt(u32, bytes[24..28], std.math.maxInt(u32), .little);
    std.mem.writeInt(u32, bytes[28..32], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfPolyRecordSize, parse(fixture(.polypolyline, &bytes)));
}
