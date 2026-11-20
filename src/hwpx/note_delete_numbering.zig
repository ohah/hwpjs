//! Continuous-note deletion sequence plan. Joins the existing note/number/link
//! reports once; XML ids and paragraph ids are never ownership keys.
const std = @import("std");
const editor = @import("editor_session.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Update = struct { section: usize, note_node: usize, number_node: usize, paragraph_node: usize, current_prefix_paragraph: ?usize = null, before: i32, after: i32 };
pub fn prepare(a: std.mem.Allocator, session: *const editor.Session, selector: @import("note_delete_owner.zig").Selector, kind: @import("note_mutation_owner.zig").Kind) ![]Update {
    var protection = try @import("note_source_protection.zig").Context.init(session);
    defer protection.deinit();
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    var notes = try @import("note_bodies.zig").inspect(a, trees, .{});
    defer notes.deinit();
    var numbers = try @import("number_controls.zig").inspect(a, trees, .{});
    defer numbers.deinit();
    var links = try @import("note_number_links.zig").inspect(a, trees, &notes, &numbers, .{});
    defer links.deinit();
    const expected_type = if (kind == .foot) "FOOTNOTE" else "ENDNOTE";
    for (numbers.controls) |control| {
        if (control.kind != .new_num) continue;
        const raw = control.auto.?.get(.num_type) orelse return error.UnresolvedNoteDeleteNumber;
        if (std.mem.eql(u8, raw, expected_type)) return error.UnsupportedNoteNumberRestart;
    }
    var link_map: std.AutoHashMap(usize, usize) = .init(a);
    defer link_map.deinit();
    var number_owners: std.AutoHashMap(usize, void) = .init(a);
    defer number_owners.deinit();
    for (links.links, 0..) |link, index| {
        if (notes.notes[link.note_index].kind != kind) continue;
        if (link_map.contains(link.note_index)) return error.AmbiguousNoteReferenceNumber;
        try link_map.put(link.note_index, index);
        try number_owners.put(link.control_index, {});
    }
    for (numbers.controls, 0..) |control, control_index| {
        if (control.kind != .auto_num) continue;
        const raw = control.auto.?.get(.num_type) orelse continue;
        if (std.mem.eql(u8, raw, expected_type) and !number_owners.contains(control_index)) return error.UnresolvedNoteDeleteNumber;
    }
    var updates: std.ArrayList(Update) = .empty;
    errdefer updates.deinit(a);
    var previous: ?i32 = null;
    var selected = false;
    for (notes.notes, 0..) |note, note_index| {
        if (note.kind != kind) continue;
        const link = links.links[link_map.get(note_index) orelse return error.UnresolvedNoteDeleteNumber];
        if (link.type_matches_note != true or !link.inside_direct_sub_list) return error.UnresolvedNoteDeleteNumber;
        const number = link.num orelse return error.UnresolvedNoteDeleteNumber;
        if (number <= 0) return error.UnresolvedNoteDeleteNumber;
        if (previous) |prior| {
            if (number != (std.math.add(i32, prior, 1) catch return error.UnresolvedNoteDeleteNumber)) return error.InconsistentNoteNumberSequence;
        }
        previous = number;
        if (note.section_ordinal == selector.section and note.element_index == selector.note_node) {
            if (selected) return error.AmbiguousNoteDeleteOwner;
            selected = true;
            continue;
        }
        if (!selected) continue;
        const tree = &trees[note.section_ordinal];
        const structural = try @import("note_mutation_owner.zig").read(tree, note.element_index);
        // 실제 변경 태그의 필드 및 잠금 어휘를 shape 거부보다 먼저 검사합니다.
        try protection.scalarTag(note.section_ordinal, link.element_index);
        const control = numbers.controls[link.control_index];
        if (control.auto.?.other_attributes != 0 or control.unknown_children != 0) return error.UnsupportedNoteNumberUpdate;
        // Legacy model-only fields have not been observed as another stored
        // sequence field. Do not change or silently contradict such a value.
        if (note.attributes.get(.number) != null) return error.UnsupportedNoteNumberUpdate;
        const wrapper = tree.elements[link.element_index].parent orelse return error.UnresolvedNoteDeleteNumber;
        const run = tree.elements[wrapper].parent orelse return error.UnresolvedNoteDeleteNumber;
        const paragraph = tree.elements[run].parent orelse return error.UnresolvedNoteDeleteNumber;
        if (@import("run_anchor.zig").kind(tree, wrapper) != .automatic_number or !tree.elements[paragraph].is(uri, "p")) return error.UnresolvedNoteDeleteNumber;
        const context = (try @import("note_paragraph_context.zig").read(tree, paragraph)) orelse return error.UnresolvedNoteDeleteNumber;
        if (context.note_node != structural.note_node or context.list_node != structural.list_node) return error.UnresolvedNoteDeleteNumber;
        try updates.append(a, .{ .section = note.section_ordinal, .note_node = note.element_index, .number_node = link.element_index, .paragraph_node = paragraph, .before = number, .after = number - 1 });
    }
    if (!selected) return error.MissingNoteDeleteOwner;
    try validateUpdates(a, session, updates.items);
    return updates.toOwnedSlice(a);
}
/// Shared actual physical/current prefix and field protection for scalar edits.
pub fn validateUpdates(a: std.mem.Allocator, session: *const editor.Session, updates: []Update) !void {
    var protection = try @import("note_source_protection.zig").Context.init(session);
    defer protection.deinit();
    // Every updated number still belongs to a current protected reference.
    // Build one actual-owner lookup per request, never infer a paragraph from id.
    const Key = struct { section: usize, node: usize };
    var sites: std.AutoHashMap(Key, @import("note_reference_sites.zig").Site) = .init(a);
    defer sites.deinit();
    var prefixes: std.AutoHashMap(Key, ?usize) = .init(a);
    defer prefixes.deinit();
    for (session.sections, 0..) |*section, ordinal| {
        const current = try @import("note_reference_sites.zig").read(a, session, ordinal);
        defer a.free(current);
        for (current) |site| try sites.put(.{ .section = ordinal, .node = site.note_node }, site);
        var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
        defer view.deinit(a);
        for (view.paragraphs, 0..) |paragraph, index| {
            if (try @import("note_paragraph_context.zig").read(&section.tree, paragraph.template_element) == null) continue;
            const entry = try prefixes.getOrPut(.{ .section = ordinal, .node = paragraph.template_element });
            if (entry.found_existing or paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.pieces != null) {
                entry.value_ptr.* = null;
            } else entry.value_ptr.* = try std.math.add(usize, section.first_paragraph, index);
        }
    }
    for (updates) |*update| {
        try protection.scalarTag(update.section, update.number_node);
        const site = sites.get(.{ .section = update.section, .node = update.note_node }) orelse return error.UnresolvedNoteDeleteNumber;
        if (site.number_node != update.number_node) return error.UnresolvedNoteDeleteNumber;
        // This is the actual current internal prefix owner, not the visible
        // body reference's paragraph. No guessed paragraph zero or XML id.
        update.current_prefix_paragraph = (prefixes.get(.{ .section = update.section, .node = update.paragraph_node }) orelse return error.UnresolvedNoteDeleteNumber) orelse return error.AmbiguousNoteDeleteOwner;
        const end = try std.math.add(usize, site.anchor_unit, 1);
        const exterior = try @import("field_source_outside_positions.zig").prepareAction(session, update.section, site.paragraph, std.math.cast(u32, site.anchor_unit) orelse return error.LimitExceeded, std.math.cast(u32, end) orelse return error.LimitExceeded, .splice);
        if (exterior) |positions| session.allocator.free(positions);
    }
}
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: i32) !bool {
    const decoded = try raw.toUtf8(a, 4096);
    defer a.free(decoded);
    return try @import("xml_values.zig").signed32(decoded) == value;
}
fn serialize(a: std.mem.Allocator, quote: u8, value: i32) ![]u8 {
    if (value <= 0) return error.UnresolvedNoteDeleteNumber;
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}
pub fn writeTag(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, update: Update, limit: usize) ![]u8 {
    if (update.current_prefix_paragraph == null) return error.UnresolvedNoteDeleteNumber;
    return @import("xml_bound_attributes_write.zig").write(a, tree, update.number_node, &.{"num"}, i32, .{update.after}, equal, serialize, limit);
}
