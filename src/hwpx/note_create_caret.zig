//! Receipt is serializer provenance, not a reusable edit permission.
const std = @import("std");
const editor = @import("editor_session.zig");
const hp = @import("document_xml.zig").paragraph_uri;
pub const Receipt = struct { section: usize, paragraph_id: u32, number: i32, kind: @import("note_bodies.zig").Kind };
pub const Caret = struct {
    receipt: Receipt,
    paragraph: usize,
    unit: u32,
    session: usize,
    source: usize,
    serial: u64,
    revision: u32,
};
pub fn observe(session: *const editor.Session, receipt: Receipt, revision: u32) !Caret {
    if (receipt.section >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const section = &session.sections[receipt.section];
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    var selected: ?usize = null;
    for (view.paragraphs, 0..) |p, index| {
        const node = p.template_element;
        if (!section.tree.elements[node].is(hp, "p")) continue;
        const id = (try @import("table_xml_fields.zig").optionalUnsigned(a, &section.tree, node, "id", 4096)) orelse continue;
        if (id != receipt.paragraph_id) continue;
        if (selected != null or p.generated_id != null or p.source_ordinal == null or p.pieces != null) return error.InvalidNoteCreateCaret;
        const context = (try @import("note_paragraph_context.zig").read(&section.tree, node)) orelse return error.InvalidNoteCreateCaret;
        if (context.kind != @as(@TypeOf(context.kind), if (receipt.kind == .foot) .footnote else .endnote)) return error.InvalidNoteCreateCaret;
        _ = try @import("note_mutation_owner.zig").read(&section.tree, context.note_node);
        var numbers = try @import("automatic_number_snapshot.zig").read(a, &section.tree);
        defer numbers.deinit(a);
        var matched: usize = 0;
        for (numbers.rows) |row| {
            if (row.values.num != receipt.number) continue;
            var ancestor = section.tree.elements[row.number_node].parent;
            while (ancestor) |owner| : (ancestor = section.tree.elements[owner].parent) {
                if (owner == context.note_node) {
                    matched += 1;
                    break;
                }
            }
        }
        if (matched != 1) return error.InvalidNoteCreateCaret;
        var protection = try @import("note_source_protection.zig").Context.init(session);
        defer protection.deinit();
        try protection.scalarTag(receipt.section, node);
        var last_text_run: ?usize = null;
        var run = section.tree.elements[node].first_child;
        while (run) |r| : (run = section.tree.elements[r].next_sibling) {
            if (!section.tree.elements[r].is(hp, "run")) continue;
            var child = section.tree.elements[r].first_child;
            while (child) |c| : (child = section.tree.elements[c].next_sibling) if (section.tree.elements[c].is(hp, "t")) {
                last_text_run = r;
            };
        }
        try protection.scalarTag(receipt.section, last_text_run orelse return error.InvalidNoteCreateCaret);
        selected = try std.math.add(usize, section.first_paragraph, index);
    }
    const paragraph = selected orelse return error.InvalidNoteCreateCaret;
    // Existing plain-text Native path excludes the retained note-number prefix.
    if (!try session.canEdit(receipt.section, paragraph)) return error.InvalidNoteCreateCaret;
    const text = try @import("note_body_plain_text.zig").read(a, session, receipt.section, paragraph);
    defer a.free(text);
    const units = try @import("../model/independent_text_edits.zig").utf16Units(text);
    return .{ .receipt = receipt, .paragraph = paragraph, .unit = units, .session = @intFromPtr(session), .source = @intFromPtr(session.source.ptr), .serial = session.mutation_serial, .revision = revision };
}
pub fn command(session: *const editor.Session, caret: Caret, revision: u32, inserted: []const u8) !@import("editor_history.zig").Command {
    if (caret.session != @intFromPtr(session) or caret.source != @intFromPtr(session.source.ptr) or caret.serial != session.mutation_serial or caret.revision != revision) return error.StaleNoteCreateCaret;
    const current = try observe(session, caret.receipt, revision);
    if (!std.meta.eql(current, caret)) return error.StaleNoteCreateCaret;
    return .{ .kind = .plain, .section = caret.receipt.section, .paragraph = caret.paragraph, .start = caret.unit, .deleted = 0, .inserted = inserted };
}
