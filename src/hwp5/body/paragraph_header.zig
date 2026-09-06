const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const Header = struct {
    chars_raw: u32,
    control_mask: u32,
    para_shape_id: u16,
    style_id: u8,
    break_flags: u8,
    char_shape_count: u16,
    range_tag_count: u16,
    line_segment_count: u16,
    instance_id: u32,
    merge_tracking: ?u16,
    extra: []const u8,

    pub fn characterUnits(self: Header) u32 {
        return self.chars_raw & 0x7fffffff;
    }
    /// Preserve the high bit without inferring list ownership from it alone.
    pub fn countHighBit(self: Header) bool {
        return self.chars_raw & 0x80000000 != 0;
    }
    pub fn parse(bytes: []const u8, version: Version) !Header {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var h: Header = undefined;
        h.chars_raw = try r.readInt(u32);
        h.control_mask = try r.readInt(u32);
        h.para_shape_id = try r.readInt(u16);
        h.style_id = try r.readInt(u8);
        h.break_flags = try r.readInt(u8);
        h.char_shape_count = try r.readInt(u16);
        h.range_tag_count = try r.readInt(u16);
        h.line_segment_count = try r.readInt(u16);
        h.instance_id = try r.readInt(u32);
        h.merge_tracking = if (version.raw >= 0x05000302 and r.offset < bytes.len) try r.readInt(u16) else null;
        h.extra = bytes[r.offset..];
        return h;
    }
};
