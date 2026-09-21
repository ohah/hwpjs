const std = @import("std");
const unit_type = @import("emf_plus_unit_type.zig");

pub fn toPixels(unit: unit_type.UnitType, dpi: u32) ?f32 {
    const resolution: f32 = @floatFromInt(dpi);
    return switch (unit) {
        .world, .display => null,
        .pixel => 1,
        .point => resolution / 72.0,
        .inch => resolution,
        .document => resolution / 300.0,
        .millimeter => resolution / 25.4,
    };
}

test "EMF+ unit scale converts physical units and defers context-sensitive units" {
    try std.testing.expect(toPixels(.world, 96) == null);
    try std.testing.expect(toPixels(.display, 96) == null);
    try std.testing.expectEqual(@as(f32, 1), toPixels(.pixel, 0).?);
    try std.testing.expectEqual(@as(f32, 2), toPixels(.point, 144).?);
    try std.testing.expectEqual(@as(f32, 96), toPixels(.inch, 96).?);
    try std.testing.expectEqual(@as(f32, 2), toPixels(.document, 600).?);
    try std.testing.expectEqual(@as(f32, 10), toPixels(.millimeter, 254).?);
}
