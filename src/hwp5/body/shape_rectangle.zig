const Reader = @import("../../binary/reader.zig").Reader;
pub const Point = @import("shape_point.zig").Point;
pub const tag: u10 = 79;
pub const Layout = enum { specified_axes, observed_points };
pub const Rectangle = struct {
    round_rate: u8,
    points: [4]Point,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Rectangle {
        var r: Reader = .{ .bytes = bytes };
        const round_rate = try r.readInt(u8);
        var points: [4]Point = undefined;
        switch (layout) {
            .specified_axes => {
                for (&points) |*p| p.x = try r.readInt(i32);
                for (&points) |*p| p.y = try r.readInt(i32);
            },
            .observed_points => for (&points) |*p| {
                p.* = try Point.read(&r);
            },
        }
        return .{ .round_rate = round_rate, .points = points, .extra = bytes[r.offset..] };
    }
};
