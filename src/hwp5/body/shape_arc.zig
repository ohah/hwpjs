const Reader = @import("../../binary/reader.zig").Reader;
pub const Point = @import("shape_point.zig").Point;
pub const tag: u10 = 81;
pub const Layout = enum { specified_u32, reference_u8 };
pub const Header = union(Layout) { specified_u32: u32, reference_u8: u8 };
/// Table 101 and the independent reference disagree on header width/meaning.
/// Preserve that distinction; never infer layout from length or coerce an enum.
pub const Arc = struct {
    header: Header,
    center: Point,
    axis1: Point,
    axis2: Point,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Arc {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .header = switch (layout) {
                .specified_u32 => .{ .specified_u32 = try r.readInt(u32) },
                .reference_u8 => .{ .reference_u8 = try r.readInt(u8) },
            },
            .center = try Point.read(&r),
            .axis1 = try Point.read(&r),
            .axis2 = try Point.read(&r),
            .extra = bytes[r.offset..],
        };
    }
    pub fn headerRaw(self: Arc) u32 {
        return switch (self.header) {
            inline else => |raw| raw,
        };
    }
};
