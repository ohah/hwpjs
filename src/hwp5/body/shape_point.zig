const Reader = @import("../../binary/reader.zig").Reader;
pub const Point = struct {
    x: i32,
    y: i32,
    pub fn read(reader: *Reader) !Point {
        var r = reader.*;
        const point: Point = .{ .x = try r.readInt(i32), .y = try r.readInt(i32) };
        reader.* = r;
        return point;
    }
};
