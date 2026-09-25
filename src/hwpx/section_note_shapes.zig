const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attributes = @import("xml_part_attributes.zig");
const fields = @import("section_note_fields.zig");

pub const NoteKind = fields.NoteKind;
pub const ChildKind = fields.ChildKind;
pub const Field = fields.Field;

pub const Options = struct {
    max_notes: usize = 100_000,
    max_children: usize = 600_000,
    max_direct_children: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
};

pub const Note = struct {
    kind: NoteKind,
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    child_counts: [@typeInfo(ChildKind).@"enum".fields.len]usize = @splat(0),
    other_attributes: usize = 0,
    direct_children: usize = 0,

    pub fn count(self: *const Note, kind: ChildKind) usize {
        return self.child_counts[@intFromEnum(kind)];
    }
};

pub const Child = struct {
    kind: ChildKind,
    note_index: usize,
    element_index: usize,
    raw: [fields.descriptors.len]?[]u8 = @splat(null),
    other_attributes: usize = 0,
    unknown_enums: usize = 0,
    noncanonical_colors: usize = 0,
    direct_children: usize = 0,

    pub fn get(self: *const Child, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }

    pub fn deinit(self: *Child, a: std.mem.Allocator) void {
        for (self.raw) |entry| if (entry) |bytes| a.free(bytes);
        self.* = undefined;
    }
};

pub const Report = struct {
    sections: usize,
    notes: []Note,
    children: []Child,
    foot_notes: usize,
    end_notes: usize,
    other_attributes: usize,
    unknown_enums: usize,
    noncanonical_colors: usize,
    direct_children: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.children) |*child| child.deinit(a);
        a.free(self.children);
        a.free(self.notes);
        self.* = undefined;
    }
};

fn noteKind(element: part_tree.Element) ?NoteKind {
    if (!std.mem.eql(u8, element.name.uri, document_xml.paragraph_uri)) return null;
    if (element.name.local.equals("footNotePr", false)) return .foot;
    if (element.name.local.equals("endNotePr", false)) return .end;
    return null;
}

fn childKind(element: part_tree.Element) ?ChildKind {
    if (!std.mem.eql(u8, element.name.uri, document_xml.paragraph_uri)) return null;
    if (element.name.local.equals("autoNumFormat", false)) return .auto_num_format;
    if (element.name.local.equals("noteLine", false)) return .note_line;
    if (element.name.local.equals("noteSpacing", false)) return .note_spacing;
    if (element.name.local.equals("numbering", false)) return .numbering;
    if (element.name.local.equals("placement", false)) return .placement;
    return null;
}

fn unknownAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize) !usize {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var count: usize = 0;
    for (tag.attributes) |attribute| count += @intFromBool(!(try xml.namespaces.isDeclaration(attribute.name)));
    return count;
}

fn readAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, options: Options, note_kind: NoteKind, child: *Child) !void {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) {
            for (fields.descriptors, 0..) |descriptor, slot| {
                if (descriptor.child_kind == child.kind and name.local.equals(descriptor.name, false)) {
                    selected = slot;
                    break;
                }
            }
        }
        if (selected) |slot| {
            const normalized = try attribute.value.toUtf8(a, options.max_attribute_bytes);
            child.raw[slot] = normalized;
            var diagnostics: fields.Diagnostics = .{};
            try fields.validate(child.kind, note_kind, @enumFromInt(slot), normalized, &diagnostics);
            child.unknown_enums += diagnostics.unknown_enums;
            child.noncanonical_colors += diagnostics.noncanonical_colors;
        } else child.other_attributes += 1;
    }
}

/// Observes only direct 2011 secPr foot/end note shapes and their direct
/// five child kinds. No XML defaults or page-layout semantics are applied.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var notes: std.ArrayList(Note) = .empty;
    errdefer notes.deinit(a);
    var children: std.ArrayList(Child) = .empty;
    errdefer {
        for (children.items) |*child| child.deinit(a);
        children.deinit(a);
    }
    var foot_notes: usize = 0;
    var end_notes: usize = 0;
    var other_attributes: usize = 0;
    var unknown_enums: usize = 0;
    var noncanonical_colors: usize = 0;
    var direct_children: usize = 0;
    for (sections, 0..) |*tree, section_ordinal| {
        if (tree.part_kind != .section or tree.elements.len == 0 or tree.section_ordinal != section_ordinal) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            const kind = noteKind(element) orelse continue;
            const parent_index = element.parent orelse continue;
            if (!tree.elements[parent_index].is(document_xml.paragraph_uri, "secPr")) continue;
            if (notes.items.len == options.max_notes) return error.LimitExceeded;
            const note_index = notes.items.len;
            const note: Note = .{ .kind = kind, .section_ordinal = section_ordinal, .element_index = index, .parent_element_index = parent_index, .other_attributes = try unknownAttributes(a, tree, index) };
            try notes.append(a, note);
            other_attributes += note.other_attributes;
            if (kind == .foot) foot_notes += 1 else end_notes += 1;
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
                if (direct_children == options.max_direct_children) return error.LimitExceeded;
                direct_children += 1;
                notes.items[note_index].direct_children += 1;
                const child_kind = childKind(tree.elements[child_index]) orelse continue;
                if (children.items.len == options.max_children) return error.LimitExceeded;
                var child: Child = .{ .kind = child_kind, .note_index = note_index, .element_index = child_index };
                errdefer child.deinit(a);
                try readAttributes(a, tree, child_index, options, kind, &child);
                var grandchild = tree.elements[child_index].first_child;
                while (grandchild) |grandchild_index| : (grandchild = tree.elements[grandchild_index].next_sibling) {
                    if (direct_children == options.max_direct_children) return error.LimitExceeded;
                    direct_children += 1;
                    child.direct_children += 1;
                }
                other_attributes += child.other_attributes;
                unknown_enums += child.unknown_enums;
                noncanonical_colors += child.noncanonical_colors;
                try children.append(a, child);
                notes.items[note_index].child_counts[@intFromEnum(child_kind)] += 1;
            }
        }
    }
    const owned_notes = try notes.toOwnedSlice(a);
    errdefer a.free(owned_notes);
    return .{
        .sections = sections.len,
        .notes = owned_notes,
        .children = try children.toOwnedSlice(a),
        .foot_notes = foot_notes,
        .end_notes = end_notes,
        .other_attributes = other_attributes,
        .unknown_enums = unknown_enums,
        .noncanonical_colors = noncanonical_colors,
        .direct_children = direct_children,
    };
}
