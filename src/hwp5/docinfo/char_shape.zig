const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const CharShape = struct {
    font_ids: [7]u16,
    ratios: [7]u8,
    spacing: [7]i8,
    relative_sizes: [7]u8,
    offsets: [7]i8,
    size: i32,
    attributes: u32,
    shadow_x: i8,
    shadow_y: i8,
    text_color: u32,
    underline_color: u32,
    shade_color: u32,
    shadow_color: u32,
    border_fill_id: ?u16,
    strike_color: ?u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, version: Version) !CharShape {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var v: CharShape = undefined;
        for (&v.font_ids) |*x| x.* = try r.readInt(u16);
        for (&v.ratios) |*x| x.* = try r.readInt(u8);
        for (&v.spacing) |*x| x.* = try r.readInt(i8);
        for (&v.relative_sizes) |*x| x.* = try r.readInt(u8);
        for (&v.offsets) |*x| x.* = try r.readInt(i8);
        v.size = try r.readInt(i32);
        v.attributes = try r.readInt(u32);
        v.shadow_x = try r.readInt(i8);
        v.shadow_y = try r.readInt(i8);
        v.text_color = try r.readInt(u32);
        v.underline_color = try r.readInt(u32);
        v.shade_color = try r.readInt(u32);
        v.shadow_color = try r.readInt(u32);
        v.border_fill_id = if (version.raw >= 0x05000201 and r.offset < bytes.len) try r.readInt(u16) else null;
        v.strike_color = if (version.raw >= 0x05000300 and r.offset < bytes.len) try r.readInt(u32) else null;
        v.extra = bytes[r.offset..];
        return v;
    }
};
