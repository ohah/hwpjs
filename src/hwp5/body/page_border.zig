const Reader = @import("../../binary/reader.zig").Reader;
pub const Border = struct {
    flags: u32,
    left: i16,
    right: i16,
    top: i16,
    bottom: i16,
    border_fill_id: u16,
    extra: []const u8,
    /// Table 135 fields total 14 bytes, despite its erroneous total of 12.
    pub fn parse(bytes: []const u8) !Border {
        var r: Reader = .{ .bytes = bytes };
        var d: Border = undefined;
        d.flags = try r.readInt(u32);
        inline for (.{ "left", "right", "top", "bottom" }) |name| @field(d, name) = try r.readInt(i16);
        d.border_fill_id = try r.readInt(u16);
        d.extra = bytes[r.offset..];
        return d;
    }
};
