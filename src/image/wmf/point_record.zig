const records = @import("records.zig");
const point_s = @import("point_s.zig");

pub const Kind = enum { line_to, move_to, window_origin, window_extent };
pub const PointRecord = struct { kind: Kind, point: point_s.Point };

fn function(kind: Kind) u16 {
    return switch (kind) {
        .line_to => 0x0213,
        .move_to => 0x0214,
        .window_origin => 0x020b,
        .window_extent => 0x020c,
    };
}

pub fn parse(record: records.Record, kind: Kind) !PointRecord {
    if (record.function != function(kind)) return error.InvalidWmfPointFunction;
    if (record.size_words != 5 or record.parameters.len != 4) return error.InvalidWmfPointSize;
    return .{ .kind = kind, .point = point_s.readYX(record.parameters[0..4]) };
}
