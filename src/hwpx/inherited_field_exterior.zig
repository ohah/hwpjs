//! Current inherited field exterior guard. No label permission is inferred here.
const std = @import("std");
const P = @import("paragraph_text_positions.zig");
const Action = @import("field_source_outside_positions.zig").Action;
pub fn prepareAction(s: anytype, section: usize, paragraph: usize, start: u32, end: u32, action: Action) anyerror!?[]P.Segment {
    if (end < start) return error.InvalidTextPosition;
    const part = &s.sections[section];
    const current = if (part.structure_values) |*v| v else return null;
    const index = paragraph - part.first_paragraph;
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const row = &current.paragraphs[index];
    if (row.field_positions != null) return null; // existing explicit current model remains strict
    if (!try @import("source_field_analysis.zig").hasFields(s, section)) return null;
    const a = s.allocator;
    var lease = try @import("source_field_analysis.zig").lease(s);
    defer lease.deinit(a);
    const frames = try @import("xml_tree_selection.zig").build(a, &part.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    // Disjoint current rows retain their existing structural edit policy.
    // Only rows overlapping an inherited field need its identity proof.
    if (row.template_element >= part.tree.elements.len) return error.SourceBindingMismatch;
    const node = part.tree.elements[row.template_element];
    var overlaps = false;
    for (lease.source.fields) |f| if (f.section == section and node.end > f.content_start and node.start_tag.start < f.content_end) {
        overlaps = true;
    };
    if (!overlaps) return null;
    // A whole-row denial grants no editing permission. Do not make display
    // eligibility depend on unrelated generated/split paragraph identities.
    if (action == .whole_plain or action == .whole_anchored) {
        // A field inside an opaque child object does not own its host anchor.
        // Project this row's current segments before denying whole-row access.
        const local_locations = try @import("paragraph_structure_locations.zig").build(a, &part.tree, row);
        defer a.free(local_locations);
        const local_segments = try @import("anchor_text_positions.zig").buildForFieldText(a, &part.tree, &row.sites, local_locations, 1);
        defer a.free(local_segments);
        for (lease.source.fields) |field| {
            if (@import("field_text_positions.zig").project(field, section, local_segments) != null) return error.ProtectedFieldRange;
        }
        return null;
    }
    // Preserve the existing range-specific structural/formula provenance path.
    // Only a successfully prepared plan delegates; identity failures below are
    // never converted into a permissive null fallback.
    var legacy_content = true;
    for (lease.source.fields) |field| {
        if (field.section != section or node.end <= field.content_start or node.start_tag.start >= field.content_end) continue;
        if (try @import("field_label_content_policy.zig").firstUnsupportedNode(&part.tree, field, lease.source.fields, &lease.source.report, false) != null) legacy_content = false;
    }
    if (action == .splice and legacy_content) {
        const existing = @import("structural_formula_exterior.zig").prepare(s, section, paragraph, start, end) catch |err| switch (err) {
            error.ProtectedFieldRange => return error.ProtectedFieldRange,
            error.UnsupportedInlineControl, error.UnsupportedParagraphControl => null,
            else => return err,
        };
        if (existing) |plan| {
            plan.deinit(a);
            return null;
        }
    }
    _ = try @import("inherited_field_identity.zig").validate(s, section, paragraph, &lease.source.report, lease.source.fields, frames);
    const locations = try @import("paragraph_structure_locations.zig").build(a, &part.tree, row);
    defer a.free(locations);
    const segments = try @import("anchor_text_positions.zig").buildForFieldText(a, &part.tree, &row.sites, locations, 1);
    errdefer a.free(segments);
    const Span = @import("field_current_spans.zig").Span;
    var spans: std.ArrayList(Span) = .empty;
    defer spans.deinit(a);
    for (lease.source.fields) |f| {
        if (@import("field_text_positions.zig").project(f, section, segments)) |span| try spans.append(a, .{ .begin_element = lease.source.report.markers[f.begin_marker].element_index, .paragraph_index = 0, .start = span.start_unit, .end = span.end_unit });
    }
    if (spans.items.len == 0) {
        a.free(segments);
        return null;
    }
    if (action == .formula_split) return error.UnsupportedStructuralFieldEdit;
    try @import("field_outside_range.zig").validate(spans.items, 0, start, end - start);
    for (segments) |segment| {
        if (segment.kind == .text or segment.kind == .anchor) continue;
        try P.validateInlineUnit(&part.tree, segment);
    }
    try P.validateRange(segments, start, end);
    try P.validateBoundary(&row.sites, segments, start);
    try P.validateBoundary(&row.sites, segments, end);
    return segments;
}
