const Reader = @import("../../binary/reader.zig").Reader;
pub const tag: u10 = 84;
pub const Layout = enum { spec24, observed26 };
pub const Properties = struct {
    layout: Layout,
    attributes: u32,
    extent_x: i32,
    extent_y: i32,
    bin_data_id: u16,
    border_color: u32,
    border_thickness: i32,
    border_attributes: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .layout = layout,
            .attributes = if (layout == .spec24) try r.readInt(u16) else try r.readInt(u32),
            .extent_x = try r.readInt(i32),
            .extent_y = try r.readInt(i32),
            .bin_data_id = try r.readInt(u16),
            .border_color = try r.readInt(u32),
            .border_thickness = try r.readInt(i32),
            .border_attributes = try r.readInt(u32),
            .extra = bytes[r.offset..],
        };
    }
    pub fn drawingAspect(self: Properties) u8 {
        return @truncate(self.attributes);
    }
    pub fn hasMoniker(self: Properties) bool {
        return self.attributes & 0x100 != 0;
    }
    pub fn baselineRaw(self: Properties) u7 {
        return @truncate(self.attributes >> 9);
    }
    /// The 16-bit specification layout cannot encode bits 16..21.
    pub fn objectKind(self: Properties) ?u6 {
        return if (self.layout == .spec24) null else @truncate(self.attributes >> 16);
    }
};
