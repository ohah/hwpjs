const fixed = @import("color_fixed.zig");
pub const scale = fixed.scale;
pub const Point = struct { x: u32, y: u32 };
pub const Value = struct { white: Point, red: Point, green: Point, blue: Point };
/// Exact wire fields, not a gamut, matrix-invertibility or white-point validity check.
pub fn parse(bytes: []const u8) !Value {
    if (bytes.len != 32) return error.InvalidPngChromaticitiesSize;
    var points: [4]Point = undefined;
    for (&points, 0..) |*p, i| p.* = .{ .x = try fixed.read(bytes[i * 8 ..][0..4]), .y = try fixed.read(bytes[i * 8 + 4 ..][0..4]) };
    return .{ .white = points[0], .red = points[1], .green = points[2], .blue = points[3] };
}
