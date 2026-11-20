//! Missing policies require explicit typed input; existing policies are never reset.
const std = @import("std");
const editor = @import("editor_session.zig");
const hp = @import("document_xml.zig").paragraph_uri;
pub const Shape = struct {
    format: @import("note_create_profile.zig").Format,
    line_length: i32,
    line_type: []const u8,
    line_width: []const u8,
    line_color: []const u8,
    between_notes: u32,
    below_line: u32,
    above_line: u32,
    start: u32,
    place: []const u8,
    beneath_text: bool,
};
pub const Initial = struct { section: usize, shape: Shape };
pub fn serialize(a: std.mem.Allocator, kind: @import("note_bodies.zig").Kind, shape: Shape, limit: usize) ![]u8 {
    const fields = @import("section_note_fields.zig");
    if (shape.start == 0 or shape.start > std.math.maxInt(i32)) return error.InvalidNoteCreateNumber;
    const names = [_][]const u8{ shape.format.number_type, shape.format.user_char, shape.format.prefix_char, shape.format.suffix_char, shape.line_type, shape.line_width, shape.line_color, shape.place };
    const field_keys = [_]fields.Field{ .number_type, .user_char, .prefix_char, .suffix_char, .line_type, .line_width, .line_color, .placement_place };
    const child_keys = [_]fields.ChildKind{ .auto_num_format, .auto_num_format, .auto_num_format, .auto_num_format, .note_line, .note_line, .note_line, .placement };
    var encoded: [names.len][]u8 = undefined;
    var ready: usize = 0;
    defer for (encoded[0..ready]) |value| a.free(value);
    for (names, field_keys, child_keys, &encoded) |value, key, child, *output| {
        var diagnostics: fields.Diagnostics = .{};
        try fields.validate(child, if (kind == .foot) .foot else .end, key, value, &diagnostics);
        if (diagnostics.unknown_enums != 0 or diagnostics.noncanonical_colors != 0) return error.UnsupportedNoteCreatePolicy;
        output.* = try @import("../xml/attribute_writer.zig").encode(a, value, limit);
        ready += 1;
    }
    const tag = if (kind == .foot) "footNotePr" else "endNotePr";
    const bytes = try std.fmt.allocPrint(a, "<hp:{s} xmlns:hp=\"{s}\"><hp:autoNumFormat type=\"{s}\" userChar=\"{s}\" prefixChar=\"{s}\" suffixChar=\"{s}\" supscript=\"{d}\"/><hp:noteLine length=\"{d}\" type=\"{s}\" width=\"{s}\" color=\"{s}\"/><hp:noteSpacing betweenNotes=\"{d}\" belowLine=\"{d}\" aboveLine=\"{d}\"/><hp:numbering type=\"CONTINUOUS\" newNum=\"{d}\"/><hp:placement place=\"{s}\" beneathText=\"{d}\"/></hp:{s}>", .{ tag, hp, encoded[0], encoded[1], encoded[2], encoded[3], @intFromBool(shape.format.superscript), shape.line_length, encoded[4], encoded[5], encoded[6], shape.between_notes, shape.below_line, shape.above_line, shape.start, encoded[7], @intFromBool(shape.beneath_text), tag });
    errdefer a.free(bytes);
    if (bytes.len > limit) return error.LimitExceeded;
    return bytes;
}
pub fn install(a: std.mem.Allocator, session: *const editor.Session, before: []const u8, kind: @import("note_bodies.zig").Kind, initial: []const Initial) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var supplied = std.AutoHashMap(usize, Shape).init(scratch);
    for (initial) |item| {
        if (item.section >= session.sections.len or supplied.contains(item.section)) return error.InvalidNoteCreatePolicy;
        try supplied.put(item.section, item.shape);
    }
    var replacements: std.ArrayList(@import("../zip/replace_writer.zig").Replacement) = .empty;
    var protection = try @import("note_source_protection.zig").Context.init(session);
    defer protection.deinit();
    const tag = if (kind == .foot) "footNotePr" else "endNotePr";
    for (session.sections, 0..) |section, ordinal| {
        const tree = &section.tree;
        var present = false;
        var properties: ?usize = null;
        for (tree.elements, 0..) |element, node| {
            if (!element.is(hp, "secPr")) continue;
            const run = element.parent orelse return error.InvalidNoteCreatePolicy;
            const p = tree.elements[run].parent orelse return error.InvalidNoteCreatePolicy;
            if (!tree.elements[run].is(hp, "run") or !tree.elements[p].is(hp, "p") or tree.elements[p].parent != 0 or properties != null) return error.InvalidNoteCreatePolicy;
            properties = node;
        }
        if (properties) |owner_node| for (tree.elements) |element| {
            if (element.is(hp, tag) and element.parent == owner_node) present = true;
        };
        if (present) {
            if (supplied.contains(ordinal)) return error.ExistingNotePolicyMustBePreserved;
            continue;
        }
        const shape = supplied.get(ordinal) orelse return error.MissingExplicitNoteCreatePolicy;
        const node = properties orelse return error.MissingNoteCreateSectionProperties;
        const end_tag = tree.elements[node].end_tag orelse return error.InvalidNoteCreatePolicy;
        try protection.insertion(ordinal, node, end_tag.start, end_tag.start);
        const xml = try serialize(scratch, kind, shape, session.options.max_xml_bytes);
        const changed = try @import("xml_source_writer.zig").write(scratch, tree.source, &.{.{ .start = end_tag.start, .end = end_tag.start, .text = "", .serialized_xml = xml }}, session.options.max_xml_bytes);
        try replacements.append(scratch, .{ .entry_index = section.entry_index, .bytes = changed });
    }
    return @import("../zip/replace_writer.zig").write(a, before, replacements.items, .{ .max_output_bytes = session.options.max_output_bytes });
}
