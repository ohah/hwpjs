//! 원본 쪽 영역의 보호 경계를 공유하고 필요할 때만 현재 귀속 후보를 설치합니다.
const std = @import("std");
const editor = @import("editor_session.zig");

pub fn splice(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) anyerror!?bool {
    const section = &session.sections[section_index];
    if (section.structure_values != null) return null;
    const a = session.allocator;
    const source_paragraph = try section.sourceParagraph(paragraph);
    const owner = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, source_paragraph);
    if (!@import("page_area_source_positions.zig").hasForParagraph(&section.tree, owner)) return null;
    if (anchored) try @import("plain_paragraph_policy.zig").validateWithAnchors(&section.tree, &section.sites, section.locations, source_paragraph) else try @import("plain_paragraph_policy.zig").validateWithTabs(&section.tree, &section.sites, section.locations, source_paragraph, true);
    const segments = try @import("anchor_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, source_paragraph);
    defer a.free(segments);
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateBoundary(&section.sites, segments, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&section.sites, segments, end);
    if (try @import("text_splice_transaction.zig").replacementIsNoOp(a, &section.sites, segments, start, end, inserted)) return false;
    const declarations = try @import("page_area_source_positions.zig").collect(a, &section.tree, owner, segments, session.options.max_sites);
    defer a.free(declarations);
    const units = std.math.cast(u32, segments[segments.len - 1].end_unit) orelse return error.LimitExceeded;
    const inserted_units = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(inserted)) orelse return error.LimitExceeded;
    const insertion = @import("text_splice_transaction.zig").insertionSite(&section.sites, segments, start);
    var needs_model = false;
    for (declarations) |declaration| {
        _ = try @import("page_area_position.zig").splice(declaration, start, end, inserted_units, units);
        if (start == 0 and declaration.unit == 0 and insertion != null) {
            const site = section.sites.items[insertion.?];
            if (site.start < section.tree.elements[declaration.source_control].end) needs_model = true;
        }
    }
    if (!needs_model) return null;
    if (@import("column_boundary_collect.zig").hasForParagraph(&section.tree, owner)) return error.UnsupportedPageAreaOwnership;
    var report: @import("section_text.zig").Report = .{ .paragraphs = (section.source_first_paragraph orelse section.first_paragraph) - 1 };
    var candidate = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &report);
    var transferred = false;
    defer if (!transferred) candidate.deinit(a);
    const index = paragraph - section.first_paragraph;
    try @import("page_area_materialize.zig").install(a, &section.tree, &candidate.paragraphs[index], session.options.max_sites);
    if (!try @import("paragraph_structure_splice.zig").spliceMode(a, &section.tree, &candidate, index, start, deleted, inserted, limit, anchored)) return false;
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section_index].sites = .{ .items = &.{} };
    sections[section_index].structure_values = candidate;
    try @import("paragraph_structure_budget.zig").validate(sections, session.options);
    var proxy = session.*;
    proxy.sections = sections;
    const checked = try proxy.save();
    defer a.free(checked);
    section.sites.deinit(a);
    section.sites = .{ .items = &.{} };
    section.structure_values = candidate;
    transferred = true;
    return true;
}
