const Reader = @import("../../binary/reader.zig").Reader;
const points = @import("shape_points.zig");
pub const tag: u10 = 85;
pub const Layout = points.Layout;
/// Explicitly selected fixed prefix. Effects and later properties remain raw.
pub const Prefix = enum { base73, with_opacity74, with_instance78 };
pub const Picture = struct {
    border_color: u32,
    border_width: i32,
    border_attributes: u32,
    points: points.Points,
    crop: [4]i32, // left, top, right, bottom
    margins: [4]i16, // left, right, top, bottom
    image: @import("../docinfo/picture_info.zig").Picture,
    border_opacity: ?u8,
    instance_id: ?u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout, prefix: Prefix) !Picture {
        var r: Reader = .{ .bytes = bytes };
        var p: Picture = undefined;
        p.border_color = try r.readInt(u32);
        p.border_width = try r.readInt(i32);
        p.border_attributes = try r.readInt(u32);
        p.points = try points.Points.read(&r, 4, layout);
        for (&p.crop) |*v| v.* = try r.readInt(i32);
        for (&p.margins) |*v| v.* = try r.readInt(i16);
        p.image = try @import("../docinfo/picture_info.zig").Picture.read(&r);
        p.border_opacity = if (prefix == .base73) null else try r.readInt(u8);
        p.instance_id = if (prefix == .with_instance78) try r.readInt(u32) else null;
        p.extra = bytes[r.offset..];
        return p;
    }
    pub fn borderAttributes(self: Picture) @import("line_attributes.zig").Attributes {
        return .{ .raw = self.border_attributes };
    }
};
