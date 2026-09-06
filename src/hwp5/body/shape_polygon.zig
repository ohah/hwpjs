const Reader = @import("../../binary/reader.zig").Reader;
pub const Points = @import("shape_points.zig").Points;
pub const tag: u10 = 82;
pub const Layout = @import("shape_points.zig").CountedLayout;
pub const Polygon = struct {
    points: Points,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Polygon {
        var r: Reader = .{ .bytes = bytes };
        const points = try Points.readCounted(&r, layout);
        return .{ .points = points, .extra = bytes[r.offset..] };
    }
};
