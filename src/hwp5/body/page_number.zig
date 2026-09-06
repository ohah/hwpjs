const Reader = @import("../../binary/reader.zig").Reader;
pub const Properties = struct {
    attributes: u32,
    symbol: u16,
    prefix: u16,
    suffix: u16,
    dash: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{ .attributes = try r.readInt(u32), .symbol = try r.readInt(u16), .prefix = try r.readInt(u16), .suffix = try r.readInt(u16), .dash = try r.readInt(u16), .extra = bytes[r.offset..] };
    }
    pub fn shape(self: Properties) u8 {
        return @truncate(self.attributes);
    }
    pub fn position(self: Properties) u4 {
        return @truncate(self.attributes >> 8);
    }
};
