const Reader = @import("../../binary/reader.zig").Reader;
pub const Points = @import("shape_points.zig").Points;
pub const Layout = @import("shape_points.zig").CountedLayout;
pub const tag: u10 = 83;
pub const Curve = struct {
    points: Points,
    segments: []const u8,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Curve {
        var r: Reader = .{ .bytes = bytes };
        const points = try Points.readCounted(&r, layout);
        // Empty/single-point lists have no adjacent pairs. Never underflow count - 1.
        const segments = try r.take(points.count() -| 1);
        return .{ .points = points, .segments = segments, .extra = bytes[r.offset..] };
    }
};
