//! Effective spacing selection; raw snapshots and unknown kinds stay unchanged.
const Spacing = @import("../../model/document.zig").ParagraphSpacing;
pub fn effective(shape: anytype) Spacing {
    if (shape.modern_spacing) |modern| {
        const kind = modern.attributes & 31;
        if (kind != 0) return .{ .kind = kind, .value = modern.value };
    }
    return .{ .kind = shape.legacy_spacing_kind, .value = shape.legacy_spacing };
}

test "HWP5 effective paragraph spacing keeps zero fallback and unknown kinds distinct" {
    const std = @import("std");
    const Shape = @import("paragraph_display_shapes.zig").Shape;
    var shape: Shape = .{ .id = 0, .alignment = 0, .left = 0, .right = 0, .indent = 0, .before = 0, .after = 0, .legacy_spacing_kind = 0, .legacy_spacing = 160, .modern_spacing = .{ .attributes = 0, .value = 0 } };
    try std.testing.expectEqual(@as(i32, 160), effective(shape).value);
    shape.legacy_spacing = 0;
    try std.testing.expectEqual(@as(i32, 0), effective(shape).value);
    shape.modern_spacing = .{ .attributes = 3, .value = 1000 };
    try std.testing.expectEqual(@as(u32, 3), effective(shape).kind);
    shape.modern_spacing = .{ .attributes = 7, .value = 0 };
    try std.testing.expectEqual(@as(u32, 7), effective(shape).kind);
}
