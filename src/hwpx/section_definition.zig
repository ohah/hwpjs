const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attributes = @import("xml_part_attributes.zig");
const values = @import("xml_values.zig");

pub const Field = enum(u8) {
    id,
    text_direction,
    space_columns,
    tab_stop,
    tab_stop_val,
    tab_stop_unit,
    outline_shape_id_ref,
    memo_shape_id_ref,
    text_vertical_width_head,
    master_page_count,
};
pub const field_names = [_][]const u8{
    "id",          "textDirection",     "spaceColumns",   "tabStop",               "tabStopVal",
    "tabStopUnit", "outlineShapeIDRef", "memoShapeIDRef", "textVerticalWidthHead", "masterPageCnt",
};

pub const Child = enum(u8) {
    start_num,
    grid,
    visibility,
    line_number_shape,
    page_pr,
    foot_note_pr,
    end_note_pr,
    page_border_fill,
    master_page,
    parameter_set,
    presentation,
    meta_tag,
};
pub const child_names = [_][]const u8{
    "startNum",  "grid",           "visibility", "lineNumberShape", "pagePr",       "footNotePr",
    "endNotePr", "pageBorderFill", "masterPage", "parameterset",    "presentation", "metaTag",
};

comptime {
    if (field_names.len != std.meta.fields(Field).len or child_names.len != std.meta.fields(Child).len) @compileError("section definition field/child list mismatch");
}

pub const Options = struct {
    max_definitions: usize = 100_000,
    max_direct_children: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
};

pub const Definition = struct {
    section_ordinal: usize,
    element_index: usize,
    raw: [field_names.len]?[]u8 = @splat(null),
    child_counts: [child_names.len]usize = @splat(0),
    other_paragraph_children: usize = 0,
    foreign_children: usize = 0,
    other_attributes: usize = 0,
    unknown_enums: usize = 0,

    pub fn get(self: *const Definition, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }

    pub fn childCount(self: *const Definition, child: Child) usize {
        return self.child_counts[@intFromEnum(child)];
    }

    pub fn deinit(self: *Definition, a: std.mem.Allocator) void {
        for (self.raw) |entry| if (entry) |value| a.free(value);
        self.* = undefined;
    }
};

pub const Report = struct {
    definitions: []Definition,
    sections: usize,
    sections_without_definition: usize,
    direct_children: usize,
    other_paragraph_children: usize,
    foreign_children: usize,
    other_attributes: usize,
    unknown_enums: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.definitions) |*definition| definition.deinit(a);
        a.free(self.definitions);
        self.* = undefined;
    }
};

fn knownEnum(raw: []const u8, allowed: []const []const u8) bool {
    const normalized = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |candidate| if (std.mem.eql(u8, normalized, candidate)) return true;
    return false;
}

fn validate(definition: *Definition, field: Field, raw: []const u8) !void {
    switch (field) {
        .id => {},
        .text_direction => if (!knownEnum(raw, &.{ "HORIZONTAL", "VERTICAL", "VERTICALALL" })) {
            definition.unknown_enums += 1;
        },
        .tab_stop_unit => if (!knownEnum(raw, &.{ "CHAR", "HWPUNIT" })) {
            definition.unknown_enums += 1;
        },
        .space_columns, .tab_stop, .tab_stop_val => _ = try values.signed32(raw),
        .outline_shape_id_ref, .memo_shape_id_ref, .master_page_count => _ = try values.unsigned32(raw),
        .text_vertical_width_head => _ = try values.boolean(raw),
    }
}

fn readAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, max_bytes: usize, definition: *Definition) !void {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var known = false;
        if (name.prefix == null) {
            for (field_names) |candidate| if (name.local.equals(candidate, false)) {
                known = true;
                break;
            };
        }
        definition.other_attributes += @intFromBool(!known);
    }
    var raw: [field_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &field_names, &raw);
    inline for (field_names, 0..) |_, field_index| {
        if (raw[field_index]) |value| {
            const normalized = try value.toUtf8(a, max_bytes);
            definition.raw[field_index] = normalized;
            try validate(definition, @enumFromInt(field_index), normalized);
        }
    }
}

fn readChildren(tree: *const part_tree.Tree, element_index: usize, definition: *Definition, report: *Report, options: Options) !void {
    var cursor = tree.elements[element_index].first_child;
    while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
        if (report.direct_children == options.max_direct_children) return error.LimitExceeded;
        report.direct_children += 1;
        const child = tree.elements[child_index];
        if (std.mem.eql(u8, child.name.uri, document_xml.paragraph_uri)) {
            var known = false;
            for (child_names, 0..) |candidate, slot| if (child.name.local.equals(candidate, false)) {
                definition.child_counts[slot] += 1;
                known = true;
                break;
            };
            if (!known) {
                definition.other_paragraph_children += 1;
                report.other_paragraph_children += 1;
            }
        } else {
            definition.foreign_children += 1;
            report.foreign_children += 1;
        }
    }
}

/// Direct 2011 secPr scalar/child inventory. The original trees retain every
/// unknown field and child; this report does not choose conditional branches or
/// infer the effective section layout or masterPageCnt equality.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var definitions: std.ArrayList(Definition) = .empty;
    errdefer {
        for (definitions.items) |*definition| definition.deinit(a);
        definitions.deinit(a);
    }
    var report: Report = .{
        .definitions = undefined,
        .sections = sections.len,
        .sections_without_definition = 0,
        .direct_children = 0,
        .other_paragraph_children = 0,
        .foreign_children = 0,
        .other_attributes = 0,
        .unknown_enums = 0,
    };
    for (sections, 0..) |*tree, section_ordinal| {
        if (tree.part_kind != .section or tree.elements.len == 0 or tree.section_ordinal != section_ordinal) return error.InvalidPartKind;
        const before = definitions.items.len;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(document_xml.paragraph_uri, "secPr")) continue;
            if (definitions.items.len == options.max_definitions) return error.LimitExceeded;
            var definition: Definition = .{ .section_ordinal = section_ordinal, .element_index = index };
            errdefer definition.deinit(a);
            try readAttributes(a, tree, index, options.max_attribute_bytes, &definition);
            try readChildren(tree, index, &definition, &report, options);
            report.other_attributes += definition.other_attributes;
            report.unknown_enums += definition.unknown_enums;
            try definitions.append(a, definition);
        }
        if (before == definitions.items.len) report.sections_without_definition += 1;
    }
    report.definitions = try definitions.toOwnedSlice(a);
    return report;
}
