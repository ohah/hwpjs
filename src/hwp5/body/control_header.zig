const Reader = @import("../../binary/reader.zig").Reader;
pub const Header = struct {
    id: u32,
    properties: []const u8,
    pub fn parse(bytes: []const u8) !Header {
        var r: Reader = .{ .bytes = bytes };
        return .{ .id = try r.readInt(u32), .properties = bytes[4..] };
    }
    /// MAKE_4CHID order, not UTF-8. Preserve spaces, NUL and non-ASCII bytes.
    pub fn name(self: Header) [4]u8 {
        return .{ @truncate(self.id >> 24), @truncate(self.id >> 16), @truncate(self.id >> 8), @truncate(self.id) };
    }
};
