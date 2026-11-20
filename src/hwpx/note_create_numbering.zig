//! Creation order comes from actual Native reference positions, not XML ids.
const std = @import("std");
const editor = @import("editor_session.zig");
const update = @import("note_delete_numbering.zig");
const hp = @import("document_xml.zig").paragraph_uri;
pub const Plan = struct {
    number: i32,
    updates: []update.Update,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.updates);
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, session: *const editor.Session, target: @import("inline_object_insert.zig").Target, kind: @import("note_bodies.zig").Kind) !Plan {
    try @import("note_delete_policy.zig").validate(a, session, if (kind == .foot) .foot else .end);
    const header = if (session.original_header) |*value| value else return error.MissingHeader;
    var begin = try @import("header_begin_numbers.zig").inspect(a, header, .{});
    defer begin.deinit(a);
    const raw_start = begin.value(if (kind == .foot) .footnote else .endnote) orelse return error.MissingExplicitNoteCreateNumber;
    const first = try @import("xml_values.zig").signed32(raw_start);
    if (first <= 0) return error.InvalidNoteCreateNumber;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    var policies = try @import("section_note_shapes.zig").inspect(a, trees, .{});
    defer policies.deinit(a);
    for (policies.children) |child| {
        if (child.kind != .numbering or policies.notes[child.note_index].kind != @as(@TypeOf(policies.notes[child.note_index].kind), if (kind == .foot) .foot else .end)) continue;
        const raw = child.get(.new_num) orelse return error.MissingExplicitNoteCreateNumber;
        if (try @import("xml_values.zig").signed32(raw) != first) return error.InconsistentNoteNumberSequence;
    }
    // A page/section restart is not silently interpreted as continuous.
    var expected = first;
    var new_number = first;
    var changes: std.ArrayList(update.Update) = .empty;
    errdefer changes.deinit(a);
    const type_name = if (kind == .foot) "FOOTNOTE" else "ENDNOTE";
    for (session.sections, 0..) |*section, ordinal| {
        var snapshot = try @import("automatic_number_snapshot.zig").read(a, &section.tree);
        defer snapshot.deinit(a);
        const sites = try @import("note_reference_sites.zig").read(a, session, ordinal);
        defer a.free(sites);
        var map = std.AutoHashMap(usize, usize).init(a);
        defer map.deinit();
        for (sites, 0..) |site, index| {
            if (map.contains(site.note_node)) return error.AmbiguousNoteReferenceNumber;
            try map.put(site.note_node, index);
        }
        var numbers = std.AutoHashMap(usize, @import("automatic_number_snapshot.zig").Row).init(a);
        defer numbers.deinit();
        for (snapshot.rows) |row| try numbers.put(row.number_node, row);
        for (snapshot.report.controls) |control| {
            if (control.kind == .new_num) {
                const value = control.auto orelse return error.UnresolvedNoteCreateNumber;
                const raw = value.get(.num_type) orelse return error.UnresolvedNoteCreateNumber;
                if (std.mem.eql(u8, raw, type_name)) return error.UnsupportedNoteNumberRestart;
            }
        }
        var controls = std.AutoHashMap(usize, @import("number_controls.zig").Control).init(a);
        defer controls.deinit();
        for (snapshot.report.controls) |control| try controls.put(control.element_index, control);
        var linked = std.AutoHashMap(usize, void).init(a);
        defer linked.deinit();
        for (section.tree.elements, 0..) |element, note_node| {
            if (!element.is(hp, if (kind == .foot) "footNote" else "endNote")) continue;
            const site = sites[map.get(note_node) orelse return error.UnresolvedNoteCreateNumber];
            const row = numbers.get(site.number_node) orelse return error.UnresolvedNoteCreateNumber;
            const number = row.values.num orelse return error.UnresolvedNoteCreateNumber;
            if (number != expected) return error.InconsistentNoteNumberSequence;
            expected = try std.math.add(i32, expected, 1);
            try linked.put(site.number_node, {});
            const following = ordinal > target.section or (ordinal == target.section and (site.paragraph > target.paragraph or (site.paragraph == target.paragraph and site.anchor_unit >= target.unit)));
            if (!following) {
                new_number = expected;
                continue;
            }
            const control = controls.get(site.number_node) orelse return error.UnresolvedNoteCreateNumber;
            if (row.values.other_attributes != 0 or control.unknown_children != 0) return error.UnsupportedNoteNumberUpdate;
            _ = try @import("note_mutation_owner.zig").read(&section.tree, note_node);
            const raw_number = section.tree.elements[site.number_node];
            const wrapper = raw_number.parent orelse return error.UnresolvedNoteCreateNumber;
            const run = section.tree.elements[wrapper].parent orelse return error.UnresolvedNoteCreateNumber;
            const p = section.tree.elements[run].parent orelse return error.UnresolvedNoteCreateNumber;
            const context = (try @import("note_paragraph_context.zig").read(&section.tree, p)) orelse return error.UnresolvedNoteCreateNumber;
            if (context.note_node != note_node or row.anchor_node != wrapper or !section.tree.elements[p].is(hp, "p")) return error.UnresolvedNoteCreateNumber;
            if (try section.tree.attributeValue(a, note_node, "", "number") != null) return error.UnsupportedNoteNumberUpdate;
            try changes.append(a, .{ .section = ordinal, .note_node = note_node, .number_node = site.number_node, .paragraph_node = p, .before = number, .after = try std.math.add(i32, number, 1) });
        }
        for (snapshot.rows) |row| {
            const raw = row.values.get(.num_type) orelse continue;
            if (std.mem.eql(u8, raw, type_name) and !linked.contains(row.number_node)) return error.UnresolvedNoteCreateNumber;
        }
    }
    try update.validateUpdates(a, session, changes.items);
    return .{ .number = new_number, .updates = try changes.toOwnedSlice(a) };
}
