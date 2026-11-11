//! Stage an original-topology paragraph-format rebase before field metadata edits.
const std = @import("std");
const editor = @import("editor_session.zig");
const params = @import("named_field_parameters.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn supports(session: *const editor.Session, index: usize, section: *const editor.Section) bool {
    var flat = section.*;
    flat.structure_values = null;
    if (!@import("named_field_rename.zig").supportsFlatSection(session, index, &flat)) return false;
    const values = section.structure_values orelse return true;
    if (section.first_paragraph == 0 or section.last_paragraph < section.first_paragraph) return false;
    if (session.formatting_batch != null or section.sites.items.len != 0 or
        values.paragraphs.len != section.last_paragraph - section.first_paragraph + 1) return false;
    var ordinal: usize = 0;
    for (section.tree.elements, 0..) |node, element| {
        if (!node.is(uri, "p")) continue;
        if (ordinal >= values.paragraphs.len) return false;
        const p = values.paragraphs[ordinal];
        if (p.template_element != element or p.source_ordinal != (section.source_first_paragraph orelse section.first_paragraph) + ordinal or
            p.generated_id != null or p.pieces != null or p.break_before != null or
            p.character_styles != null or p.synthesized_run_character_id != null or
            p.title_fragment_owners != null or p.title_output_projection != null or
            p.protected_positions != null or p.field_positions != null or p.title_positions != null or
            p.column_boundaries != null or p.page_area_positions != null or p.column_structure_changed) return false;
        ordinal += 1;
    }
    return ordinal == values.paragraphs.len;
}

pub fn apply(session: *editor.Session, index: usize, paragraph: usize, element: usize, name: []const u8, update: params.Update) anyerror!bool {
    const a = session.allocator;
    const old = &session.sections[index];
    if (!supports(session, index, old)) return error.UnsupportedNamedFieldParametersSection;
    const values = old.structure_values orelse return error.UnsupportedNamedFieldParametersSection;
    const id = (try old.tree.attributeValue(a, element, "", "id")) orelse return error.SourceBindingMismatch;
    const identity = try id.toUtf8(a, 4096);
    defer a.free(identity);
    const xml = try @import("paragraph_structure_save.zig").write(a, &old.tree, &values, editor.siteOptions(session.options), old.field_dirty.items, session.options.max_xml_bytes);
    defer a.free(xml);
    const next = try @import("section_source_basis.zig").prepare(a, xml, index, old.tree.item_index, old.first_paragraph, session.options);
    var staged: editor.Section = .{
        .original_basis = old.original_basis,
        .owned_rebased_basis = next.basis,
        .tree = next.basis.tree,
        .sites = next.sites,
        .locations = next.basis.locations,
        .entry_index = old.entry_index,
        .first_paragraph = old.first_paragraph,
        .source_first_paragraph = old.first_paragraph,
        .last_paragraph = next.basis.last_paragraph,
    };
    var staged_owned = true;
    defer if (staged_owned) staged.deinitCurrent(a);
    if (staged.last_paragraph != old.last_paragraph) return error.SourceBindingMismatch;
    var target: ?usize = null;
    for (staged.tree.elements, 0..) |node, i| {
        if (!node.is(uri, "fieldBegin")) continue;
        const attr = (try staged.tree.attributeValue(a, i, "", "id")) orelse continue;
        const text = try attr.toUtf8(a, 4096);
        defer a.free(text);
        if (!std.mem.eql(u8, text, identity)) continue;
        if (target != null) return error.SourceBindingMismatch;
        target = i;
    }
    const resolved = target orelse return error.SourceBindingMismatch;
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[index] = staged;
    staged_owned = false;
    var shadow = session.*;
    shadow.sections = sections;
    shadow.source_fields = null;
    shadow.formatting_batch = null;
    var owns_section = true;
    defer if (owns_section) shadow.sections[index].deinitCurrent(a);
    defer if (shadow.source_fields) |*fields| fields.deinit(a);
    if (!try params.apply(&shadow, index, paragraph, resolved, name, update)) return false;
    // Only a completely checked candidate is consumed. Header resource intents
    // remain owned by the existing Session and are serialized by its normal save.
    try session.installSectionSourceBasis(index, &shadow.sections[index]);
    owns_section = false;
    return true;
}
