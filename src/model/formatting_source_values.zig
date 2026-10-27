//! Scalar source observations shared by format adapters; no document/cache owner.
const std = @import("std");
const p = @import("formatting_projection.zig");
pub fn eq(l: []const u8, r: []const u8) bool {
    return std.mem.eql(u8, l, r);
}
pub fn color(raw: u32) p.Observation {
    if (raw > 0xffffff) return p.unknown("AutoOrUnknownSourceColor", "AutoColorIntentUnavailable");
    return p.known(p.integer(@import("rgb_color.zig").hwp5(raw)), true, null, "RGB24");
}
pub fn shade(a: std.mem.Allocator, v: @import("shade_color.zig").Value) !p.Observation {
    if (v == .unknown) return p.unknown("UnknownSourceShade", "UnknownSourceShade");
    var value = p.map(a);
    try p.put(a, &value, "kind", try p.text(a, if (v == .none) "none" else "color"));
    if (v == .color) try p.put(a, &value, "color", p.integer(v.color));
    return p.known(value, true, null, null);
}
pub fn effect(a: std.mem.Allocator, first: bool, second: bool, none: []const u8, one: []const u8, two: []const u8) !p.Observation {
    if (first and second) return p.unknown("ConflictingSourceEffects", "ConflictingSourceEffects");
    return p.known(try p.text(a, if (first) one else if (second) two else none), true, null, null);
}
pub const languages = [_][]const u8{ "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" };
pub fn fontIds(a: std.mem.Allocator, ids: @import("character_fonts.zig").Values) !p.Observation {
    var value = p.map(a);
    for (ids, languages) |id, language| try p.put(a, &value, language, p.integer(id orelse return p.unknown("MissingFontLanguage", "MissingSourceField")));
    return p.known(value, true, null, "language-scoped-id");
}
pub fn fontNames(a: std.mem.Allocator, ids: @import("character_fonts.zig").Values, faces: []const @import("font_face_value.zig").Value) !p.Observation {
    var value = p.map(a);
    for (ids, languages, 0..) |id, language, index| {
        const selected = id orelse return p.unknown("MissingFontLanguage", "MissingSourceField");
        var name: ?[]const u8 = null;
        for (faces) |face| if (@backingInt(face.language) == index and face.id == selected) {
            name = face.name;
            break;
        };
        try p.put(a, &value, language, try p.text(a, name orelse return p.unknown("MissingFontName", "MissingSourceField")));
    }
    return p.known(value, true, null, null);
}
pub fn metrics(a: std.mem.Allocator, values: anytype, comptime field: []const u8) !p.Observation {
    var value = p.map(a);
    for (values, languages) |v, language| try p.put(a, &value, language, p.integer(v));
    const range = comptime @import("character_metric_patch.zig").bounds(field);
    var writable = true;
    for (values) |v| if (v < range.low or v > range.high) {
        writable = false;
    };
    return p.known(value, writable, if (writable) null else "UnsupportedSourceMetricValue", "raw-source-metric");
}

pub fn fontField(a: std.mem.Allocator, ids: @import("character_fonts.zig").Values, faces: ?[]const @import("font_face_value.zig").Value, field: []const u8) !p.Observation {
    inline for (.{ "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" }, 0..) |language, index| {
        if (eq(field, "character.fonts." ++ language ++ ".id")) return if (ids[index]) |id| p.known(p.integer(id), true, null, "language-scoped-id") else p.unknown("MissingFontLanguage", "MissingSourceField");
        if (eq(field, "character.fonts." ++ language ++ ".name")) {
            const id = ids[index] orelse return p.unknown("MissingFontLanguage", "MissingSourceField");
            for (faces orelse return error.MissingFontProjection) |face| if (@backingInt(face.language) == index and face.id == id) {
                const name = face.name orelse return p.unknown("MissingFontName", "MissingSourceField");
                return p.known(try p.text(a, name), true, null, null);
            };
            return error.InvalidFontId;
        }
    }
    return error.UnknownFormattingField;
}

pub fn needsFontValidation(patch: @import("formatting_patch.zig").Patch) bool {
    if (patch.character.font_ids != null) return true;
    for (patch.fonts) |font| if (font) |value| switch (value) {
        .id => return true,
        .name => {},
    };
    return false;
}
pub fn validateFonts(patch: @import("formatting_patch.zig").Patch, faces: []const @import("font_face_value.zig").Value) !void {
    var ids = patch.character.font_ids orelse @as(@import("character_fonts.zig").Values, @splat(null));
    for (patch.fonts, 0..) |font, index| if (font) |value| switch (value) {
        .id => |id| ids[index] = id,
        .name => {},
    };
    for (ids, 0..) |id, index| if (id) |selected| {
        var found = false;
        for (faces) |face| if (@backingInt(face.language) == index and face.id == selected) {
            found = true;
            break;
        };
        if (!found) return error.InvalidFontId;
    };
}
