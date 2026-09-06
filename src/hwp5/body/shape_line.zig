const Reader = @import("../../binary/reader.zig").Reader;
const Point = @import("shape_point.zig").Point;
pub const tag: u10 = 78;
/// Table 92 ordinary line payload. Connector ($col) payloads have a different tail.
pub const Line = struct {
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    attributes: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Line {
        var r: Reader = .{ .bytes = bytes };
        const start = try Point.read(&r);
        const end = try Point.read(&r);
        return .{
            .start_x = start.x,
            .start_y = start.y,
            .end_x = end.x,
            .end_y = end.y,
            .attributes = try r.readInt(u16),
            .extra = bytes[r.offset..],
        };
    }
};
