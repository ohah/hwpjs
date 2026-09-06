const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
/// Table 149. Borrowed keywords, no sorting, normalization or NUL removal.
pub const Properties = struct {
    first: []const u8,
    second: []const u8,
    dummy: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{ .first = try string.read(&r), .second = try string.read(&r), .dummy = try r.readInt(u16), .extra = bytes[r.offset..] };
    }
};
