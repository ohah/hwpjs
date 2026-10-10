//! Derive current calculated widths for an installed marker-owned paragraph.
const std = @import("std");
const boundaries = @import("formula_current_boundaries.zig");

pub fn prepare(session: *const @import("editor_session.zig").Session, trees: []const @import("xml_part_tree.zig").Tree, section: usize, current: *const @import("paragraph_structure_values.zig").Values, index: usize, report: *const @import("field_markers.zig").Report, start: u32, end: u32) !?boundaries.Range {
    const a = session.allocator;
    const row = &current.paragraphs[index];
    const positions = row.field_positions orelse return null;
    if (!@import("formula_marker_kind.zig").owned(report, section, positions)) return null;
    if (row.pieces != null) return error.UnsupportedStructuralFieldEdit;
    const spans = try @import("field_current_spans.zig").buildWholeFormula(a, trees, section, current, report, session.options.max_sites);
    defer a.free(spans);
    var snapshot = try @import("formula_current_snapshot.zig").read(a, session, section);
    defer snapshot.deinit(a);
    var replacements: std.ArrayList(boundaries.Replacement) = .empty;
    defer replacements.deinit(a);
    for (spans) |span| {
        if (span.paragraph_index != index) continue;
        for (snapshot.rows) |formula| {
            if (formula.begin_element != span.begin_element) continue;
            try replacements.append(a, .{ .start = std.math.cast(u32, span.start) orelse return error.LimitExceeded, .end = std.math.cast(u32, span.end) orelse return error.LimitExceeded, .shown_length = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(formula.values.last_result orelse return error.SourceBindingMismatch)) orelse return error.LimitExceeded });
        }
    }
    if (replacements.items.len == 0) return error.SourceBindingMismatch;
    std.mem.sort(boundaries.Replacement, replacements.items, {}, struct {
        fn less(_: void, left: boundaries.Replacement, right: boundaries.Replacement) bool {
            return left.start < right.start;
        }
    }.less);
    const segments = try @import("field_owned_positions.zig").build(a, &trees[section], row);
    defer a.free(segments);
    const length = if (segments.len == 0) 0 else segments[segments.len - 1].end_unit;
    return try boundaries.map(replacements.items, std.math.cast(u32, length) orelse return error.LimitExceeded, start, end);
}
