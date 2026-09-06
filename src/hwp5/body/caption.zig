const Reader = @import("../../binary/reader.zig").Reader;
/// Table 72 is 14 bytes despite table 71's contradictory 12-byte summary.
pub const Caption = struct {
    flags: u32,
    width: u32,
    gap: i16,
    max_text_width: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Caption {
        var r: Reader = .{ .bytes = bytes };
        return .{ .flags = try r.readInt(u32), .width = try r.readInt(u32), .gap = try r.readInt(i16), .max_text_width = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
};
