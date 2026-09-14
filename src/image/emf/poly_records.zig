const std = @import("std");
const geometry = @import("geometry.zig");
const point_l_array = @import("point_l_array.zig");
const records = @import("records.zig");

pub const single_header_size: usize = 28;
pub const multiple_header_size: usize = 32;
pub const Range = struct { start: usize, end: usize };

pub const Single = struct {
    kind: records.RecordType,
    bounds: geometry.RectL,
    points: point_l_array.Points,
};

pub const Multiple = struct {
    kind: records.RecordType,
    bounds: geometry.RectL,
    shape_count: u32,
    point_count: u32,
    count_bytes: []const u8,
    points: point_l_array.Points,

    pub fn countAt(self: Multiple, index: usize) !u32 {
        if (index >= self.shape_count) return error.EmfPolyShapeIndexOutOfBounds;
        return std.mem.readInt(u32, self.count_bytes[index * 4 ..][0..4], .little);
    }

    pub fn pointRange(self: Multiple, index: usize) !Range {
        if (index >= self.shape_count) return error.EmfPolyShapeIndexOutOfBounds;
        var start: u64 = 0;
        for (0..index) |item| start += try self.countAt(item);
        const end = start + try self.countAt(index);
        return .{ .start = @intCast(start), .end = @intCast(end) };
    }
};

pub const Value = union(enum) { single: Single, multiple: Multiple };

fn isSingle(kind: records.RecordType) bool {
    return switch (kind) {
        .polybezier, .polygon, .polyline, .polybezierto, .polylineto => true,
        else => false,
    };
}

fn isMultiple(kind: records.RecordType) bool {
    return kind == .polypolyline or kind == .polypolygon;
}

fn validateSingleCount(kind: records.RecordType, count: u32) !void {
    switch (kind) {
        .polybezier => if (count < 4 or (count - 1) % 3 != 0) return error.InvalidEmfPolyBezierPointCount,
        .polybezierto => if (count < 3 or count % 3 != 0) return error.InvalidEmfPolyBezierPointCount,
        .polygon, .polyline, .polylineto => {},
        else => unreachable,
    }
}

fn parseSingle(record: records.Record) !Single {
    if (record.bytes.len < single_header_size) return error.InvalidEmfPolyRecordSize;
    const count = std.mem.readInt(u32, record.bytes[24..28], .little);
    try validateSingleCount(record.kind, count);
    const expected: u64 = single_header_size + @as(u64, count) * point_l_array.width;
    if (record.size != record.bytes.len or expected != record.bytes.len) return error.InvalidEmfPolyRecordSize;
    return .{
        .kind = record.kind,
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .points = try point_l_array.Points.parse(record.bytes[28..]),
    };
}

fn parseMultiple(record: records.Record) !Multiple {
    if (record.bytes.len < multiple_header_size) return error.InvalidEmfPolyRecordSize;
    const shape_count = std.mem.readInt(u32, record.bytes[24..28], .little);
    const point_count = std.mem.readInt(u32, record.bytes[28..32], .little);
    const counts_end: u64 = multiple_header_size + @as(u64, shape_count) * 4;
    const expected: u64 = counts_end + @as(u64, point_count) * point_l_array.width;
    if (record.size != record.bytes.len or expected != record.bytes.len) return error.InvalidEmfPolyRecordSize;
    const counts_end_usize: usize = @intCast(counts_end);
    var sum: u64 = 0;
    for (0..shape_count) |index| {
        const count = std.mem.readInt(u32, record.bytes[multiple_header_size + index * 4 ..][0..4], .little);
        sum += count;
    }
    if (sum != point_count) return error.InvalidEmfPolyPointCountTotal;
    return .{
        .kind = record.kind,
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .shape_count = shape_count,
        .point_count = point_count,
        .count_bytes = record.bytes[multiple_header_size..counts_end_usize],
        .points = try point_l_array.Points.parse(record.bytes[counts_end_usize..]),
    };
}

pub fn parse(record: records.Record) !?Value {
    if (isSingle(record.kind)) return .{ .single = try parseSingle(record) };
    if (isMultiple(record.kind)) return .{ .multiple = try parseMultiple(record) };
    return null;
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

test "single poly records reject count grammar truncation excess and declaration drift" {
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
    try std.testing.expectError(error.InvalidEmfPolyRecordSize, parse(fixture(.polybezier, &excess)));
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
