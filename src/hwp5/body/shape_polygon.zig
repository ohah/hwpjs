const Reader = @import("../../binary/reader.zig").Reader;
pub const Points = @import("shape_points.zig").Points;
pub const tag: u10 = 82;
pub const Layout = enum { specified_i16_axes, observed_i32_points };
pub const Polygon = struct {
    points: Points,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Polygon {
        var r: Reader = .{ .bytes = bytes };
        const count: i32 = switch (layout) {
            .specified_i16_axes => try r.readInt(i16),
            .observed_i32_points => try r.readInt(i32),
        };
        if (count < 0) return error.NegativePointCount;
        const points = try Points.read(&r, @intCast(count), if (layout == .specified_i16_axes) .separate_axes else .interleaved);
        return .{ .points = points, .extra = bytes[r.offset..] };
    }
};
