const std = @import("std");

pub const Angles = struct {
    start_degrees: f32,
    sweep_degrees: f32,
};

pub fn resolve(start_degrees: f32, sweep_degrees: f32) ?Angles {
    if (!std.math.isFinite(start_degrees) or start_degrees < 0 or !std.math.isFinite(sweep_degrees)) return null;
    return .{
        .start_degrees = @mod(start_degrees, 360.0),
        .sweep_degrees = std.math.clamp(sweep_degrees, -360.0, 360.0),
    };
}

test "EMF+ arc angles apply start modulo and signed sweep clamp" {
    try std.testing.expectEqual(Angles{ .start_degrees = 90, .sweep_degrees = -360 }, resolve(450, -720).?);
    try std.testing.expectEqual(Angles{ .start_degrees = 0, .sweep_degrees = 360 }, resolve(360, 720).?);
    try std.testing.expectEqual(Angles{ .start_degrees = 270, .sweep_degrees = 45 }, resolve(270, 45).?);
    const signed_zero = resolve(-0.0, -0.0).?;
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(signed_zero.start_degrees)));
    try std.testing.expectEqual(@as(u32, 0x8000_0000), @as(u32, @bitCast(signed_zero.sweep_degrees)));
}

test "EMF+ arc angles keep non-finite interpretation explicit" {
    try std.testing.expect(resolve(-0.001, 1) == null);
    try std.testing.expect(resolve(std.math.nan(f32), 1) == null);
    try std.testing.expect(resolve(std.math.inf(f32), 1) == null);
    try std.testing.expect(resolve(1, std.math.nan(f32)) == null);
    try std.testing.expect(resolve(1, -std.math.inf(f32)) == null);
}
