const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const notes_mod = @import("note_bodies.zig");
const numbers_mod = @import("number_controls.zig");

pub const Options = struct { max_links: usize = 200_000 };

pub const Link = struct {
    note_index: usize,
    control_index: usize,
    section_ordinal: usize,
    element_index: usize,
    inside_direct_sub_list: bool,
    /// Null means numType is absent, not that it is incorrect.
    type_matches_note: ?bool,
    num: ?i32,
};

pub const NoteCounts = struct {
    links: usize = 0,
    inside_direct_sub_list: usize = 0,
    matching_type: usize = 0,
    mismatched_type: usize = 0,
    missing_type: usize = 0,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    notes: []const NoteCounts,
    links: []const Link,
    notes_without_auto_num: usize,
    controls_outside_notes: usize,
    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Key = struct { section: usize, element: usize };

/// Joins existing note and number reports by exact tree ancestry. This is an
/// observation of embedded controls, not a numbering/layout calculation.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, notes: *const notes_mod.Report, numbers: *const numbers_mod.Report, options: Options) !Report {
    if (notes.sections != sections.len or numbers.sections != sections.len) return error.InconsistentSectionCount;
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var note_map: std.AutoHashMapUnmanaged(Key, usize) = .empty;
    var counts = try owned_a.alloc(NoteCounts, notes.notes.len);
    @memset(counts, .{});
    for (notes.notes, 0..) |note, note_index| {
        if (note.section_ordinal >= sections.len) return error.InvalidNoteIndex;
        const tree = &sections[note.section_ordinal];
        if (tree.part_kind != .section or tree.section_ordinal != note.section_ordinal or note.element_index >= tree.elements.len) return error.InvalidNoteIndex;
        const element = tree.elements[note.element_index];
        const expected: []const u8 = if (note.kind == .foot) "footNote" else "endNote";
        if (!element.is(document_xml.paragraph_uri, expected) or element.parent != note.parent_element_index) return error.InvalidNoteIndex;
        const entry = try note_map.getOrPut(owned_a, .{ .section = note.section_ordinal, .element = note.element_index });
        if (entry.found_existing) return error.DuplicateNoteIndex;
        entry.value_ptr.* = note_index;
    }
    var links: std.ArrayList(Link) = .empty;
    var outside: usize = 0;
    for (numbers.controls, 0..) |control, control_index| {
        if (control.section_ordinal >= sections.len) return error.InvalidControlIndex;
        const tree = &sections[control.section_ordinal];
        if (tree.part_kind != .section or tree.section_ordinal != control.section_ordinal or control.element_index >= tree.elements.len) return error.InvalidControlIndex;
        const element = tree.elements[control.element_index];
        const expected: []const u8 = switch (control.kind) {
            .auto_num => "autoNum",
            .new_num => "newNum",
            .page_num => "pageNum",
        };
        if (!element.is(document_xml.paragraph_uri, expected) or element.parent != control.parent_element_index) return error.InvalidControlIndex;
        if (control.kind != .auto_num) continue;
        const auto = control.auto orelse return error.InconsistentControlReport;
        var parent = element.parent;
        var found: ?usize = null;
        var direct_list_parent: ?usize = null;
        while (parent) |index| {
            const ancestor = tree.elements[index];
            if (ancestor.is(document_xml.paragraph_uri, "subList")) direct_list_parent = ancestor.parent;
            if (note_map.get(.{ .section = control.section_ordinal, .element = index })) |note_index| {
                found = note_index;
                break;
            }
            parent = ancestor.parent;
        }
        const note_index = found orelse {
            outside += 1;
            continue;
        };
        if (links.items.len >= options.max_links) return error.LimitExceeded;
        const note = notes.notes[note_index];
        const raw_type = auto.get(.num_type);
        const type_match: ?bool = if (raw_type) |value| std.mem.eql(u8, value, if (note.kind == .foot) "FOOTNOTE" else "ENDNOTE") else null;
        const inside = direct_list_parent == note.element_index;
        const counts_for_note = &counts[note_index];
        counts_for_note.links += 1;
        counts_for_note.inside_direct_sub_list += @intFromBool(inside);
        if (type_match) |matches| {
            if (matches) counts_for_note.matching_type += 1 else counts_for_note.mismatched_type += 1;
        } else counts_for_note.missing_type += 1;
        try links.append(owned_a, .{
            .note_index = note_index,
            .control_index = control_index,
            .section_ordinal = control.section_ordinal,
            .element_index = control.element_index,
            .inside_direct_sub_list = inside,
            .type_matches_note = type_match,
            .num = auto.num,
        });
    }
    var without: usize = 0;
    for (counts) |item| without += @intFromBool(item.links == 0);
    return .{
        .arena = arena,
        .notes = counts,
        .links = try links.toOwnedSlice(owned_a),
        .notes_without_auto_num = without,
        .controls_outside_notes = outside,
    };
}
