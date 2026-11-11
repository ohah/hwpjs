//! Rename one source field through the existing owned section rebase.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub const max_name_bytes = 4096;

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, element: usize, expected: []const u8, name: []const u8) !bool {
    if (session.history_delta_managed and !session.history_transaction_active) return error.MutationInProgress;
    if (expected.len == 0 or name.len == 0) return error.InvalidNamedFieldName;
    if (expected.len > max_name_bytes or name.len > max_name_bytes) return error.LimitExceeded;
    if (!try @import("named_fields.zig").authorizeRename(session, section, paragraph, element, expected, name)) return false;
    const old = &session.sections[section];
    try old.validateSourceBasis();
    const original = old.original_basis orelse return error.SourceBindingMismatch;
    try requireFlatSection(session, section, old);

    const a = session.allocator;
    const tag = try renameTag(a, &old.tree, element, name);
    defer a.free(tag);
    const span = old.tree.elements[element].start_tag;
    const xml = try @import("xml_source_writer.zig").write(a, old.tree.source, &.{
        .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag },
    }, session.options.max_xml_bytes);
    defer a.free(xml);
    const next = try @import("section_source_basis.zig").prepare(a, xml, section, old.tree.item_index, old.first_paragraph, session.options);
    var staged: editor.Section = .{
        .original_basis = original,
        .owned_rebased_basis = next.basis,
        .tree = next.basis.tree,
        .sites = next.sites,
        .locations = next.basis.locations,
        .entry_index = old.entry_index,
        .first_paragraph = old.first_paragraph,
        .source_first_paragraph = old.first_paragraph,
        .last_paragraph = next.basis.last_paragraph,
    };
    errdefer staged.deinitCurrent(a);
    if (staged.last_paragraph != old.last_paragraph or
        staged.tree.elements.len != old.tree.elements.len or
        staged.sites.items.len != old.sites.items.len)
        return error.SourceBindingMismatch;
    // Only an attribute value changed. Preserve the current text, including
    // prior label edits, on the corresponding sites of the new source basis.
    for (old.sites.items, staged.sites.items, 0..) |before, *after, index| {
        if (before.element_index != after.element_index or before.empty_element != after.empty_element or
            before.missing_text != after.missing_text or before.anchor_boundary != after.anchor_boundary)
            return error.SourceBindingMismatch;
        try old.sites.validateTextOwnership(index);
        if (std.mem.eql(u8, before.text, after.text)) continue;
        const copy = try a.dupe(u8, before.text);
        a.free(after.text);
        after.text = copy;
    }
    try staged.field_dirty.appendSlice(a, old.field_dirty.items);
    try session.installSectionSourceBasis(section, &staged);
    return true;
}

fn requireFlatSection(session: *const editor.Session, section: usize, old: *const editor.Section) !void {
    // The rebase adapter transfers only current text and field dirty flags.
    // Pending node-based intents need their own checked rebinding.
    if (old.structure_values != null or
        old.cell_sizes.items.len != 0 or old.picture_dimensions.items.len != 0 or
        old.picture_matrices.items.len != 0 or old.picture_frames.items.len != 0 or
        old.checkbox_states.items.len != 0 or old.dutmal_texts.entries.items.len != 0 or
        old.equation_scripts.entries.items.len != 0 or old.formula_definitions.entries.items.len != 0 or
        old.formula_result_overrides.entries.items.len != 0 or old.created_tables.entries.items.len != 0)
        return error.UnsupportedNamedFieldRenameSection;
    for (session.cell_backgrounds.items) |entry| {
        if (entry.section == section) return error.UnsupportedNamedFieldRenameSection;
    }
}

fn renameTag(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8) ![]u8 {
    const element = tree.elements[index];
    if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin"))
        return error.InvalidFieldElement;
    if (element.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const raw = tree.source[element.start_tag.start..element.start_tag.end];
    const attribute = (try @import("xml_part_attributes.zig").find(a, tree, index, "", "name")) orelse
        return error.StaleNamedFieldTarget;
    const base = @intFromPtr(raw.ptr);
    const pointer = @intFromPtr(attribute.raw.ptr);
    if (pointer < base) return error.InvalidSourceSpan;
    const offset = pointer - base;
    if (offset > raw.len or attribute.raw.len > raw.len - offset) return error.InvalidSourceSpan;
    const escaped = try @import("../xml/attribute_writer.zig").encode(a, name, max_name_bytes);
    defer a.free(escaped);
    return std.mem.concat(a, u8, &.{ raw[0..offset], "\"", escaped, "\"", raw[offset + attribute.raw.len ..] });
}
