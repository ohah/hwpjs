const fixed = @import("color_fixed.zig");
pub const scale = fixed.scale;
pub const Value = struct { scaled: u32 };
/// Wire value only; zero is preserved, not certified as usable for gamma correction.
pub fn parse(bytes: []const u8) !Value {
    if (bytes.len != 4) return error.InvalidPngGammaSize;
    return .{ .scaled = try fixed.read(bytes) };
}
