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
        const view = try @import("shape_points.zig").Points.read(&r, points.len, if (layout == .specified_axes) .separate_axes else .interleaved);
        for (&points, 0..) |*p, i| p.* = view.get(i).?;
        return .{ .round_rate = round_rate, .points = points, .extra = bytes[r.offset..] };
    }
};
