const Reader = @import("../../binary/reader.zig").Reader;
pub const Definition = struct {
    width: u32,
    height: u32,
    left: u32,
    right: u32,
    top: u32,
    bottom: u32,
    header: u32,
    footer: u32,
    gutter: u32,
    flags: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Definition {
        var r: Reader = .{ .bytes = bytes };
        var d: Definition = undefined;
        inline for (.{ "width", "height", "left", "right", "top", "bottom", "header", "footer", "gutter", "flags" }) |name| @field(d, name) = try r.readInt(u32);
        d.extra = bytes[r.offset..];
        return d;
    }
};
