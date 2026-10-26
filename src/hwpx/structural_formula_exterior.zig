//! Source-owned field exterior in a structural model; topology stays owned.
const std = @import("std");
const editor = @import("editor_session.zig");
const plan_mod = @import("field_source_outside_plan.zig");

pub fn prepare(session: *const editor.Session, section_index: usize, paragraph: usize, start: u32, end: u32) !?plan_mod.Plan {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const values = if (section.structure_values) |*current| current else return null;
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    if (paragraph - section.first_paragraph >= values.paragraphs.len) return error.InvalidParagraphIndex;
    if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    const row = &values.paragraphs[paragraph - section.first_paragraph];
    if (row.pieces != null or row.generated_id != null or row.protected_positions != null or row.field_positions != null or row.column_boundaries != null or row.page_area_positions != null) return null;
    const ordinal = row.source_ordinal orelse return null;
    if (!try @import("paragraph_site_owner.zig").ownsFieldMarker(&section.tree, row.template_element)) return null;
    var owners: usize = 0;
    for (values.paragraphs) |candidate| {
        if (candidate.template_element == row.template_element) owners += 1;
    }
    if (owners != 1) return error.DuplicateCurrentTextOwner;
    const a = session.allocator;
    var flat = try @import("structural_source_view.zig").open(a, session, section_index);
    defer flat.deinit();
    var plan = (try plan_mod.prepare(&flat.session, section_index, ordinal, start, end)) orelse return null;
    errdefer plan.deinit(a);
    // Global projection indices are converted to the authoritative local owner.
    for (plan.segments) |*segment| {
        if (segment.kind != .text or segment.index >= flat.sites.items.len) return error.SourceBindingMismatch;
        const source = flat.sites.items[segment.index];
        var found: ?usize = null;
        for (row.sites.items, 0..) |site, index| if (site.element_index == source.element_index and site.start == source.start and site.end == source.end) {
            if (found != null) return error.SourceBindingMismatch;
            found = index;
        };
        segment.index = found orelse return error.SourceBindingMismatch;
    }
    return plan;
}

pub fn splice(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !?bool {
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    const plan = (prepare(session, section_index, paragraph, start, end) catch |err| switch (err) {
        error.ProtectedFieldRange, error.UnsupportedInlineControl, error.UnsupportedParagraphControl => return null,
        else => return err,
    }) orelse return null;
    const a = session.allocator;
    defer plan.deinit(a);
    const section = &session.sections[section_index];
    const current = &section.structure_values.?;
    const index = paragraph - section.first_paragraph;
    var other: usize = 0;
    for (current.paragraphs, 0..) |row, ordinal| if (ordinal != index) {
        for (row.sites.items) |site| {
            if (site.text.len > limit -| other) return error.LimitExceeded;
            other += site.text.len;
        }
    };
    var draft = try current.clone(a);
    defer draft.deinit(a);
    const row = &draft.paragraphs[index];
    const target = try @import("field_exterior_insertion_site.zig").fromSession(session, section_index, &row.sites, plan.segments, plan.start, plan.end - plan.start);
    const changed = if (row.character_styles != null)
        try @import("character_style_splice.zig").splicePositionsAtSiteWithTree(a, &section.tree, row, plan.segments, plan.start, plan.end - plan.start, inserted, limit -| other, target)
    else
        try @import("text_splice_transaction.zig").spliceProjected(a, &row.sites, plan.segments, plan.start, plan.end - plan.start, inserted, limit -| other, target);
    if (!changed) return false;
    var proxy = session.*;
    proxy.sections = try a.dupe(editor.Section, session.sections);
    defer a.free(proxy.sections);
    proxy.sections[section_index].structure_values = draft;
    const verified = try proxy.save();
    defer a.free(verified);
    std.mem.swap(@import("paragraph_structure_values.zig").Values, current, &draft);
    return true;
}
