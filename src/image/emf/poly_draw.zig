const std = @import("std");
const geometry = @import("geometry.zig");
const point_l_array = @import("point_l_array.zig");
const point_s_array = @import("point_s_array.zig");
const point_type_array = @import("point_type_array.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const header_size: usize = 28;
pub const Long = struct {
    bounds: geometry.RectL,
    points: point_l_array.Points,
    types: point_type_array.Types,
    padding: []const u8,
};
pub const Short = struct {
    bounds: geometry.RectL,
    points: point_s_array.Points,
    types: point_type_array.Types,
    padding: []const u8,
};
pub const Value = union(enum) { long: Long, short: Short };

const Layout = struct { bounds: geometry.RectL, point_bytes: []const u8, type_bytes: []const u8, padding: []const u8 };

fn parseLayout(record: records.Record, point_width: usize) !Layout {
    if (record.bytes.len < header_size) return error.InvalidEmfPolyDrawRecordSize;
    const count = std.mem.readInt(u32, record.bytes[24..28], .little);
    const points_end: u64 = header_size + @as(u64, count) * point_width;
    const content_end = points_end + count;
    const expected = std.mem.alignForward(u64, content_end, 4);
    const semantic_end = record_extent.requiredEnd(record, expected) orelse return error.InvalidEmfPolyDrawRecordSize;
    const points_end_usize: usize = @intCast(points_end);
    const content_end_usize: usize = @intCast(content_end);
    return .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .point_bytes = record.bytes[header_size..points_end_usize],
        .type_bytes = record.bytes[points_end_usize..content_end_usize],
        .padding = record.bytes[content_end_usize..semantic_end],
    };
}

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .polydraw => blk: {
            const layout = try parseLayout(record, point_l_array.width);
            break :blk .{ .long = .{
                .bounds = layout.bounds,
                .points = try point_l_array.Points.parse(layout.point_bytes),
                .types = try point_type_array.Types.parse(layout.type_bytes),
                .padding = layout.padding,
            } };
        },
        .polydraw16 => blk: {
            const layout = try parseLayout(record, point_s_array.width);
            break :blk .{ .short = .{
                .bounds = layout.bounds,
                .points = try point_s_array.Points.parse(layout.point_bytes),
                .types = try point_type_array.Types.parse(layout.type_bytes),
                .padding = layout.padding,
            } };
        },
        else => null,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "POLYDRAW keeps parallel PointL types and ignored alignment bytes" {
    var bytes = [_]u8{0} ** 56;
    std.mem.writeInt(u32, bytes[24..28], 3, .little);
    std.mem.writeInt(i32, bytes[28..32], std.math.minInt(i32), .little);
    bytes[52..55].* = .{ 4, 4, 5 };
    bytes[55] = 0xa5;
    const value = (try parse(fixture(.polydraw, &bytes))).?.long;
    try std.testing.expectEqual(@as(i32, std.math.minInt(i32)), (try value.points.get(0)).x);
    try std.testing.expectEqual(@as(usize, 3), value.points.count());
    try std.testing.expectEqual(@as(usize, 3), value.types.count());
    try std.testing.expectEqualSlices(u8, &.{0xa5}, value.padding);
}

test "POLYDRAW16 keeps parallel PointS types and every padding length" {
    for (0..4) |padding_length| {
        const count: u32 = @intCast((4 - padding_length) % 4);
        var bytes = [_]u8{0} ** 48;
        std.mem.writeInt(u32, bytes[24..28], count, .little);
        const type_start = header_size + count * point_s_array.width;
        for (0..count) |index| bytes[type_start + index] = 2;
        const content_end = type_start + count;
        const length = std.mem.alignForward(usize, content_end, 4);
        @memset(bytes[content_end..length], 0xcc);
        const value = (try parse(fixture(.polydraw16, bytes[0..length]))).?.short;
        try std.testing.expectEqual(@as(usize, count), value.points.count());
        try std.testing.expectEqual(@as(usize, count), value.types.count());
        try std.testing.expectEqual(padding_length, value.padding.len);
        for (value.padding) |byte| try std.testing.expectEqual(@as(u8, 0xcc), byte);
    }
}

test "POLYDRAW variants reject truncation and type errors but ignore trailing data" {
    var bytes = [_]u8{0} ** 48;
    std.mem.writeInt(u32, bytes[24..28], 3, .little);
    bytes[40..43].* = .{ 4, 4, 5 };
    for (0..header_size) |cut|
        try std.testing.expectError(error.InvalidEmfPolyDrawRecordSize, parse(fixture(.polydraw16, bytes[0..cut])));
    try std.testing.expectError(error.InvalidEmfPolyDrawRecordSize, parse(fixture(.polydraw16, bytes[0..43])));
    const extended = (try parse(fixture(.polydraw16, &bytes))).?.short;
    try std.testing.expectEqual(@as(usize, 3), extended.points.count());
    try std.testing.expectEqual(@as(usize, 1), extended.padding.len);
    var wrong = fixture(.polydraw16, bytes[0..44]);
    wrong.size -= 4;
    try std.testing.expectError(error.InvalidEmfPolyDrawRecordSize, parse(wrong));
    bytes[42] = 6;
    try std.testing.expectError(error.InvalidEmfPolyDrawBezierSequence, parse(fixture(.polydraw16, bytes[0..44])));
    bytes[40] = 7;
    try std.testing.expectError(error.InvalidEmfPointType, parse(fixture(.polydraw16, bytes[0..44])));
    std.mem.writeInt(u32, bytes[24..28], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfPolyDrawRecordSize, parse(fixture(.polydraw16, &bytes)));
}

test "POLYDRAW parser claims only two record types and accepts empty arrays" {
    var bytes = [_]u8{0} ** header_size;
    try std.testing.expectEqual(@as(usize, 0), (try parse(fixture(.polydraw, &bytes))).?.long.points.count());
    try std.testing.expectEqual(@as(usize, 0), (try parse(fixture(.polydraw16, &bytes))).?.short.types.count());
    try std.testing.expect((try parse(fixture(.polyline, &bytes))) == null);
}
