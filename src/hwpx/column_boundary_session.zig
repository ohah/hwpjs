//! Lazily materialize source boundaries, then commit a verified text candidate.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");

pub fn splice(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) anyerror!?bool {
    const a = session.allocator;
    const section = &session.sections[section_index];
    const index = paragraph - section.first_paragraph;
    if (section.structure_values) |values| {
        const current = &values.paragraphs[index];
        // Continuations do not own source column metadata removed by their writer.
        // Do not infer ownership merely from a shared immutable template.
        if (current.generated_id != null and current.source_ordinal == null and current.column_boundaries == null) return null;
    }
    const owner = if (section.structure_values) |values| values.paragraphs[index].template_element else try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, try section.sourceParagraph(paragraph));
    const identities = try @import("column_boundary_collect.zig").collect(a, &section.tree, owner, &.{}, .right, session.options.max_sites);
    defer a.free(identities);
    if (identities.len == 0) return null;
    for (identities) |boundary| _ = try @import("column_boundary_xml.zig").control(&section.tree, boundary.source_element);
    var counters: @import("section_text.zig").Report = .{ .paragraphs = (section.source_first_paragraph orelse section.first_paragraph) - 1 };
    var candidate: model.Values = if (section.structure_values) |values| try values.clone(a) else try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    var transferred = false;
    defer if (!transferred) candidate.deinit(a);
    const owned = &candidate.paragraphs[index];
    if (anchored and owned.column_boundaries == null) {
        // Keep protected anchors on their established ownership-aware path.
        // Column-only paragraphs still use the column transaction below.
        const positions = try @import("paragraph_protected_positions.zig").build(a, &section.tree, owned);
        defer a.free(positions);
        for (positions) |position| if (position.kind == .anchor) return null;
    }
    if (owned.generated_id != null or owned.source_ordinal == null or owned.pieces != null or owned.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    try @import("column_boundary_materialize.zig").install(a, &section.tree, owned, session.options.max_sites);
    if (!try @import("paragraph_structure_splice.zig").spliceMode(a, &section.tree, &candidate, index, start, deleted, inserted, limit, anchored)) return false;
    const projected = try a.dupe(editor.Section, session.sections);
    defer a.free(projected);
    projected[section_index].sites = .{ .items = &.{} };
    projected[section_index].structure_values = candidate;
    try @import("paragraph_structure_budget.zig").validate(projected, session.options);
    var proxy = session.*;
    proxy.sections = projected;
    const checked = try proxy.save();
    defer a.free(checked);
    // All checks and allocations precede ownership transfer.
    section.sites.deinit(a);
    section.sites = .{ .items = &.{} };
    if (section.structure_values) |*values| values.deinit(a);
    section.structure_values = candidate;
    transferred = true;
    return true;
}
