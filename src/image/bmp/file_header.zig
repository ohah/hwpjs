const Reader = @import("../../binary/reader.zig").Reader;
pub const Header = struct { size: u32, pixels_offset: u32 };
pub const byte_size = 14;
pub fn parse(bytes: []const u8) !Header {
    var r: Reader = .{ .bytes = bytes };
    if (try r.readInt(u16) != 0x4d42) return error.InvalidBmpSignature;
    const size = try r.readInt(u32);
    if (try r.readInt(u16) != 0 or try r.readInt(u16) != 0) return error.InvalidBmpReserved;
    return .{ .size = size, .pixels_offset = try r.readInt(u32) };
}
