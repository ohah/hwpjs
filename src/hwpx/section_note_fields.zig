const std = @import("std");
const values = @import("xml_values.zig");
const line_style = @import("line_style_values.zig");

pub const NoteKind = enum(u8) { foot, end };
pub const ChildKind = enum(u8) { auto_num_format, note_line, note_spacing, numbering, placement };
pub const Field = enum(u8) {
    number_type,
    user_char,
    prefix_char,
    suffix_char,
    supscript,
    line_length,
    line_type,
    line_width,
    line_color,
    between_notes,
    below_line,
    above_line,
    numbering_type,
    new_num,
    placement_place,
    beneath_text,
};

const ValueKind = enum { text, boolean, unsigned, signed, positive, number_type, line_type, width, color, numbering_type, placement };
pub const Descriptor = struct { name: []const u8, child_kind: ChildKind, value_kind: ValueKind };
pub const descriptors = [_]Descriptor{
    .{ .name = "type", .child_kind = .auto_num_format, .value_kind = .number_type },
    .{ .name = "userChar", .child_kind = .auto_num_format, .value_kind = .text },
    .{ .name = "prefixChar", .child_kind = .auto_num_format, .value_kind = .text },
    .{ .name = "suffixChar", .child_kind = .auto_num_format, .value_kind = .text },
    .{ .name = "supscript", .child_kind = .auto_num_format, .value_kind = .boolean },
    .{ .name = "length", .child_kind = .note_line, .value_kind = .signed },
    .{ .name = "type", .child_kind = .note_line, .value_kind = .line_type },
    .{ .name = "width", .child_kind = .note_line, .value_kind = .width },
    .{ .name = "color", .child_kind = .note_line, .value_kind = .color },
    .{ .name = "betweenNotes", .child_kind = .note_spacing, .value_kind = .unsigned },
    .{ .name = "belowLine", .child_kind = .note_spacing, .value_kind = .unsigned },
    .{ .name = "aboveLine", .child_kind = .note_spacing, .value_kind = .unsigned },
    .{ .name = "type", .child_kind = .numbering, .value_kind = .numbering_type },
    .{ .name = "newNum", .child_kind = .numbering, .value_kind = .positive },
    .{ .name = "place", .child_kind = .placement, .value_kind = .placement },
    .{ .name = "beneathText", .child_kind = .placement, .value_kind = .boolean },
};
comptime {
    if (descriptors.len != @typeInfo(Field).@"enum".fields.len) @compileError("note field/descriptor mismatch");
}

const number_types = [_][]const u8{
    "DIGIT",                 "CIRCLED_DIGIT",       "ROMAN_CAPITAL",     "ROMAN_SMALL",             "LATIN_CAPITAL",        "LATIN_SMALL",
    "CIRCLED_LATIN_CAPITAL", "CIRCLED_LATIN_SMALL", "HANGUL_SYLLABLE",   "CIRCLED_HANGUL_SYLLABLE", "HANGUL_JAMO",          "CIRCLED_HANGUL_JAMO",
    "HANGUL_PHONETIC",       "IDEOGRAPH",           "CIRCLED_IDEOGRAPH", "DECAGON_CIRCLE",          "DECAGON_CIRCLE_HANJA", "SYMBOL",
    "USER_CHAR",             "SYMBOL2",             "IMAGE",             "2DIGIT",
};

pub const Diagnostics = struct { unknown_enums: usize = 0, noncanonical_colors: usize = 0 };

fn known(raw: []const u8, allowed: []const []const u8) bool {
    const normalized = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |name| if (std.mem.eql(u8, normalized, name)) return true;
    return false;
}

pub fn canonicalColor(raw: []const u8) bool {
    return line_style.canonicalColor(raw);
}

pub fn validate(kind: ChildKind, note_kind: NoteKind, field: Field, raw: []const u8, diagnostics: *Diagnostics) !void {
    const descriptor = descriptors[@intFromEnum(field)];
    if (descriptor.child_kind != kind) return error.InvalidNoteField;
    switch (descriptor.value_kind) {
        .text => {},
        .boolean => _ = try values.boolean(raw),
        .unsigned => _ = try values.unsigned32(raw),
        .signed => _ = try values.signed32(raw),
        .positive => {
            if (try values.unsigned32(raw) == 0) return error.InvalidPositiveInteger;
        },
        .number_type => diagnostics.unknown_enums += @intFromBool(!known(raw, &number_types)),
        .line_type => diagnostics.unknown_enums += @intFromBool(!line_style.knownType(raw)),
        .width => diagnostics.unknown_enums += @intFromBool(!line_style.knownWidth(raw)),
        .color => diagnostics.noncanonical_colors += @intFromBool(!canonicalColor(raw)),
        .numbering_type => {
            const allowed: []const []const u8 = if (note_kind == .foot) &.{ "CONTINUOUS", "ON_SECTION", "ON_PAGE" } else &.{ "CONTINUOUS", "ON_SECTION" };
            diagnostics.unknown_enums += @intFromBool(!known(raw, allowed));
        },
        .placement => {
            const allowed: []const []const u8 = if (note_kind == .foot) &.{ "EACH_COLUMN", "MERGED_COLUMN", "RIGHT_MOST_COLUMN" } else &.{ "END_OF_DOCUMENT", "END_OF_SECTION" };
            diagnostics.unknown_enums += @intFromBool(!known(raw, allowed));
        },
    }
}
