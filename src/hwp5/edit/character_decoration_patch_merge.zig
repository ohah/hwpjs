//! Compose semantic edits against current state, retaining immutable provenance.
const Patch = @import("../../model/document.zig").CharacterPropertyPatch;
const Shape = @import("character_display_shapes.zig").Shape;
const compat = @import("character_decoration_compat.zig");

pub fn merge(source: Shape, current: Shape, previous: Patch, requested: Patch) !Patch {
    const source_legacy = compat.legacyStrike(source.underline_kind_raw, source.strike_kind_raw);
    const current_legacy = compat.legacyStrike(current.underline_kind_raw, current.strike_kind_raw);
    if (requested.strike_color != null) {
        if (current.strike_kind_raw > 1) return error.UnsupportedCharacterStrikeKind;
        if (!current_legacy and current.strike_color_raw == null and !(source_legacy and requested.strike_enabled == true))
            return error.MissingCharacterStrikeColorField;
    }
    if (source_legacy and requested.strike_color != null and requested.underline_color != null and requested.strike_color.? != requested.underline_color.?)
        return error.ConflictingCharacterDecorationColors;
    if (current_legacy and requested.strike_enabled != false) {
        const changes_color = if (requested.underline_color) |color| @import("../../model/rgb_color.zig").hwp5(color) != current.underline_color_raw else false;
        if (changes_color or (requested.underline_kind != null and requested.underline_kind.? != .none)) return error.UnsupportedLegacyCharacterDecorations;
    }
    var result = @import("../../model/character_properties.zig").merge(previous, requested);
    if (source_legacy) {
        if (current_legacy and result.strike_enabled != false and requested.underline_color != null)
            result.underline_color = previous.underline_color;
        if (requested.strike_enabled == true and result.underline_kind != null and result.underline_kind.? != .none)
            return error.UnsupportedLegacyCharacterDecorations;
        // Explicitly disabling the strike permits the next underline-color edit
        // to own the shared slot; an older strike intent must not override it.
        if (result.strike_enabled == false and requested.underline_color != null and requested.strike_color == null)
            result.strike_color = null;
        // Restoring this same legacy strike reuses the slot's current color,
        // without adding an independent color field or changing the version.
        if (requested.strike_enabled == true and current.underline_kind_raw == 0 and current.strike_kind_raw == 0) {
            if (requested.strike_color == null and result.underline_color != null) result.strike_color = result.underline_color;
            result.underline_color = null;
        }
    }
    return result;
}

test "legacy decoration merge keeps same current color as a no-op inside another property edit" {
    const std = @import("std");
    const source: Shape = .{ .id = 9, .height = 1000, .bold = false, .italic = false, .underline_kind_raw = 2 };
    var current = source;
    current.underline_color_raw = 0x563412;
    const previous: Patch = .{ .strike_color = 0x123456 };
    try std.testing.expectEqualDeep(Patch{ .strike_color = 0x123456, .bold = true }, try merge(source, current, previous, .{ .underline_color = 0x123456, .bold = true }));
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, merge(source, current, previous, .{ .underline_color = 0 }));
}

test "legacy decoration merge checks current field absence and preserves independent colors" {
    const std = @import("std");
    const source: Shape = .{ .id = 9, .height = 1000, .bold = false, .italic = false, .underline_kind_raw = 2 };
    var current = source;
    current.underline_kind_raw = 0;
    const previous: Patch = .{ .strike_color = 0x123456, .strike_enabled = false };
    try std.testing.expectError(error.MissingCharacterStrikeColorField, merge(source, current, previous, .{ .strike_color = 0xabcdef }));
    try std.testing.expectEqualDeep(Patch{ .strike_enabled = false, .underline_color = 0xabcdef }, try merge(source, current, previous, .{ .underline_color = 0xabcdef }));
    current.underline_kind_raw = 1;
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, merge(source, current, .{ .strike_enabled = false, .underline_kind = .bottom }, .{ .strike_enabled = true }));
    var modern = source;
    modern.underline_kind_raw = 1;
    modern.strike_kind_raw = 1;
    modern.strike_color_raw = 0;
    try std.testing.expectEqualDeep(Patch{ .strike_color = 0x123456, .underline_color = 0xabcdef }, try merge(modern, modern, .{ .strike_color = 0x123456 }, .{ .underline_color = 0xabcdef }));
}
