const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const Header = struct {
    /// Fixed PARA_HEADER field location, shared by parsing and narrow writers.
    pub const style_id_offset = 10;
    pub const character_count_offset = 0;
    pub const char_shape_count_offset = 12;
    pub const range_tag_count_offset = 14;
    pub const line_segment_count_offset = 16;
    pub const instance_id_offset = 18;
    pub const para_shape_id_offset = 8;
    pub const break_flags_offset = 11;

    /// Replaces only fields owned by a controlled text writer. Preserves flags.
    pub fn writeTextCounts(bytes: []u8, units: u32, runs: u16, ranges: u16) void {
        const old = std.mem.readInt(u32, bytes[character_count_offset..][0..4], .little);
        std.mem.writeInt(u32, bytes[character_count_offset..][0..4], (old & 0x80000000) | units, .little);
        std.mem.writeInt(u16, bytes[char_shape_count_offset..][0..2], runs, .little);
        std.mem.writeInt(u16, bytes[range_tag_count_offset..][0..2], ranges, .little);
        std.mem.writeInt(u16, bytes[line_segment_count_offset..][0..2], 0, .little);
    }
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
        std.debug.assert(r.offset == style_id_offset);
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
