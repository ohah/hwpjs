const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const fields = @import("note_body_fields.zig");
const para_list = @import("para_list_attributes.zig");

pub const Options = struct {
    max_notes: usize = 200_000,
    max_sub_lists: usize = 200_000,
    max_paragraphs: usize = 4_000_000,
    max_direct_children: usize = 5_000_000,
    max_name_bytes: usize = 4096,
    max_attribute_bytes: usize = 4096,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};
pub const Kind = enum { foot, end };
pub const Note = struct {
    kind: Kind,
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    parent_uri: []const u8,
    parent_local_name: []const u8,
    raw_xml: []const u8,
    attributes: fields.Attributes,
    first_sub_list: usize,
    sub_list_count: usize = 0,
    direct_children: usize = 0,
    other_direct_children: usize = 0,
};
pub const SubList = struct {
    note_index: usize,
    section_ordinal: usize,
    element_index: usize,
    raw_xml: []const u8,
    attributes: para_list.Attributes,
    first_paragraph: usize,
    direct_paragraphs: usize = 0,
    other_direct_children: usize = 0,
};
pub const Paragraph = struct {
    sub_list_index: usize,
    section_ordinal: usize,
    element_index: usize,
    raw_xml: []const u8,
};
pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    notes: []const Note,
    sub_lists: []const SubList,
    paragraphs: []const Paragraph,
    foot_notes: usize,
    end_notes: usize,
    missing_sub_lists: usize,
    duplicate_sub_lists: usize,
    other_note_children: usize,
    other_sub_list_children: usize,
    other_attributes: usize,
    sub_list_unknown_enums: usize,
    direct_children: usize,
    owned_bytes: usize,
    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
const Budget = struct {
    max: usize,
    used: usize = 0,
    fn charge(self: *Budget, n: usize) !void {
        if (n > self.max -| self.used) return error.LimitExceeded;
        self.used += n;
    }
    pub fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]u8 {
        try self.charge(bytes.len);
        return a.dupe(u8, bytes);
    }
};
fn copyParaAttributes(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: *Budget) !para_list.Attributes {
    var temporary = try para_list.readTree(a, tree, index, max_attribute_bytes);
    defer temporary.deinit(a);
    var owned: para_list.Attributes = .{
        .unknown_enums = temporary.unknown_enums,
        .other_attributes = temporary.other_attributes,
    };
    for (temporary.raw, 0..) |raw, slot| if (raw) |value| {
        owned.raw[slot] = try budget.copy(owned_a, value);
    };
    return owned;
}
fn kindOf(element: tree_mod.Element) ?Kind {
    if (element.is(document_xml.paragraph_uri, "footNote")) return .foot;
    if (element.is(document_xml.paragraph_uri, "endNote")) return .end;
    return null;
}
fn ownedSpan(note: Note, note_source_start: usize, tree: *const tree_mod.Tree, index: usize) ![]const u8 {
    const element = tree.elements[index];
    if (element.start_tag.start < note_source_start or element.end > note_source_start + note.raw_xml.len) return error.InvalidNoteSourceSpan;
    return note.raw_xml[element.start_tag.start - note_source_start .. element.end - note_source_start];
}

/// Reads selected 2011 section foot/end-note bodies and their direct ParaListType
/// containers. Paragraph XML is a slice of the single owned note XML copy.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var notes: std.ArrayList(Note) = .empty;
    var sub_lists: std.ArrayList(SubList) = .empty;
    var paragraphs: std.ArrayList(Paragraph) = .empty;
    var result: Report = .{
        .arena = arena,
        .sections = sections.len,
        .notes = &.{},
        .sub_lists = &.{},
        .paragraphs = &.{},
        .foot_notes = 0,
        .end_notes = 0,
        .missing_sub_lists = 0,
        .duplicate_sub_lists = 0,
        .other_note_children = 0,
        .other_sub_list_children = 0,
        .other_attributes = 0,
        .sub_list_unknown_enums = 0,
        .direct_children = 0,
        .owned_bytes = 0,
    };
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            const kind = kindOf(element) orelse continue;
            const parent_index = element.parent orelse continue;
            if (notes.items.len >= options.max_notes) return error.LimitExceeded;
            const parent_name = tree.elements[parent_index].name;
            if (parent_name.uri.len > options.max_name_bytes) return error.LimitExceeded;
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_name_bytes);
            defer a.free(parent_local);
            var note: Note = .{
                .kind = kind,
                .section_ordinal = ordinal,
                .element_index = index,
                .parent_element_index = parent_index,
                .parent_uri = try budget.copy(owned_a, parent_name.uri),
                .parent_local_name = try budget.copy(owned_a, parent_local),
                .raw_xml = try budget.copy(owned_a, tree.sourceOf(index)),
                .attributes = try fields.read(a, owned_a, tree, index, options.max_attribute_bytes, &budget),
                .first_sub_list = sub_lists.items.len,
            };
            result.other_attributes += note.attributes.other_attributes;
            if (kind == .foot) result.foot_notes += 1 else result.end_notes += 1;
            var child = element.first_child;
            while (child) |child_index| : (child = tree.elements[child_index].next_sibling) {
                if (result.direct_children >= options.max_direct_children) return error.LimitExceeded;
                result.direct_children += 1;
                note.direct_children += 1;
                if (!tree.elements[child_index].is(document_xml.paragraph_uri, "subList")) {
                    note.other_direct_children += 1;
                    result.other_note_children += 1;
                    continue;
                }
                if (sub_lists.items.len >= options.max_sub_lists) return error.LimitExceeded;
                var list: SubList = .{
                    .note_index = notes.items.len,
                    .section_ordinal = ordinal,
                    .element_index = child_index,
                    .raw_xml = try ownedSpan(note, element.start_tag.start, tree, child_index),
                    .attributes = try copyParaAttributes(a, owned_a, tree, child_index, options.max_attribute_bytes, &budget),
                    .first_paragraph = paragraphs.items.len,
                };
                result.other_attributes += list.attributes.other_attributes;
                result.sub_list_unknown_enums += list.attributes.unknown_enums;
                var sub_child = tree.elements[child_index].first_child;
                while (sub_child) |paragraph_index| : (sub_child = tree.elements[paragraph_index].next_sibling) {
                    if (result.direct_children >= options.max_direct_children) return error.LimitExceeded;
                    result.direct_children += 1;
                    if (!tree.elements[paragraph_index].is(document_xml.paragraph_uri, "p")) {
                        list.other_direct_children += 1;
                        result.other_sub_list_children += 1;
                        continue;
                    }
                    if (paragraphs.items.len >= options.max_paragraphs) return error.LimitExceeded;
                    try paragraphs.append(owned_a, .{
                        .sub_list_index = sub_lists.items.len,
                        .section_ordinal = ordinal,
                        .element_index = paragraph_index,
                        .raw_xml = try ownedSpan(note, element.start_tag.start, tree, paragraph_index),
                    });
                    list.direct_paragraphs += 1;
                }
                try sub_lists.append(owned_a, list);
                note.sub_list_count += 1;
            }
            result.missing_sub_lists += @intFromBool(note.sub_list_count == 0);
            result.duplicate_sub_lists += @intFromBool(note.sub_list_count > 1);
            try notes.append(owned_a, note);
        }
    }
    result.notes = try notes.toOwnedSlice(owned_a);
    result.sub_lists = try sub_lists.toOwnedSlice(owned_a);
    result.paragraphs = try paragraphs.toOwnedSlice(owned_a);
    result.owned_bytes = budget.used;
    result.arena = arena;
    return result;
}
