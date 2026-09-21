const compositing_mode = @import("emf_plus_compositing_mode.zig");
const compositing_quality = @import("emf_plus_compositing_quality.zig");
const interpolation_mode = @import("emf_plus_interpolation_mode.zig");
const pixel_offset_mode = @import("emf_plus_pixel_offset_mode.zig");
const smoothing_mode = @import("emf_plus_smoothing_mode.zig");
const text_rendering_hint = @import("emf_plus_text_rendering_hint.zig");

pub const RenderingOrigin = struct {
    x: i32,
    y: i32,
};

pub const AntiAliasMode = struct {
    smoothing: smoothing_mode.SmoothingMode,
    anti_alias: bool,
};

pub const State = struct {
    rendering_origin: ?RenderingOrigin = null,
    anti_alias_mode: ?AntiAliasMode = null,
    text_rendering_hint: ?text_rendering_hint.TextRenderingHint = null,
    text_contrast: ?u12 = null,
    interpolation_mode: ?interpolation_mode.InterpolationMode = null,
    pixel_offset_mode: ?pixel_offset_mode.PixelOffsetMode = null,
    compositing_mode: ?compositing_mode.CompositingMode = null,
    compositing_quality: ?compositing_quality.WireValue = null,
};

test "EMF+ property state distinguishes unobserved fields and preserves wire values" {
    const empty: State = .{};
    const std = @import("std");
    try std.testing.expect(empty.rendering_origin == null);
    try std.testing.expect(empty.compositing_quality == null);

    const value: State = .{
        .rendering_origin = .{ .x = std.math.minInt(i32), .y = std.math.maxInt(i32) },
        .anti_alias_mode = .{ .smoothing = .anti_alias_8x8, .anti_alias = true },
        .text_rendering_hint = .clear_type_grid_fit,
        .text_contrast = 2200,
        .interpolation_mode = .high_quality_bicubic,
        .pixel_offset_mode = .half,
        .compositing_mode = .source_copy,
        .compositing_quality = .{ .invalid_windows_default = 0xff },
    };
    try std.testing.expectEqual(std.math.minInt(i32), value.rendering_origin.?.x);
    try std.testing.expectEqual(smoothing_mode.SmoothingMode.anti_alias_8x8, value.anti_alias_mode.?.smoothing);
    try std.testing.expect(value.anti_alias_mode.?.anti_alias);
    try std.testing.expectEqual(text_rendering_hint.TextRenderingHint.clear_type_grid_fit, value.text_rendering_hint.?);
    try std.testing.expectEqual(@as(u12, 2200), value.text_contrast.?);
    try std.testing.expectEqual(interpolation_mode.InterpolationMode.high_quality_bicubic, value.interpolation_mode.?);
    try std.testing.expectEqual(pixel_offset_mode.PixelOffsetMode.half, value.pixel_offset_mode.?);
    try std.testing.expectEqual(compositing_mode.CompositingMode.source_copy, value.compositing_mode.?);
    try std.testing.expectEqual(@as(u8, 0xff), value.compositing_quality.?.invalid_windows_default);
}
