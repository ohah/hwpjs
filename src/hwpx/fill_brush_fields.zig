const std = @import("std");
const values = @import("xml_values.zig");

pub const NodeKind = enum(u8) { win_brush, gradation, img_brush, color, image };
pub const Field = enum(u8) {
    face_color,
    hatch_color,
    hatch_style,
    win_alpha,
    gradation_type,
    angle,
    center_x,
    center_y,
    step,
    color_num,
    step_center,
    gradation_alpha,
    image_mode,
    color_value,
    binary_item_id_ref,
    bright,
    contrast,
    image_effect,
    image_alpha,
};
const ValueKind = enum { color, hatch_style, float, gradation_type, signed, unsigned, image_mode, text, image_effect };
pub const Descriptor = struct { node: NodeKind, name: []const u8, value_kind: ValueKind };
pub const descriptors = [_]Descriptor{
    .{ .node = .win_brush, .name = "faceColor", .value_kind = .color },
    .{ .node = .win_brush, .name = "hatchColor", .value_kind = .color },
    .{ .node = .win_brush, .name = "hatchStyle", .value_kind = .hatch_style },
    .{ .node = .win_brush, .name = "alpha", .value_kind = .float },
    .{ .node = .gradation, .name = "type", .value_kind = .gradation_type },
    .{ .node = .gradation, .name = "angle", .value_kind = .signed },
    .{ .node = .gradation, .name = "centerX", .value_kind = .signed },
    .{ .node = .gradation, .name = "centerY", .value_kind = .signed },
    .{ .node = .gradation, .name = "step", .value_kind = .signed },
    .{ .node = .gradation, .name = "colorNum", .value_kind = .unsigned },
    .{ .node = .gradation, .name = "stepCenter", .value_kind = .signed },
    .{ .node = .gradation, .name = "alpha", .value_kind = .float },
    .{ .node = .img_brush, .name = "mode", .value_kind = .image_mode },
    .{ .node = .color, .name = "value", .value_kind = .color },
    .{ .node = .image, .name = "binaryItemIDRef", .value_kind = .text },
    .{ .node = .image, .name = "bright", .value_kind = .signed },
    .{ .node = .image, .name = "contrast", .value_kind = .signed },
    .{ .node = .image, .name = "effect", .value_kind = .image_effect },
    .{ .node = .image, .name = "alpha", .value_kind = .float },
};
comptime {
    if (descriptors.len != @typeInfo(Field).@"enum".fields.len) @compileError("fill brush field/descriptor mismatch");
}

const hatch_styles = [_][]const u8{ "HORIZONTAL", "VERTICAL", "BACK_SLASH", "SLASH", "CROSS", "CROSS_DIAGONAL" };
const gradation_types = [_][]const u8{ "LINEAR", "RADIAL", "CONICAL", "SQUARE" };
const image_modes = [_][]const u8{
    "TILE",          "TILE_HORZ_TOP", "TILE_HORZ_BOTTOM", "TILE_VERT_LEFT", "TILE_VERT_RIGHT", "TOTAL",     "CENTER",       "CENTER_TOP",
    "CENTER_BOTTOM", "LEFT_CENTER",   "LEFT_TOP",         "LEFT_BOTTOM",    "RIGHT_CENTER",    "RIGHT_TOP", "RIGHT_BOTTOM", "ZOOM",
};
const image_effects = [_][]const u8{ "REAL_PIC", "GRAY_SCALE", "BLACK_WHITE" };

pub const Diagnostics = struct { unknown_enums: usize = 0, non_six_hex_colors: usize = 0 };

fn known(raw: []const u8, names: []const []const u8) bool {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    for (names) |name| if (std.mem.eql(u8, value, name)) return true;
    return false;
}

pub fn validate(node: NodeKind, field: Field, raw: []const u8, diagnostics: *Diagnostics) !void {
    const descriptor = descriptors[@intFromEnum(field)];
    if (descriptor.node != node) return error.InvalidBrushField;
    switch (descriptor.value_kind) {
        .color => diagnostics.non_six_hex_colors += @intFromBool(!values.sixHexColor(raw)),
        .hatch_style => diagnostics.unknown_enums += @intFromBool(!known(raw, &hatch_styles)),
        .float => try values.floatLexical(raw),
        .gradation_type => diagnostics.unknown_enums += @intFromBool(!known(raw, &gradation_types)),
        .signed => _ = try values.signed32(raw),
        .unsigned => _ = try values.unsigned32(raw),
        .image_mode => diagnostics.unknown_enums += @intFromBool(!known(raw, &image_modes)),
        .text => {},
        .image_effect => diagnostics.unknown_enums += @intFromBool(!known(raw, &image_effects)),
    }
}
