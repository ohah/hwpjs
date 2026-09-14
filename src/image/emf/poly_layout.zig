const std = @import("std");
const geometry = @import("geometry.zig");
const poly_rules = @import("poly_rules.zig");
const records = @import("records.zig");

pub const single_header_size: usize = 28;
pub const multiple_header_size: usize = 32;
pub const Single = struct { shape: poly_rules.Shape, bounds: geometry.RectL, point_bytes: []const u8 };
pub const Multiple = struct { bounds: geometry.RectL, shape_count: u32, point_count: u32, count_bytes: []const u8, point_bytes: []const u8 };
pub const Value = union(enum) { single: Single, multiple: Multiple };

fn sizeError(coordinate: poly_rules.Coordinate) anyerror {
    return if (coordinate == .long) error.InvalidEmfPolyRecordSize else error.InvalidEmfPoly16RecordSize;
}

pub fn parse(record: records.Record, coordinate: poly_rules.Coordinate, point_width: usize) !?Value {
    const info = poly_rules.classify(record.kind) orelse return null;
    if (info.coordinate != coordinate) return null;
    if (!poly_rules.isMultiple(info.shape)) {
        if (record.bytes.len < single_header_size) return sizeError(coordinate);
        const count = std.mem.readInt(u32, record.bytes[24..28], .little);
        try poly_rules.validateSingleCount(info.shape, count);
        const expected: u64 = single_header_size + @as(u64, count) * point_width;
        if (record.size != record.bytes.len or expected != record.bytes.len) return sizeError(coordinate);
        return .{ .single = .{
            .shape = info.shape,
            .bounds = try geometry.parseRectL(record.bytes[8..24]),
            .point_bytes = record.bytes[single_header_size..],
        } };
    }

    if (record.bytes.len < multiple_header_size) return sizeError(coordinate);
    const shape_count = std.mem.readInt(u32, record.bytes[24..28], .little);
    const point_count = std.mem.readInt(u32, record.bytes[28..32], .little);
    const counts_end: u64 = multiple_header_size + @as(u64, shape_count) * 4;
    const expected: u64 = counts_end + @as(u64, point_count) * point_width;
    if (record.size != record.bytes.len or expected != record.bytes.len) return sizeError(coordinate);
    const counts_end_usize: usize = @intCast(counts_end);
    const count_bytes = record.bytes[multiple_header_size..counts_end_usize];
    if (try poly_rules.sumCounts(count_bytes, shape_count) != point_count) return error.InvalidEmfPolyPointCountTotal;
    return .{ .multiple = .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .shape_count = shape_count,
        .point_count = point_count,
        .count_bytes = count_bytes,
        .point_bytes = record.bytes[counts_end_usize..],
    } };
}
