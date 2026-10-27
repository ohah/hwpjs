//! Editable size policy shared by binary and XML writers.
pub const Patch = @import("document.zig").CharacterPropertyPatch;
pub fn effectsMatch(patch: Patch, flags: @import("character_effect_flags.zig").Flags) bool {
    inline for (.{ "emboss", "engrave", "superscript", "subscript" }) |name| {
        if (@field(patch, name)) |value| if (value != @field(flags, name)) return false;
    }
    return true;
}
pub fn hasEffects(patch: Patch) bool {
    return patch.emboss != null or patch.engrave != null or patch.superscript != null or patch.subscript != null;
}
pub fn validate(patch: Patch) !void {
    if (patch.border_fill) |resource| try @import("border_fill_patch.zig").validate(resource);
    if (patch.shadow) |value| try @import("character_shadow.zig").validate(value);
    try @import("character_metric_patch.zig").validate(patch);
    if (patch.size) |size| if (size < 0 or size > 409600) return error.InvalidCharacterSize;
    if (patch.underline_color) |color| try @import("rgb_color.zig").validate(color);
    if (patch.strike_color) |color| try @import("rgb_color.zig").validate(color);
    if (patch.text_color) |color| try @import("rgb_color.zig").validate(color);
    if (patch.shade) |intent| _ = try @import("shade_color.zig").encodeHwp5(intent);
}
pub fn merge(previous: Patch, requested: Patch) Patch {
    const std = @import("std");
    var result = previous;
    inline for (@import("../reflection.zig").fields(Patch)) |field| {
        if (@field(requested, field.name)) |value| {
            if (comptime std.mem.eql(u8, field.name, "font_ids")) {
                result.font_ids = @import("character_fonts.zig").merge(previous.font_ids orelse @as(@import("character_fonts.zig").Values, @splat(null)), value);
            } else if (comptime std.mem.eql(u8, field.name, "border_fill")) {
                result.border_fill = @import("border_fill_patch.zig").merge(previous.border_fill orelse .{}, value);
            } else if (comptime std.mem.eql(u8, field.name, "shadow")) {
                result.shadow = @import("character_shadow.zig").merge(previous.shadow orelse .{}, value);
            } else if (comptime std.mem.eql(u8, field.name, "ratio") or std.mem.eql(u8, field.name, "char_spacing") or std.mem.eql(u8, field.name, "relative_size") or std.mem.eql(u8, field.name, "offset")) {
                @field(result, field.name) = @import("character_metric_patch.zig").merge(@field(previous, field.name) orelse @as(@import("character_metric_patch.zig").Values, @splat(null)), value);
            } else @field(result, field.name) = value;
        }
    }
    return result;
}

test "character property merge retains language edits and unrelated properties" {
    const std = @import("std");
    const first = merge(.{ .size = 1200, .text_color = 0x123456 }, .{ .font_ids = .{ 7, null, null, null, null, null, null } });
    const second = merge(first, .{ .font_ids = .{ null, 0, null, null, null, null, null }, .bold = false });
    try std.testing.expectEqualDeep(@as(?@import("character_fonts.zig").Values, .{ 7, 0, null, null, null, null, null }), second.font_ids);
    try std.testing.expectEqual(@as(?i32, 1200), second.size);
    try std.testing.expectEqual(@as(?u32, 0x123456), second.text_color);
    try std.testing.expectEqual(@as(?bool, false), second.bold);
    try std.testing.expectEqualDeep(second, merge(second, .{ .font_ids = @splat(null) }));
}
