const Reader = @import("../../binary/reader.zig").Reader;
pub const Point = @import("shape_point.zig").Point;
pub const tag: u10 = 80;
/// Tables 96-97. Preserve all endpoints even when the current flags describe a full ellipse.
pub const Ellipse = struct {
    attributes: u32,
    center: Point,
    axis1: Point,
    axis2: Point,
    start1: Point,
    end1: Point,
    start2: Point,
    end2: Point,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Ellipse {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .attributes = try r.readInt(u32),
            .center = try Point.read(&r),
            .axis1 = try Point.read(&r),
            .axis2 = try Point.read(&r),
            .start1 = try Point.read(&r),
            .end1 = try Point.read(&r),
            .start2 = try Point.read(&r),
            .end2 = try Point.read(&r),
            .extra = bytes[r.offset..],
        };
    }
    pub fn needsIntervalUpdate(self: Ellipse) bool {
        return self.attributes & 1 != 0;
    }
    pub fn isArc(self: Ellipse) bool {
        return self.attributes & 2 != 0;
    }
    pub fn arcKindRaw(self: Ellipse) u8 {
        return @truncate(self.attributes >> 2);
    }
    pub fn unknownBits(self: Ellipse) u32 {
        return self.attributes & ~@as(u32, 0x3ff);
    }
};
