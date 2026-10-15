//! Source exterior positions exclude every linked field, not only editable labels.
const std = @import("std");
const Segment = @import("paragraph_text_positions.zig").Segment;
pub const Action = enum { splice, formula_split, whole_plain, whole_anchored };
pub fn prepare(self: *const @import("editor_session.zig").Session, section_index: usize, paragraph: usize, start: u32, end: u32) !?[]Segment {
    return prepareAction(self, section_index, paragraph, start, end, .splice);
}
pub fn prepareAction(self: *const @import("editor_session.zig").Session, section_index: usize, paragraph: usize, start: u32, end: u32, action: Action) !?[]Segment {
    if (end < start) return error.InvalidTextPosition;
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const section = &self.sections[section_index];
    if (section.structure_values != null) return null;
    const source_paragraph = try section.sourceParagraph(paragraph);
    const has_fields = try @import("source_field_analysis.zig").hasFields(self, section_index);
    if (!has_fields) return null;
    const a = self.allocator;
    const segments = if (action == .whole_anchored)
        try @import("anchor_paragraph_edit.zig").segments(a, &section.tree, &section.sites, section.locations, source_paragraph)
    else if (action == .splice)
        @import("source_field_paragraph_positions.zig").build(self, section_index, paragraph) catch |err| switch (err) {
            error.UnsupportedFieldLabelContent => return error.UnsupportedParagraphControl,
            else => return err,
        }
    else block: {
        try @import("plain_paragraph_policy.zig").validateForCharacterFormat(&section.tree, &section.sites, section.locations, source_paragraph);
        break :block try @import("paragraph_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, source_paragraph);
    };
    errdefer a.free(segments);
    var analysis = try @import("source_field_analysis.zig").leaseForExterior(self);
    defer analysis.deinit(a);
    const report = &analysis.source.report;
    for (report.markers) |marker| {
        if (marker.section_ordinal != section_index or marker.kind != .begin or marker.matched_marker_index != null) continue;
        if (marker.element_index >= section.tree.elements.len) return error.SourceBindingMismatch;
        const envelope = try @import("field_source_scope.zig").forBegin(&section.tree, marker.element_index);
        for (segments) |segment| if (envelope.contains(segment.source_start)) return error.ProtectedFieldRange;
    }
    const fields = analysis.source.fields;
    const Span = @import("field_current_spans.zig").Span;
    const spans = try a.alloc(Span, fields.len);
    defer a.free(spans);
    var count: usize = 0;
    for (fields) |field| if (@import("field_text_positions.zig").project(field, section_index, segments)) |span| {
        if (action == .formula_split and !std.mem.eql(u8, report.markers[field.begin_marker].begin.?.type_raw orelse "", "FORMULA")) continue;
        spans[count] = .{ .begin_element = report.markers[field.begin_marker].element_index, .paragraph_index = 0, .start = span.start_unit, .end = span.end_unit };
        count += 1;
    };
    if (count == 0) {
        const owner = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, source_paragraph);
        if (action != .splice or !try @import("paragraph_site_owner.zig").ownsFieldMarker(&section.tree, owner)) {
            a.free(segments);
            return null;
        }
    }
    // A field can begin in an earlier paragraph, outside the local topology.
    if (action == .whole_plain or action == .whole_anchored) return error.ProtectedFieldRange;
    for (segments) |segment| {
        if (segment.kind == .text) continue;
        if (action == .splice and segment.kind == .anchor) continue;
        try @import("paragraph_text_positions.zig").validateInlineUnit(&section.tree, segment);
    }
    if (action == .formula_split) try @import("field_outside_range.zig").validateWholeFieldSplit(spans[0..count], 0, start, end - start) else try @import("field_outside_range.zig").validate(spans[0..count], 0, start, end - start);
    const text = @import("paragraph_text_positions.zig");
    try text.validateRange(segments, start, end);
    try text.validateBoundary(&section.sites, segments, start);
    try text.validateBoundary(&section.sites, segments, end);
    return segments;
}
test "source field exterior positions preserve immutable issue144 and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            const rows = (try prepare(&proxy, 0, 2, 0, 0)) orelse return error.ExpectedExteriorPositions;
            defer allocator.free(rows);
            try std.testing.expect(rows.len != 0);
            try std.testing.expectEqual(@as(usize, 0), rows[0].start_unit);
        }
    }.run, .{&session});
    try std.testing.expectError(error.ProtectedFieldRange, prepare(&session, 0, 2, 7, 7));
    try std.testing.expectError(error.ProtectedFieldRange, prepare(&session, 0, 2, 6, 8));
    try std.testing.expect(session.sections[0].structure_values == null);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
