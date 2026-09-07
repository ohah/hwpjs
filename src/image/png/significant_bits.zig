const Header = @import("header.zig").Header;
pub const Value = struct { bits: [4]u8 = @splat(0), count: u8 };
pub fn parse(h: Header, bytes: []const u8) !Value {
    const channels = try h.channels();
    const count = if (h.color_type == 3) 3 else channels;
    const maximum: u8 = if (h.color_type == 3) 8 else h.bit_depth;
    if (bytes.len != count) return error.InvalidPngSignificantBitsSize;
    for (bytes) |value| if (value == 0 or value > maximum) return error.InvalidPngSignificantBitsValue;
    var result: Value = .{ .count = count };
    @memcpy(result.bits[0..count], bytes);
    return result;
}
