const std = @import("std");
const unit_scale = @import("emf_plus_unit_scale.zig");
const unit_type = @import("emf_plus_unit_type.zig");

pub const Resolution = struct {
    x: u32,
    y: u32,
};

pub const DeviceScale = struct {
    x: f32,
    y: f32,
};

pub const PageTransform = struct {
    page_unit: unit_type.UnitType = .display,
    page_scale: f32 = 1,
    device_scale: ?DeviceScale = null,
};

pub fn build(unit: unit_type.UnitType, page_scale: f32, resolution: Resolution) PageTransform {
    const unit_x = unit_scale.toPixels(unit, resolution.x) orelse return .{
        .page_unit = unit,
        .page_scale = page_scale,
        .device_scale = null,
    };
    const unit_y = unit_scale.toPixels(unit, resolution.y).?;
    return .{
        .page_unit = unit,
        .page_scale = page_scale,
        .device_scale = .{
            .x = unit_x * page_scale,
            .y = unit_y * page_scale,
        },
    };
}

test "EMF+ page transform keeps world page and device spaces separate" {
    const value = build(.inch, 2, .{ .x = 96, .y = 120 });
    try std.testing.expectEqual(unit_type.UnitType.inch, value.page_unit);
    try std.testing.expectEqual(@as(f32, 2), value.page_scale);
    try std.testing.expectEqual(@as(f32, 192), value.device_scale.?.x);
    try std.testing.expectEqual(@as(f32, 240), value.device_scale.?.y);
}

test "EMF+ page transform preserves float semantics and unknown discouraged units" {
    const negative_zero = build(.pixel, -0.0, .{ .x = 0, .y = 0 });
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(negative_zero.page_scale)));
    try std.testing.expectEqual(@as(u32, 0x80000000), @as(u32, @bitCast(negative_zero.device_scale.?.x)));
    const infinity = build(.point, std.math.inf(f32), .{ .x = 72, .y = 144 });
    try std.testing.expect(std.math.isPositiveInf(infinity.device_scale.?.x));
    try std.testing.expect(std.math.isPositiveInf(infinity.device_scale.?.y));
    const display = build(.display, 3, .{ .x = 96, .y = 120 });
    try std.testing.expectEqual(unit_type.UnitType.display, display.page_unit);
    try std.testing.expectEqual(@as(f32, 3), display.page_scale);
    try std.testing.expect(display.device_scale == null);
}
