const std = @import("std");
const records = @import("records.zig");
const point_array = @import("point_array.zig");

pub const Kind = enum { polygon, polyline };
pub const Poly = struct { kind: Kind, points: point_array.Points };

fn function(kind: Kind) u16 {
    return switch (kind) {
        .polygon => 0x0324,
        .polyline => 0x0325,
    };
}

pub fn parse(record: records.Record, kind: Kind) !Poly {
    if (record.function != function(kind)) return error.InvalidWmfPolyFunction;
    if (record.parameters.len < 2) return error.InvalidWmfPolySize;
    const signed_count = std.mem.readInt(i16, record.parameters[0..2], .little);
    if (signed_count < 0) return error.InvalidWmfPointCount;
    const count: usize = @intCast(signed_count);
    if (kind == .polygon and count < 2) return error.InvalidWmfPolygonPointCount;
    const points = point_array.fromExact(record.parameters[2..], count) catch return error.InvalidWmfPolySize;
    const expected_words = 4 + count * 2;
    if (record.size_words != expected_words) return error.InvalidWmfPolySize;
    return .{ .kind = kind, .points = points };
}
