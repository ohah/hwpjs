const argb = @import("emf_plus_argb.zig");
const record_flags = @import("emf_plus_record_flags.zig");

pub const BrushIdOrColor = union(enum) {
    brush_id: u6,
    color: argb.Argb,
};

pub fn parse(raw: u32, flags: u16) !BrushIdOrColor {
    if (record_flags.isSolidColor(flags)) return .{ .color = argb.Argb.fromRaw(raw) };
    if (raw > 63) return error.InvalidEmfPlusBrushId;
    return .{ .brush_id = @intCast(raw) };
}

test "EMF+ BrushIdOrColor distinguishes exact table IDs and literal ARGB" {
    const std = @import("std");
    try std.testing.expectEqual(@as(u6, 0), (try parse(0, 0)).brush_id);
    try std.testing.expectEqual(@as(u6, 63), (try parse(63, 0x7f00)).brush_id);
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(64, 0));
    try std.testing.expectError(error.InvalidEmfPlusBrushId, parse(0xffffffff, 0));
    const color = (try parse(0x44332211, 0x8000)).color;
    try std.testing.expectEqual(@as(u32, 0x44332211), color.raw());
    try std.testing.expectEqual(@as(u8, 0x11), color.blue);
    try std.testing.expectEqual(@as(u8, 0x44), color.alpha);
}
