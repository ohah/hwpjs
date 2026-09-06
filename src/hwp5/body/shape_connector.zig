const Reader = @import("../../binary/reader.zig").Reader;
const Point = @import("shape_point.zig").Point;
pub const tag: u10 = 78;
pub const ControlPoint = struct {
    position: Point,
    kind_raw: u16,
    pub fn read(reader: *Reader) !ControlPoint {
        var r = reader.*;
        const p: ControlPoint = .{ .position = try Point.read(&r), .kind_raw = try r.readInt(u16) };
        reader.* = r;
        return p;
    }
};
pub const ControlPoints = @import("../../binary/record_array.zig").Records(ControlPoint, 10);
/// Observed $col payload, not the 18-byte $lin payload sharing tag 78.
pub const Connector = struct {
    start: Point,
    end: Point,
    kind_raw: u32,
    start_subject_id: u32,
    start_subject_index: u32,
    end_subject_id: u32,
    end_subject_index: u32,
    points: ControlPoints,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Connector {
        var r: Reader = .{ .bytes = bytes };
        const start = try Point.read(&r);
        const end = try Point.read(&r);
        const kind = try r.readInt(u32);
        const start_id = try r.readInt(u32);
        const start_index = try r.readInt(u32);
        const end_id = try r.readInt(u32);
        const end_index = try r.readInt(u32);
        const count = try r.readInt(u32);
        if (count > (bytes.len - r.offset) / 10) return error.UnexpectedEnd;
        const points = try ControlPoints.parse(try r.take(@as(usize, count) * 10));
        return .{ .start = start, .end = end, .kind_raw = kind, .start_subject_id = start_id, .start_subject_index = start_index, .end_subject_id = end_id, .end_subject_index = end_index, .points = points, .extra = bytes[r.offset..] };
    }
};
